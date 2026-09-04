import { test } from "node:test";
import assert from "node:assert/strict";
import {
  detectDuplicate,
  minutesApart,
  lineOverlap,
  ticketMoment,
  type CandidateOrder,
  type SubmissionUnderTest,
} from "./duplicate-detection";
import {
  contentFingerprint,
  ocrConfusionDistance,
  looksLikeSameOrderNumber,
  normalizeFingerprintLine,
  type FingerprintLine,
} from "./receipt-fingerprint";
import { hammingDistanceHex, phashFromGrayscale } from "./image-phash";

const RESTO = "kraainem";

// Le ticket de référence : celui qui a été crédité deux fois à Kraainem.
const TICKET: FingerprintLine[] = [
  { name: "Finest (Burger)", quantity: 1, unit_price: 11.5 },
  { name: "Fries (Medium)", quantity: 2, unit_price: 3.2 },
  { name: "Pepsi", quantity: 1, unit_price: 2.5 },
];

function submission(over: Partial<SubmissionUnderTest> = {}): SubmissionUnderTest {
  const amount = over.amount ?? 20.4;
  const items = over.items ?? TICKET;
  return {
    userId: "membre-a",
    orderDate: "2026-08-22",
    orderTime: "13:34",
    amount,
    orderNumber: "2026-08-22/223/08228",
    fingerprint: contentFingerprint({ restaurantId: RESTO, amount, items }),
    imagePhash: null,
    submittedAt: "2026-08-22T13:40:00Z",
    items,
    ...over,
  };
}

function candidate(over: Partial<CandidateOrder> = {}): CandidateOrder {
  const amount = over.amount ?? 20.4;
  const items = over.items ?? TICKET;
  return {
    id: "order-1",
    user_id: "membre-a",
    order_date: "2026-08-22",
    order_time: "13:34",
    amount,
    order_number: "2026-08-22/223/08228",
    content_fingerprint: contentFingerprint({ restaurantId: RESTO, amount, items }).hash,
    image_phash: null,
    submitted_at: "2026-08-22T13:36:00Z",
    items,
    ...over,
  };
}

// ── Cas exigés par la cible ────────────────────────────────────────────────

test("doublon exact — même ticket resoumis à l'identique", () => {
  const v = detectDuplicate(submission(), [candidate()]);
  assert.equal(v.decision, "duplicate");
  // Le numéro identique tranche en premier — c'est le filet historique.
  assert.equal(v.rule, "same_order_number");
  assert.equal(v.matchedOrderId, "order-1");
});

test("doublon avec numéro mal lu — l'empreinte de contenu rattrape l'OCR", () => {
  // …08228 relu …08223 : 8→3 est une confusion connue. Le numéro ne matche
  // plus, l'index UNIQUE de la base laisserait donc passer la commande.
  const v = detectDuplicate(
    submission({ orderNumber: "2026-08-22/223/08223" }),
    [candidate()]
  );
  assert.equal(v.decision, "duplicate");
  assert.equal(v.rule, "fingerprint_time");
});

test("doublon avec numéro mal lu ET heure non lue — la confusion OCR tranche", () => {
  const v = detectDuplicate(
    submission({ orderNumber: "2026-08-22/223/08223", orderTime: null }),
    [candidate({ order_time: null })]
  );
  assert.equal(v.decision, "duplicate");
  assert.equal(v.rule, "fingerprint_number_confusion");
});

test("deux commandes identiques à des HEURES DIFFÉRENTES — légitimes", () => {
  // Le même client revient le soir et recommande exactement la même chose.
  const v = detectDuplicate(
    submission({
      orderTime: "19:12",
      orderNumber: "2026-08-22/223/08402",
      submittedAt: "2026-08-22T19:15:00Z",
    }),
    [candidate()]
  );
  assert.equal(v.decision, "ok");
  assert.equal(v.matchedOrderId, null);
});

test("deux commandes identiques à la même minute par DEUX MEMBRES — à vérifier", () => {
  const v = detectDuplicate(
    submission({ userId: "membre-b", orderNumber: "2026-08-22/223/08229" }),
    [candidate({ user_id: "membre-a" })]
  );
  assert.equal(v.decision, "review");
  assert.equal(v.rule, "cross_user_fingerprint");
});

// ── Les autres signaux ─────────────────────────────────────────────────────

test("même membre, même montant, même heure, sans aucune ligne lue → doublon", () => {
  // L'OCR n'a lu aucun article des deux côtés : l'empreinte est faible, mais la
  // règle « même membre / même heure / même montant en moins de 24 h » tient.
  const v = detectDuplicate(
    submission({ items: [], orderNumber: null }),
    [candidate({ items: [], content_fingerprint: null, order_number: null })]
  );
  assert.equal(v.decision, "duplicate");
  assert.equal(v.rule, "same_user_time_amount");
});

test("même montant et même heure mais plus de 24 h après → pas de doublon", () => {
  const v = detectDuplicate(
    submission({
      items: [],
      orderNumber: null,
      orderDate: "2026-08-24",
      submittedAt: "2026-08-24T13:40:00Z",
    }),
    [candidate({ items: [], content_fingerprint: null, order_number: null })]
  );
  assert.equal(v.decision, "ok");
});

test("photos quasi identiques du même membre en moins de 24 h → doublon", () => {
  const v = detectDuplicate(
    submission({
      // Contenu et heure différents (l'OCR a mal lu), seule l'image rapproche.
      items: [{ name: "Finest", quantity: 1, unit_price: 11.5 }],
      amount: 11.5,
      orderTime: "13:58",
      orderNumber: null,
      imagePhash: "f0e1d2c3b4a59687",
    }),
    [candidate({ order_number: null, image_phash: "f0e1d2c3b4a59686" })]
  );
  assert.equal(v.decision, "duplicate");
  assert.equal(v.rule, "image_phash");
});

test("photos seulement ressemblantes → à vérifier, jamais un rejet", () => {
  const v = detectDuplicate(
    submission({
      items: [{ name: "Finest", quantity: 1, unit_price: 11.5 }],
      amount: 11.5,
      orderTime: "13:58",
      orderNumber: null,
      imagePhash: "f0e1d2c3b4a59687",
    }),
    [candidate({ order_number: null, image_phash: "f0e1d2c3b4a5f0f0" })]
  );
  assert.equal(v.decision, "review");
  assert.equal(v.rule, "image_phash_far");
});

test("empreinte proche mais non identique (une ligne manquée) → à vérifier", () => {
  const partiel: FingerprintLine[] = [
    { name: "Finest (Burger)", quantity: 1, unit_price: 11.5 },
    { name: "Fries (Medium)", quantity: 2, unit_price: 3.2 },
  ];
  const v = detectDuplicate(
    submission({ userId: "membre-b", items: partiel, orderNumber: null }),
    [candidate({ user_id: "membre-a", order_number: null })]
  );
  assert.equal(v.decision, "review");
  assert.equal(v.rule, "near_fingerprint");
});

test("deux tickets réellement différents à la même minute → rien", () => {
  const autre: FingerprintLine[] = [{ name: "Kebab Wrap", quantity: 1, unit_price: 9.9 }];
  const v = detectDuplicate(
    submission({ userId: "membre-b", items: autre, amount: 9.9, orderNumber: null }),
    [candidate({ user_id: "membre-a", order_number: null })]
  );
  assert.equal(v.decision, "ok");
});

test("le verdict le plus sévère l'emporte, quel que soit l'ordre des candidats", () => {
  const innocent = candidate({
    id: "order-innocent",
    user_id: "membre-b",
    order_time: "09:00",
    order_number: "2026-08-22/223/07001",
    items: [{ name: "Kebab Wrap", quantity: 1, unit_price: 9.9 }],
    amount: 9.9,
    content_fingerprint: contentFingerprint({
      restaurantId: RESTO,
      amount: 9.9,
      items: [{ name: "Kebab Wrap", quantity: 1, unit_price: 9.9 }],
    }).hash,
  });
  const v = detectDuplicate(submission({ orderNumber: "2026-08-22/223/08223" }), [
    innocent,
    candidate(),
  ]);
  assert.equal(v.decision, "duplicate");
  assert.equal(v.matchedOrderId, "order-1");
});

test("aucun candidat → rien, et jamais d'exception", () => {
  assert.equal(detectDuplicate(submission(), []).decision, "ok");
});

// ── Empreinte ──────────────────────────────────────────────────────────────

test("l'empreinte ignore l'ordre des lignes", () => {
  const a = contentFingerprint({ restaurantId: RESTO, amount: 20.4, items: TICKET });
  const b = contentFingerprint({
    restaurantId: RESTO,
    amount: 20.4,
    items: [...TICKET].reverse(),
  });
  assert.equal(a.hash, b.hash);
});

test("l'empreinte ignore casse, accents et ponctuation du libellé", () => {
  const a = contentFingerprint({
    restaurantId: RESTO,
    amount: 5,
    items: [{ name: "Crème Brûlée", quantity: 1, unit_price: 5 }],
  });
  const b = contentFingerprint({
    restaurantId: RESTO,
    amount: 5,
    items: [{ name: "  CREME   BRULEE ", quantity: 1, unit_price: 5 }],
  });
  assert.equal(a.hash, b.hash);
});

test("l'empreinte sépare deux établissements et deux montants", () => {
  const base = { amount: 20.4, items: TICKET };
  assert.notEqual(
    contentFingerprint({ restaurantId: "kraainem", ...base }).hash,
    contentFingerprint({ restaurantId: "houba", ...base }).hash
  );
  assert.notEqual(
    contentFingerprint({ restaurantId: RESTO, amount: 20.4, items: TICKET }).hash,
    contentFingerprint({ restaurantId: RESTO, amount: 20.5, items: TICKET }).hash
  );
});

test("une empreinte sans ligne d'article est marquée faible", () => {
  const f = contentFingerprint({ restaurantId: RESTO, amount: 20.4, items: [] });
  assert.equal(f.weak, true);
  assert.equal(f.lineCount, 0);
  assert.equal(contentFingerprint({ restaurantId: RESTO, amount: 20.4, items: TICKET }).weak, false);
});

test("une ligne au libellé vide est écartée sans casser l'empreinte", () => {
  assert.equal(normalizeFingerprintLine({ name: "   ", quantity: 1, unit_price: 1 }), null);
  const f = contentFingerprint({
    restaurantId: RESTO,
    amount: 5,
    items: [{ name: "", quantity: 1, unit_price: 1 }, { name: "Pepsi", quantity: 1, unit_price: 2.5 }],
  });
  assert.equal(f.lineCount, 1);
});

// ── Confusions OCR ─────────────────────────────────────────────────────────

test("les paires de confusion connues sont reconnues", () => {
  assert.equal(ocrConfusionDistance("08228", "08223"), 1); // 8 ↔ 3
  assert.equal(ocrConfusionDistance("10", "70"), 1); // 1 ↔ 7
  assert.equal(ocrConfusionDistance("56", "65"), 2); // 5↔6 et 6↔5
  assert.equal(ocrConfusionDistance("08228", "08228"), 0);
});

test("un écart hors paires connues n'est pas une confusion", () => {
  assert.equal(ocrConfusionDistance("08228", "08229"), null); // 8 ↔ 9
  assert.equal(ocrConfusionDistance("08228", "08224"), null); // 8 ↔ 4
});

test("des longueurs différentes ne sont jamais une confusion", () => {
  assert.equal(ocrConfusionDistance("0822", "08228"), null);
  assert.equal(ocrConfusionDistance(null, "08228"), null);
});

test("les séparateurs doivent correspondre exactement", () => {
  assert.equal(ocrConfusionDistance("2026-08-22/223/08228", "2026-08-22/223/08223"), 1);
  assert.equal(ocrConfusionDistance("2026-08-22/223/08228", "2026-08-22:223/08228"), null);
});

test("looksLikeSameOrderNumber borne le nombre de substitutions", () => {
  assert.equal(looksLikeSameOrderNumber("08228", "08223"), true);
  assert.equal(looksLikeSameOrderNumber("00000", "88888"), false); // 5 substitutions
  assert.equal(looksLikeSameOrderNumber("08228", "08228"), true);
});

// ── Temps ──────────────────────────────────────────────────────────────────

test("l'écart d'heures traverse minuit correctement", () => {
  assert.equal(minutesApart("2026-08-22", "23:59", "2026-08-23", "00:01"), 2);
});

test("une heure absente ou illisible ne se devine pas", () => {
  assert.equal(minutesApart("2026-08-22", null, "2026-08-22", "13:34"), null);
  assert.equal(ticketMoment("2026-08-22", "25:00"), null);
  assert.equal(ticketMoment("22/08/2026", "13:34"), null);
});

test("les secondes du type TIME de Postgres sont acceptées", () => {
  assert.equal(minutesApart("2026-08-22", "13:34:00", "2026-08-22", "13:36:00"), 2);
});

// ── Recoupement de lignes ──────────────────────────────────────────────────

test("le recoupement de lignes est un indice de Jaccard", () => {
  assert.equal(lineOverlap(TICKET, TICKET), 1);
  assert.equal(lineOverlap(TICKET, undefined), null);
  assert.equal(lineOverlap(TICKET, []), null);
  const deux = TICKET.slice(0, 2);
  assert.equal(lineOverlap(TICKET, deux), 2 / 3);
});

// ── pHash ──────────────────────────────────────────────────────────────────

test("la distance de Hamming compte les bits différents", () => {
  assert.equal(hammingDistanceHex("0000000000000000", "0000000000000000"), 0);
  assert.equal(hammingDistanceHex("0000000000000000", "0000000000000001"), 1);
  assert.equal(hammingDistanceHex("0000000000000000", "ffffffffffffffff"), 64);
});

test("un hachage invalide ne produit jamais une fausse ressemblance", () => {
  assert.equal(hammingDistanceHex("zzzz", "0000000000000000"), null);
  assert.equal(hammingDistanceHex(null, "0000000000000000"), null);
  assert.equal(hammingDistanceHex("000", "0000000000000000"), null);
});

test("le pHash rend 16 caractères hexadécimaux, de façon déterministe", () => {
  const N = 32;
  const pixels = new Uint8Array(N * N);
  for (let i = 0; i < pixels.length; i++) pixels[i] = (i * 37) % 256;
  const h = phashFromGrayscale(pixels);
  assert.equal(typeof h, "string");
  assert.match(h!, /^[0-9a-f]{16}$/);
  assert.equal(h, phashFromGrayscale(pixels));
});

// La propriété qui compte vraiment — deux photos du même ticket se ressemblent,
// deux tickets différents non — se vérifie sur de VRAIES images passées par le
// même pipeline qu'en production (sharp) : voir lib/image-phash-server.test.ts.
// La tester ici sur des motifs synthétiques donnerait un résultat qui dépend du
// motif choisi, pas de l'algorithme.

test("un tampon de mauvaise taille ne produit pas de hachage", () => {
  assert.equal(phashFromGrayscale(new Uint8Array(10)), null);
});
