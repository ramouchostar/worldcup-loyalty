import assert from "node:assert/strict";
import { test } from "node:test";
import { buildTickets, type TicketLine, type TicketOrder } from "../menu-options/tickets";
import type { SelectionLine } from "../menu-options/types";
import { DEFAULT_DEVICE_ID, causeOf, eposDocument, parseSdpResult, sdpPrintResponse } from "./epson";
import { COLUMNS_58MM, COLUMNS_80MM, paperLines, previewText, printable, wrap, type PaperLine } from "./paper";

const sel = (kind: SelectionLine["kind"], group: string, name: string, qty = 1): SelectionLine => ({ kind, group, name, qty, cents: 0 });
const line = (name: string, zone: string | null, cents: number, details: SelectionLine[] = [], qty = 1): TicketLine => ({ name, qty, zone, cents, details });
const order: TicketOrder = {
  number: "0147", firstName: "Amina", pickup: "12:40",
  lines: [
    line("Menu Tenders", "Grill", 2190, [sel("inclus", "Sauces", "Samouraï"), sel("extra", "Suppléments", "Fromage", 2), sel("sans", "Crudités", "Oignons")], 2),
    line("Bucket familial 12 pièces avec quatre accompagnements au choix", "Grill", 3450),
  ],
};
const [single] = buildTickets(order, { split: false, cashier: false });

test("printable : les accents restent, les signes typographiques et les emojis sont remplacés ou retirés", () => {
  assert.equal(printable("Bœuf « maison » – l’original… 🍟"), 'Boeuf " maison " - l\'original...');
  assert.equal(printable("Pâtes à l'ail · Crème brûlée"), "Pâtes à l'ail - Crème brûlée");
  assert.equal(printable("A\u00a0B\u202fC\u2009D\u2007E\u0007F\nG"), "A B C D E F G");
  assert.equal(printable("2× FRITES 3,50 €"), "2× FRITES 3,50 €");
});

test("wrap : coupe aux espaces, décale la suite, coupe un mot trop long au lieu de le perdre", () => {
  assert.deepEqual(wrap("un deux trois quatre", 9), ["un deux", "trois", "quatre"]);
  assert.deepEqual(wrap("un deux trois", 8, 2), ["un deux", "  trois"]);
  assert.deepEqual(wrap("abcdefghij", 4), ["abcd", "efgh", "ij"]);
  assert.deepEqual(wrap("", 10), []);
});

test("chaque ticket s'ouvre par « COMMANDE DU SITE » : il ne se confond pas avec un ticket de livraison", () => {
  const tickets = buildTickets(order, { split: true, cashier: true });
  assert.ok(tickets.length > 1);
  for (const columns of [COLUMNS_80MM, COLUMNS_58MM]) {
    for (const t of tickets) {
      assert.deepEqual(paperLines(t, columns).slice(0, 2), [
        { text: "COMMANDE DU SITE", width: 1, height: 2, bold: true, align: "center" },
        { text: "À retirer et payer au comptoir", width: 1, height: 1, bold: false, align: "center" },
      ]);
    }
  }
});

test("le prénom est en double largeur et double hauteur, en gras et centré, sur chaque ticket", () => {
  for (const t of buildTickets(order, { split: true, cashier: true })) {
    const name = paperLines(t).find((l) => l.text === "Amina");
    assert.deepEqual(name, { text: "Amina", width: 2, height: 2, bold: true, align: "center" });
  }
});

test("« SANS OIGNONS » sort en entier, en gras et en double hauteur ; le plat avec sa quantité", () => {
  const lines = paperLines(single);
  const without = lines.find((l) => l.text.trim() === "SANS OIGNONS");
  assert.ok(without && without.bold && without.height === 2);
  assert.ok(lines.some((l) => l.text === "2× MENU TENDERS" && l.bold && l.height === 2));
});

test("aucune ligne ne dépasse le papier, en 80 mm comme en 58 mm, même avec un long nom et un long prénom", () => {
  const long: TicketOrder = { ...order, firstName: "Marie-Christine Vanderstraeten", lines: [line("Supercalifragilisticexpialidocious".repeat(3), null, 100, [sel("sans", "g", "x".repeat(80))])] };
  for (const columns of [COLUMNS_80MM, COLUMNS_58MM]) {
    for (const t of [...buildTickets(order, { split: true, cashier: true }), ...buildTickets(long, { split: false, cashier: false })]) {
      for (const l of paperLines(t, columns)) assert.ok(l.text.length * l.width <= columns, `${columns} : « ${l.text} » (×${l.width})`);
    }
  }
});

test("rien n'est perdu en coupant : toutes les lettres d'un long nom sont sur le ticket", () => {
  const text = paperLines(single, COLUMNS_58MM).map((l) => l.text.trim()).join(" ");
  for (const word of "BUCKET FAMILIAL 12 PIÈCES AVEC QUATRE ACCOMPAGNEMENTS AU CHOIX".split(" ")) assert.ok(text.includes(word), word);
});

test("la somme à payer figure sur le ticket de caisse, jamais sur un ticket de coin", () => {
  const [zone, cashier] = buildTickets(order, { split: true, cashier: true });
  assert.ok(!paperLines(zone).some((l) => l.text.includes("€")));
  assert.deepEqual(paperLines(cashier).slice(-2).map((l) => l.text), ["À PAYER AU COMPTOIR", "56,40 €"]);
});

test("l'aperçu texte montre le ticket sans imprimante", () => {
  const preview = previewText(paperLines(single));
  assert.match(preview, /A m i n a/);
  assert.match(preview, /SANS OIGNONS/);
  assert.match(preview, /5 6 , 4 0/);
});

const one: PaperLine[] = [{ text: `Fish & chips <maison> "L'ami"`, width: 1, height: 2, bold: true, align: "left" }];

test("le document Epson : langue UTF-8, style complet par ligne, texte échappé, coupe à la fin", () => {
  assert.equal(
    eposDocument(one),
    '<epos-print xmlns="http://www.epson-pos.com/schemas/2011/03/epos-print"><text lang="mul"/><text align="left" width="1" height="2" em="true"/><text>Fish &amp; chips &lt;maison&gt; &quot;L&apos;ami&quot;&#10;</text><feed line="3"/><cut type="feed"/></epos-print>',
  );
});

test("rien à imprimer : aucune réponse (la route renverra un corps vide)", () => {
  assert.equal(sdpPrintResponse([]), null);
});

test("la réponse d'impression porte chaque tirage avec son numéro, version 2.00", () => {
  const xml = sdpPrintResponse([{ id: "t1", document: eposDocument(one) }, { id: "t2", document: eposDocument(one) }])!;
  assert.ok(xml.startsWith('<?xml version="1.0" encoding="utf-8"?><PrintRequestInfo Version="2.00">'));
  assert.equal(xml.match(/<ePOSPrint>/g)?.length, 2);
  assert.ok(xml.includes(`<devid>${DEFAULT_DEVICE_ID}</devid><timeout>10000</timeout><printjobid>t1</printjobid>`));
  assert.ok(xml.includes("<printjobid>t2</printjobid>"));
  assert.ok(xml.endsWith("</PrintRequestInfo>"));
});

test("un numéro de tirage qui casserait le XML est refusé", () => {
  assert.throws(() => sdpPrintResponse([{ id: "a<b", document: "" }]), /invalide/);
  assert.throws(() => sdpPrintResponse([{ id: "x".repeat(31), document: "" }]), /invalide/);
});

const result = (jobId: string, response: string) => `<ePOSPrint><Parameter><devid>local_printer</devid><printjobid>${jobId}</printjobid></Parameter><PrintResponse>${response}</PrintResponse></ePOSPrint>`;
const file = (...blocks: string[]) => `<?xml version="1.0" encoding="UTF-8"?><PrintResponseInfo Version="2.00">${blocks.join("")}</PrintResponseInfo>`;
const ok = '<response xmlns="http://www.epson-pos.com/schemas/2011/03/epos-print" success="true" code="" status="251658262" battery="0"/>';
const noPaper = '<response success="false" code="EPTR_REC_EMPTY" status="252641308" battery="0" />';

test("le résultat : imprimé ou non, tirage par tirage, avec la cause", () => {
  assert.deepEqual(parseSdpResult(file(result("t1", ok), result("t2", noPaper))), [
    { jobId: "t1", printed: true, code: "" },
    { jobId: "t2", printed: false, code: "EPTR_REC_EMPTY" },
  ]);
});

test("une réponse illisible n'est jamais un succès", () => {
  assert.deepEqual(parseSdpResult(""), []);
  assert.deepEqual(parseSdpResult("<html>erreur</html>"), []);
  assert.deepEqual(parseSdpResult(file(result("t1", ""))), [{ jobId: "t1", printed: false, code: "" }]);
  assert.deepEqual(parseSdpResult(file(result("t1", '<response success="TRUE"/>'))), [{ jobId: "t1", printed: false, code: "" }]);
  assert.deepEqual(parseSdpResult(file(result("", ok))), []);
});

test("les causes réglables se disent en clair ; un code inconnu reste visible", () => {
  assert.equal(causeOf("EPTR_REC_EMPTY"), "Plus de papier");
  assert.equal(causeOf("EPTR_COVER_OPEN"), "Capot ouvert");
  assert.equal(causeOf("SchemaError"), "Impression refusée (SchemaError)");
  assert.equal(causeOf(""), "Impression refusée");
});
