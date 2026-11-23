import assert from "node:assert/strict";
import { test } from "node:test";
import {
  CARD_REASONS, OUTAGE_REASONS, READY_FORGOTTEN_MINUTES, REFUSAL_THRESHOLD, REFUSAL_WINDOW_HOURS, RESCUE_REASON, WAITING_MINUTES,
  computeAlerts, refusalsSince,
} from "./nina-alerts";
import { RESCUE_EVENTS } from "./rescue";
import { LOGIN_REQUIRED } from "./account";
import type { OrderView } from "./service";

const NOW = Date.parse("2026-11-23T14:00:00.000Z");
const ago = (min: number) => new Date(NOW - min * 60000).toISOString();
const order = (id: string, status: OrderView["status"], createdMin: number, o: Partial<OrderView> = {}): OrderView => ({
  id, number: id.padStart(4, "0"), firstName: `Client${id}`, phone: null, lines: [], totalCents: 1000, status,
  createdAt: ago(createdMin), readyAt: null, pickedUpAt: null, cancelledAt: null, cancelReason: null, ...o,
});
const alerts = (orders: OrderView[], refusals: Record<string, number> = {}) => computeAlerts({ orders, refusals, now: NOW });
const ids = (a: { id: string }[]) => a.map((x) => x.id);

test("rien à signaler : une liste vide, jamais un « tout va bien » inventé", () => {
  assert.deepEqual(alerts([]), []);
  assert.deepEqual(alerts([order("1", "recue", 3), order("2", "prete", 30, { readyAt: ago(20) }), order("3", "retiree", 300)]), []);
});

test("une commande « reçue » trop longtemps sans être « prête » : danger, avec le nom du client et ce qu'il y a à faire", () => {
  const a = alerts([order("147", "recue", WAITING_MINUTES + 4)]);
  assert.deepEqual(ids(a), ["commande_en_attente"]);
  assert.equal(a[0].tone, "danger");
  assert.match(a[0].title, /attend depuis 14 minutes/);
  assert.match(a[0].detail, /N° 0147 \(Client147\)/);
  assert.match(a[0].detail, /« prête »/);
  // pile au seuil : on prévient ; une minute avant : non
  assert.equal(alerts([order("1", "recue", WAITING_MINUTES)]).length, 1);
  assert.equal(alerts([order("1", "recue", WAITING_MINUTES - 1)]).length, 0);
});

test("plusieurs commandes en attente : un seul message, les plus anciennes nommées, jamais une liste interminable", () => {
  const many = ["1", "2", "3", "4", "5"].map((id, i) => order(id, "recue", 60 - i * 5));
  const a = alerts(many);
  assert.equal(a.length, 1);
  assert.match(a[0].title, /^5 commandes attendent depuis plus de 10 minutes/);
  assert.match(a[0].detail, /et 2 autres/);
  assert.ok(a[0].detail.indexOf("0001") < a[0].detail.indexOf("0002")); // la plus ancienne d'abord
});

test("une commande préparée, retirée ou annulée n'attend plus", () => {
  assert.deepEqual(alerts([order("1", "prete", 90, { readyAt: ago(10) }), order("2", "annulee", 90), order("3", "retiree", 90)]), []);
});

test("une commande « prête » jamais retirée : à regarder, et le message dit que les points du client en dépendent", () => {
  const a = alerts([order("9", "prete", 300, { readyAt: ago(READY_FORGOTTEN_MINUTES + 1) })]);
  assert.deepEqual(ids(a), ["commande_oubliee"]);
  assert.equal(a[0].tone, "warn");
  assert.match(a[0].detail, /points/);
  // le délai se compte depuis « prête », pas depuis l'envoi
  assert.equal(alerts([order("9", "prete", 300, { readyAt: ago(READY_FORGOTTEN_MINUTES - 1) })]).length, 0);
  // sans heure « prête » lisible, on retombe sur l'heure d'envoi
  assert.equal(alerts([order("9", "prete", READY_FORGOTTEN_MINUTES + 5)]).length, 1);
});

test("le secours WhatsApp : dès le premier envoi échoué, et il dit que rien n'est enregistré", () => {
  const a = alerts([], { [RESCUE_REASON]: 1 });
  assert.deepEqual(ids(a), ["secours_whatsapp"]);
  assert.equal(a[0].tone, "warn");
  assert.match(a[0].title, /Un envoi a échoué/);
  assert.match(a[0].detail, /rien n'est enregistré/);
  assert.match(alerts([], { [RESCUE_REASON]: 4 })[0].title, /^4 envois ont échoué/);
});

test("les refus de panne : danger à partir du seuil, pas avant", () => {
  const below = alerts([], { indisponible: REFUSAL_THRESHOLD - 1 });
  assert.deepEqual(below, []);
  const a = alerts([], { indisponible: REFUSAL_THRESHOLD });
  assert.deepEqual(ids(a), ["panne"]);
  assert.equal(a[0].tone, "danger");
  assert.match(a[0].title, new RegExp(`${REFUSAL_WINDOW_HOURS} dernières heures`));
});

test("les refus de carte (plat disparu, choix impossible, plafond) s'additionnent, à partir du seuil", () => {
  assert.deepEqual(alerts([], { plat_indisponible: 1, choix_invalide: 1 }), []);
  const a = alerts([], { plat_indisponible: 1, choix_invalide: 1, plafond: 1 });
  assert.deepEqual(ids(a), ["clients_bloques"]);
  assert.match(a[0].title, /^3 commandes ont été refusées/);
});

test("ce qui ne dit rien de grave ne déclenche JAMAIS d'alerte : erreur de saisie du client, limite par adresse, connexion demandée", () => {
  const noise = { forme: 50, prenom: 50, telephone: 50, trop_de_lignes: 50, quantite: 50, limite: 50, [LOGIN_REQUIRED.reason]: 50, ferme: 50 };
  assert.deepEqual(alerts([], noise), []);
});

test("les alertes les plus graves passent devant, une commande qui attend avant le reste", () => {
  const a = alerts(
    [order("1", "prete", 400, { readyAt: ago(200) }), order("2", "recue", 30)],
    { [RESCUE_REASON]: 2, indisponible: 5, plat_inconnu: 9 },
  );
  assert.deepEqual(ids(a), ["commande_en_attente", "panne", "commande_oubliee", "secours_whatsapp", "clients_bloques"]);
  assert.deepEqual(a.map((x) => x.tone), ["danger", "danger", "warn", "warn", "warn"]);
});

test("la signature change quand l'alerte s'aggrave : un « J'ai vu » ne vaut que pour ce qu'il a vu", () => {
  const one = alerts([order("1", "recue", 20)])[0];
  const same = alerts([order("1", "recue", 35)])[0];
  const two = alerts([order("1", "recue", 20), order("2", "recue", 20)])[0];
  assert.equal(one.signature, same.signature); // la même commande qui attend plus longtemps : la même alerte
  assert.notEqual(one.signature, two.signature); // une deuxième commande : une alerte qui revient
  assert.notEqual(alerts([], { [RESCUE_REASON]: 1 })[0].signature, alerts([], { [RESCUE_REASON]: 2 })[0].signature);
});

test("les motifs lus sont ceux que le reste du code écrit (un motif renommé d'un côté ne doit pas éteindre l'alerte)", () => {
  assert.equal(RESCUE_REASON, RESCUE_EVENTS.propose);
  for (const r of [...OUTAGE_REASONS, ...CARD_REASONS, RESCUE_REASON]) assert.ok(r.length >= 1 && r.length <= 60, r);
  const all = [...OUTAGE_REASONS, ...CARD_REASONS, RESCUE_REASON] as string[];
  assert.equal(new Set(all).size, all.length); // aucun motif compté dans deux alertes
});

test("refusalsSince : douze heures avant l'instant donné", () => {
  assert.equal(refusalsSince(new Date(NOW)), "2026-11-23T02:00:00.000Z");
});
