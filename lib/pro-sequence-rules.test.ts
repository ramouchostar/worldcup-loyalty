import { test } from "node:test";
import assert from "node:assert/strict";
import {
  brusselsClock,
  decideProSequence,
  evaluateProSequence,
  monthlyDueDay,
  reportedMonth,
  SEND_SLOTS,
  slotFor,
  slotLabel,
  type ProRecipientState,
} from "./pro-sequence-rules";
import { previewEntries } from "./email-templates/fixtures";

const ALL = new Set(["staff_setup", "staff_monthly"]);
const FREE = { lockedSlot: null };

function state(over: Partial<ProRecipientState> = {}): ProRecipientState {
  return { userId: "u1", activatedAt: null, activeCodes: 0, optedOut: new Set(), history: [], ...over };
}

test("heure de Bruxelles : été UTC+2, hiver UTC+1", () => {
  assert.deepEqual(
    { ...brusselsClock(new Date("2026-10-02T07:30:00Z")) },
    { day: "2026-10-02", year: 2026, month: 10, dayOfMonth: 2, weekday: 5, hhmm: 930 }
  );
  assert.equal(brusselsClock(new Date("2026-12-02T07:30:00Z")).hhmm, 830);
  assert.equal(slotLabel(900), "9 h");
  assert.equal(slotLabel(1730), "17 h 30");
});

test("bilan : le 2, ou le 3 si le 2 tombe un lundi ou un jeudi", () => {
  assert.equal(monthlyDueDay(2026, 10), 2); // vendredi 2 octobre 2026
  assert.equal(monthlyDueDay(2026, 11), 3); // lundi 2 novembre 2026
  assert.equal(monthlyDueDay(2026, 7), 3); // jeudi 2 juillet 2026
  assert.equal(reportedMonth(2026, 10), 202609);
  assert.equal(reportedMonth(2027, 1), 202612);
});

test("crée les QR : J+7, J+14, J+30 après la mise en ligne, jamais avec un QR", () => {
  const now = new Date("2026-10-03T12:00:00Z");
  const at = (d: number) => new Date(now.getTime() - d * 86_400_000).toISOString();
  assert.equal(evaluateProSequence("staff_setup", state({ activatedAt: at(6) }), now), null);
  assert.deepEqual(evaluateProSequence("staff_setup", state({ activatedAt: at(7.2) }), now), { step: 1 });
  assert.deepEqual(evaluateProSequence("staff_setup", state({ activatedAt: at(15) }), now), { step: 2 });
  // Pas de rattrapage : J+12 tombe entre deux étapes
  assert.equal(evaluateProSequence("staff_setup", state({ activatedAt: at(12) }), now), null);
  assert.deepEqual(evaluateProSequence("staff_setup", state({ activatedAt: at(31) }), now), { step: 3 });
  assert.equal(evaluateProSequence("staff_setup", state({ activatedAt: at(40) }), now), null);
  // Un QR créé, migration absente, pas de date de mise en ligne : silence
  assert.equal(evaluateProSequence("staff_setup", state({ activatedAt: at(7.2), activeCodes: 1 }), now), null);
  assert.equal(evaluateProSequence("staff_setup", state({ activatedAt: at(7.2), activeCodes: null }), now), null);
  assert.equal(evaluateProSequence("staff_setup", state({ activatedAt: null }), now), null);
  // Étape déjà partie
  const sent = [{ key: "staff_setup", step: 1, status: "sent", channel: "email", createdAt: at(1) }];
  assert.equal(evaluateProSequence("staff_setup", state({ activatedAt: at(7.5), history: sent }), now), null);
});

test("bilan du mois : au moins un QR, une fois par mois, deux jours de rattrapage", () => {
  const s = state({ activeCodes: 2 });
  assert.equal(evaluateProSequence("staff_monthly", s, new Date("2026-10-01T10:00:00Z")), null);
  assert.deepEqual(evaluateProSequence("staff_monthly", s, new Date("2026-10-02T10:00:00Z")), { step: 202609 });
  assert.deepEqual(evaluateProSequence("staff_monthly", s, new Date("2026-10-04T10:00:00Z")), { step: 202609 });
  assert.equal(evaluateProSequence("staff_monthly", s, new Date("2026-10-05T10:00:00Z")), null);
  assert.equal(evaluateProSequence("staff_monthly", state({ activeCodes: 0 }), new Date("2026-10-02T10:00:00Z")), null);
  const done = [{ key: "staff_monthly", step: 202609, status: "delivered", channel: "email", createdAt: "2026-10-02T09:00:00Z" }];
  assert.equal(evaluateProSequence("staff_monthly", state({ activeCodes: 2, history: done }), new Date("2026-10-03T10:00:00Z")), null);
  // Un échec ne compte pas : on réessaie dans la fenêtre
  const failed = [{ key: "staff_monthly", step: 202609, status: "failed", channel: "email", createdAt: "2026-10-02T09:00:00Z" }];
  assert.deepEqual(evaluateProSequence("staff_monthly", state({ activeCodes: 2, history: failed }), new Date("2026-10-03T10:00:00Z")), { step: 202609 });
});

test("créneau : chacun avance d'un cran à chaque envoi et passe par les quatre", () => {
  const seen = new Set([0, 1, 2, 3].map((n) => slotFor("u1", "staff_monthly", n, FREE)));
  assert.equal(seen.size, SEND_SLOTS.length);
  assert.equal(slotFor("u1", "staff_monthly", 2, FREE), slotFor("u1", "staff_monthly", 2, FREE));
  // Heure fixée : la plupart des envois la prennent, une part continue d'explorer
  const locked = Array.from({ length: 400 }, (_, n) => slotFor(`u${n}`, "staff_monthly", n, { lockedSlot: 1100 }));
  const share = locked.filter((s) => s === 1100).length / locked.length;
  assert.ok(share > 0.75 && share < 0.95, String(share));
  // Un créneau fixé qui n'existe pas est ignoré
  assert.equal(slotFor("u1", "k", 0, { lockedSlot: 1234 }), slotFor("u1", "k", 0, FREE));
});

test("décision : attend son créneau, un message par jour, arrêt respecté", () => {
  const s = state({ activeCodes: 3 });
  const slot = slotFor("u1", "staff_monthly", 0, FREE);
  const h = Math.floor(slot / 100);
  const m = slot % 100;
  // 2 oct. 2026 : Bruxelles = UTC+2
  const before = new Date(Date.UTC(2026, 9, 2, h - 2, m) - 60_000);
  const after = new Date(Date.UTC(2026, 9, 2, h - 2, m) + 60_000);
  assert.equal(decideProSequence(s, ALL, before, FREE), null);
  assert.deepEqual(decideProSequence(s, ALL, after, FREE), { key: "staff_monthly", step: 202609, slot });
  assert.equal(decideProSequence(state({ activeCodes: 3, optedOut: new Set(["staff_monthly"]) }), ALL, after, FREE), null);
  assert.equal(decideProSequence(s, new Set(["staff_setup"]), after, FREE), null);
  const today = [{ key: "staff_setup", step: 1, status: "sent", channel: "email", createdAt: new Date(Date.UTC(2026, 9, 2, 5, 0)).toISOString() }];
  assert.equal(decideProSequence(state({ activeCodes: 3, history: today }), ALL, after, FREE), null);
});

test("gabarits restaurateur : push court, objet lisible, lien vers l'équipe", () => {
  const entries = previewEntries({ logoUrl: null, image: () => null }).filter((e) => e.id.startsWith("r-staff-"));
  assert.equal(entries.length, 5);
  for (const e of entries) {
    assert.ok(e.short && e.short.body.length <= 140, e.short?.body);
    assert.match(e.short!.url, /\/admin\/poulet-dore\/qr/);
    assert.match(e.email.html, /\/admin\/poulet-dore\/qr/);
  }
  const monthly = entries.find((e) => e.id === "r-staff-monthly")!;
  assert.match(monthly.email.subject, /Sofia termine septembre en tête/);
  assert.match(monthly.email.text, /À relancer : Karim et Inès/);
  assert.match(entries.find((e) => e.id === "r-staff-monthly-idle")!.email.subject, /n'ont pas servi en septembre/);
});
