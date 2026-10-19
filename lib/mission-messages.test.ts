import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { BODY_ISSUE_TEXT, LOCKED_NOTICE, MAX_BODY, MAX_PER_HOUR, NOTIFY_EVERY_MINUTES, SEND_VERDICT_TEXT, canWrite, contactsUnlocked, judgeSend, maskContacts, sanitizeBody, shouldNotify, validateBody } from "./mission-messages";
import { MISSION_STATUSES } from "./mission-states";
import { missionUpdateEmail } from "./email-templates/mission-update";

const mask = (s: string) => maskContacts(s);

// ── le masquage ──
test("les numéros de téléphone sont masqués, dans leurs écritures courantes (belges et internationales)", () => {
  for (const n of ["0470 12 34 56", "0470/12.34.56", "+32 470 12 34 56", "+32470123456", "0032 470 12 34 56", "02 345 67 89", "(02) 345 67 89", "0470-12-34-56", "0470123456", "+33 6 12 34 56 78", "+1 (415) 555-0132"]) {
    const r = mask(`Appelle-moi au ${n} demain`);
    assert.equal(r.masked, true, n);
    assert.equal(r.text, "Appelle-moi au [numéro masqué] demain", n);
    assert.equal(r.found.phones, 1, n);
  }
});

test("ce qui ressemble à un numéro sans en être un reste lisible : prix, dates, heures, quantités", () => {
  for (const t of ["Le menu coûte 12,50 € pour 250 exemplaires.", "Tournage le 2026-11-10 à 10:30.", "On se voit le 10/11/2026 à 12h30.", "Budget : 1 250 € ou 1 250,50 €.", "Format A4, 250 g, 4 plats, 12 personnes.", "Le 10.11.2026 vers 14.30.", "Commande 2026 : 1 500 flyers et 300 menus."]) {
    const r = mask(t);
    assert.equal(r.masked, false, t);
    assert.equal(r.text, t);
  }
});

test("les adresses e-mail sont masquées, y compris celles qu'on écrit pour échapper au filtre", () => {
  for (const e of ["nour@monrestaurant.be", "nour.dupont+menu@mon-restaurant.co.uk", "nour (at) monrestaurant (dot) be", "nour [at] monrestaurant [dot] be", "nour @ monrestaurant . be"]) {
    const r = mask(`Écris-moi : ${e} merci`);
    assert.equal(r.masked, true, e);
    assert.equal(r.found.emails, 1, e);
    assert.match(r.text, /\[e-mail masqué\]/, e);
    assert.doesNotMatch(r.text, /monrestaurant/, e);
  }
});

test("les liens de messagerie sont masqués ; un lien ordinaire (un exemple, une épreuve) reste", () => {
  for (const l of ["https://wa.me/32470123456", "wa.me/32470123456", "https://api.whatsapp.com/send?phone=32470123456", "https://t.me/monpseudo", "https://m.me/mapage", "https://signal.me/#p/abc", "https://chat.whatsapp.com/AbCdEf"]) {
    const r = mask(`Écris-moi sur ${l} stp`);
    assert.equal(r.masked, true, l);
    assert.doesNotMatch(r.text, /wa\.me|whatsapp|t\.me|m\.me|signal|32470/, l);
  }
  const ok = "Voici un exemple : https://www.instagram.com/reel/abc123/ et l'épreuve https://drive.google.com/file/d/XYZ/view";
  assert.deepEqual(mask(ok), { text: ok, masked: false, found: { emails: 0, phones: 0, links: 0 } });
});

test("plusieurs contacts dans un message : tous masqués et comptés", () => {
  const r = mask("Mon mail nour@mon.be, mon numéro 0470 12 34 56, ou https://wa.me/32470123456 !");
  assert.deepEqual(r.found, { emails: 1, phones: 1, links: 1 });
  assert.equal(r.text, "Mon mail [e-mail masqué], mon numéro [numéro masqué], ou [lien de messagerie masqué] !");
  assert.equal(mask("").masked, false);
});

// ── quand ──
test("on écrit de l'envoi du brief à la fin ; une mission annulée ou versée se lit seulement", () => {
  assert.equal(canWrite("brief"), false); // le prestataire n'en a pas encore connaissance
  for (const s of ["envoye", "devis", "accepte", "date_bloquee", "production", "livre", "retouche", "valide", "litige", "suspendu"]) assert.equal(canWrite(s), true, s);
  for (const s of ["annule", "verse"]) assert.equal(canWrite(s), false, s);
  for (const s of MISSION_STATUSES) assert.equal(typeof canWrite(s), "boolean");
});

test("les contacts se révèlent quand le travail commence, jamais avant", () => {
  for (const s of ["brief", "envoye", "devis", "accepte", "date_bloquee", "suspendu"]) assert.equal(contactsUnlocked(s), false, s);
  for (const s of ["production", "livre", "retouche", "valide", "verse", "litige"]) assert.equal(contactsUnlocked(s), true, s);
});

test("une limite d'envoi par heure, et une mission fermée refuse", () => {
  assert.equal(judgeSend("production", 0), "ok");
  assert.equal(judgeSend("production", MAX_PER_HOUR - 1), "ok");
  assert.equal(judgeSend("production", MAX_PER_HOUR), "rate_limited");
  assert.equal(judgeSend("annule", 0), "closed");
  assert.equal(judgeSend("annule", 999), "closed");
  for (const t of Object.values(SEND_VERDICT_TEXT)) assert.ok(t.length > 20);
});

// ── le texte ──
test("le message est nettoyé : sauts de ligne, espaces, longueur", () => {
  assert.equal(sanitizeBody({ body: "  Bonjour  \r\n\r\n\r\n\r\nMerci   \n" }), "Bonjour\n\nMerci");
  assert.equal(sanitizeBody({ body: 42 }), "");
  assert.equal(sanitizeBody(null), "");
  assert.ok(sanitizeBody({ body: "x".repeat(5000) }).length <= MAX_BODY + 1);
  assert.equal(validateBody(""), "empty");
  assert.equal(validateBody("ok"), null);
  assert.equal(validateBody("x".repeat(MAX_BODY)), null);
  assert.equal(validateBody("x".repeat(MAX_BODY + 1)), "too_long");
  for (const t of Object.values(BODY_ISSUE_TEXT)) assert.ok(t.length > 10);
});

// ── prévenir l'autre ──
test("un e-mail seulement si rien n'est lu, et pas plus d'un toutes les 30 minutes", () => {
  const at = "2026-10-20T10:00:00.000Z";
  const n = (over: Partial<Parameters<typeof shouldNotify>[0]>) => shouldNotify({ lastReadAt: null, lastNotifiedAt: null, messageAt: at, now: new Date("2026-10-20T10:00:05Z"), ...over });
  assert.equal(n({}), true); // jamais lu, jamais prévenu
  assert.equal(n({ lastReadAt: "2026-10-20T10:05:00.000Z" }), false); // lu depuis
  assert.equal(n({ lastReadAt: "2026-10-20T09:00:00.000Z" }), true); // lu AVANT ce message
  assert.equal(n({ lastNotifiedAt: "2026-10-20T09:50:00.000Z" }), false); // prévenu il y a 10 minutes
  assert.equal(n({ lastNotifiedAt: "2026-10-20T09:30:00.000Z", now: new Date("2026-10-20T10:01:00Z") }), true); // plus de 30 minutes
  assert.equal(NOTIFY_EVERY_MINUTES, 30);
});

test("l'e-mail de nouveau message ne dit rien du contenu et ne contient aucun montant", () => {
  const base = { kind: "message_received" as const, restaurantName: "Chez Nour", providerName: "Studio Croustille", url: "https://www.boosteats.be/x" };
  const toProvider = missionUpdateEmail({ ...base, audience: "provider" });
  const toRestaurant = missionUpdateEmail({ ...base, audience: "restaurant" });
  assert.match(toProvider.subject, /Chez Nour t'a écrit/);
  assert.match(toRestaurant.subject, /Studio Croustille t'a écrit/);
  for (const m of [toProvider, toRestaurant]) {
    assert.ok(m.html.includes(base.url) && m.text.includes(base.url));
    assert.doesNotMatch(m.subject + m.text, /€|euro/i);
    assert.doesNotMatch(m.html, /undefined|\[object/);
  }
  assert.ok(LOCKED_NOTICE.length > 60);
});

// ── la migration ──
test("la migration : messages, original gardé seulement si masqué, lecture par partie", () => {
  const sql = readFileSync("docs/migrations/20261020-1000-prestataires-messagerie.sql", "utf8");
  assert.match(sql, /sender\s+TEXT NOT NULL CHECK \(sender IN \('restaurant', 'provider', 'platform'\)\)/);
  assert.match(sql, /CHECK \(\(body_original IS NOT NULL\) = masked\)/);
  assert.match(sql, /reader\s+TEXT NOT NULL CHECK \(reader IN \('restaurant', 'provider'\)\)/);
  assert.match(sql, /PRIMARY KEY \(mission_id, reader\)/);
  assert.equal((sql.match(/ENABLE ROW LEVEL SECURITY/g) ?? []).length, 2);
  assert.doesNotMatch(sql, /CREATE POLICY/);
});
