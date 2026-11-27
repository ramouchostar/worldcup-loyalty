import { test } from "node:test";
import assert from "node:assert/strict";
import type { FicheRead } from "../../site-orders/fiche";
import { NO_SETTINGS, type PageSettings } from "../../site-orders/page-settings";
import type { WeeklyHours } from "../../site-orders/weekly-hours";
import { publishNow, saveAutoSettings } from "./actions";
import { runAuto } from "./engine";
import { NO_OFFERINGS, offeringsOf, stillOffered } from "./offerings";
import { openDuring, openingReason, openingWindow } from "./opening";
import { compose } from "./phrases";
import { agendaRow, at10, at17, RESTO, world } from "./testing";
import type { EventFacts, MatchFacts, WeatherFacts } from "./types";

const EVE = "2026-11-27"; // vendredi
const DAY = "2026-11-28"; // samedi
const NEXT = "2026-11-29";
const USER = "gerant-1";

const event: EventFacts = { kind: "evenement", source: "visitbrussels", externalId: "e", eventId: "e", name: "Brocante Exemple", category: "brocante", day: DAY, distanceM: 600 };
const match: MatchFacts = { kind: "match", matchId: 1, home: "A", away: "B", competition: "Pro League", kickoffUtc: "2026-11-28T19:45:00.000Z", day: DAY }; // 20 h 45
const lunchRain: WeatherFacts = { kind: "meteo", sky: "pluie", service: "midi", day: DAY };
const dinnerRain: WeatherFacts = { ...lunchRain, service: "soir" };

/** Les mêmes services tous les jours, sauf ceux de `closed` (0 = lundi). */
const week = (services: { open: string; close: string }[], closed: number[] = []): WeeklyHours =>
  Array.from({ length: 7 }, (_, i) => (closed.includes(i) ? [] : services));
const own = (weekly: WeeklyHours, over: Partial<PageSettings> = {}): PageSettings => ({ ...NO_SETTINGS, source: "manual", weekly, ...over });
const never = async (): Promise<FicheRead> => { throw new Error("la fiche ne doit pas être lue"); };

/** Une fiche INVENTÉE : ouverte de 11 h à 22 h tous les jours sauf `closedDays` (0 = dimanche, comme Google). */
const fiche = (closedDays: number[] = []): FicheRead => ({
  ok: true,
  info: {
    businessStatus: "OPERATIONAL", currentOpeningHours: null, rating: null, reviewsCount: null, attributions: [],
    regularOpeningHours: {
      periods: [0, 1, 2, 3, 4, 5, 6].filter((d) => !closedDays.includes(d)).map((day) => ({ open: { day, hour: 11, minute: 0 }, close: { day, hour: 22, minute: 0 } })),
    },
  } as unknown as Extract<FicheRead, { ok: true }>["info"],
});

test("le moment dont parle l'article : jusqu'au coup d'envoi, le service annoncé, ou la journée", () => {
  assert.deepEqual(openingWindow(event, DAY), { from: "2026-11-28T09:00:00.000Z", to: "2026-11-28T23:00:00.000Z" });
  assert.deepEqual(openingWindow(match, DAY), { from: "2026-11-28T09:00:00.000Z", to: match.kickoffUtc });
  assert.deepEqual(openingWindow(lunchRain, DAY), { from: "2026-11-28T10:00:00.000Z", to: "2026-11-28T13:00:00.000Z" });
  assert.deepEqual(openingWindow(dinnerRain, DAY), { from: "2026-11-28T17:00:00.000Z", to: "2026-11-28T21:00:00.000Z" });
});

test("ses propres horaires : ouvert à un moment du créneau, sans jamais lire la fiche", async () => {
  const lunch = own(week([{ open: "11:30", close: "14:00" }]));
  assert.equal(await openDuring(lunch, never, openingWindow(event, DAY)), "ouvert");
  assert.equal(await openDuring(lunch, never, openingWindow(lunchRain, DAY)), "ouvert");
  assert.equal(await openDuring(lunch, never, openingWindow(dinnerRain, DAY)), "ferme");
  // Ouvre après le coup d'envoi : l'article « commande avant le match » serait faux.
  assert.equal(await openDuring(own(week([{ open: "21:00", close: "23:00" }])), never, openingWindow(match, DAY)), "ferme");
  assert.equal(await openDuring(own(week([{ open: "18:00", close: "23:00" }])), never, openingWindow(match, DAY)), "ouvert");
  // Fermé le samedi.
  assert.equal(await openDuring(own(week([{ open: "11:00", close: "22:00" }], [5])), never, openingWindow(event, DAY)), "ferme");
});

test("une fermeture saisie passe avant tout, et la fiche n'est pas lue", async () => {
  const holiday: PageSettings = { ...NO_SETTINGS, closures: [{ from: DAY, to: DAY }] };
  assert.equal(await openDuring(holiday, never, openingWindow(event, DAY)), "ferme");
  assert.equal(await openDuring({ ...NO_SETTINGS, closedToday: DAY }, never, openingWindow(event, DAY)), "ferme");
});

test("la fiche Google : jour fermé, repli sur les horaires saisis, inconnus ou illisibles", async () => {
  const window = openingWindow(event, DAY);
  assert.equal(await openDuring(NO_SETTINGS, async () => fiche(), window), "ouvert");
  assert.equal(await openDuring(NO_SETTINGS, async () => fiche([6]), window), "ferme"); // samedi
  const fallback: PageSettings = { ...NO_SETTINGS, weekly: week([{ open: "11:00", close: "22:00" }]) };
  assert.equal(await openDuring(fallback, async () => ({ ok: false, cause: "lecture_impossible" }), window), "ouvert");
  assert.equal(await openDuring(NO_SETTINGS, async () => ({ ok: false, cause: "lecture_impossible" }), window), "illisibles");
  assert.equal(await openDuring(NO_SETTINGS, async () => ({ ok: false, cause: "pas_de_fiche" }), window), "inconnus");
  assert.deepEqual(["ouvert", "ferme", "inconnus", "illisibles"].map((v) => openingReason(v as never)), [null, "ferme_ce_jour", "horaires_inconnus", "horaires_illisibles"]);
});

test("ce que tu proposes : une case décochée retire le brouillon, une case cochée ne change rien", () => {
  assert.deepEqual(offeringsOf({ terrace: true, dineIn: false, matchScreen: true }), { terrace: true, onSite: false, screen: true });
  for (const variant of [0, 1, 2]) {
    const draft = compose(match, { offerings: { ...NO_OFFERINGS, screen: true }, dishId: null, variant });
    assert.equal(stillOffered(draft, match, variant, { ...NO_OFFERINGS, screen: true }), true);
    assert.equal(stillOffered(draft, match, variant, { terrace: true, onSite: true, screen: true }), true);
    assert.equal(stillOffered(draft, match, variant, NO_OFFERINGS), false);
    const plain = compose(match, { offerings: NO_OFFERINGS, dishId: null, variant });
    assert.equal(stillOffered(plain, match, variant, { ...NO_OFFERINGS, screen: true }), true);
  }
});

// ─── Dans la tâche ───────────────────────────────────────────────────────────

type World = ReturnType<typeof world>;
const run = (w: World, now: Date) => { w.state.now = now; return runAuto(w.deps()); };
const one = (w: World) => { assert.equal(w.list().length, 1, JSON.stringify(w.list())); return w.list()[0]; };
async function active(days: string[] = [DAY]) {
  const w = world();
  for (const d of days) w.agenda.push(agendaRow(d));
  assert.ok((await saveAutoSettings(w.deps(), { restaurantId: RESTO, userId: USER, kinds: ["evenement"], accepted: true })).ok);
  return w;
}

test("un jour fermé : pas de message, la raison reste ; rouvrir avant le préavis le repropose", async () => {
  const w = await active();
  w.state.closedDays.add(DAY);
  await run(w, at17("2026-11-26"));
  assert.deepEqual([one(w).status, one(w).reason, w.sent.length], ["ecarte", "ferme_ce_jour", 0]);
  await run(w, at17("2026-11-26"));
  assert.equal(w.events.filter((e) => e.kind === "auto_ecarte").length, 1); // pas une trace par passage
  w.state.closedDays.clear();
  await run(w, at17(EVE));
  assert.deepEqual([one(w).status, w.sent.length], ["prevenu", 1]);
});

test("un événement sur deux jours prend le premier jour ouvert", async () => {
  const w = await active([DAY, NEXT]);
  w.state.closedDays.add(DAY);
  await run(w, at17(EVE));
  assert.equal(one(w).publish_day, NEXT);
});

test("fermé après le préavis, ou horaires inconnus ou illisibles : rien ne paraît", async () => {
  for (const [set, reason] of [
    [(w: World) => w.state.closedDays.add(DAY), "ferme_ce_jour"],
    [(w: World) => { w.state.opening = "inconnus"; }, "horaires_inconnus"],
    [(w: World) => { w.state.opening = "illisibles"; }, "horaires_illisibles"],
  ] as const) {
    const w = await active();
    await run(w, at17(EVE));
    set(w);
    const r = await run(w, at10(DAY));
    assert.deepEqual([r.published, one(w).status, one(w).reason], [0, "ecarte", reason]);
  }
});

test("« Publier maintenant » : fermé l'arrête ; horaires illisibles le laissent attendre", async () => {
  const closed = await active();
  await run(closed, at17(EVE));
  closed.state.closedDays.add(DAY);
  const no = await publishNow(closed.deps(), one(closed), { userId: USER, revision: 1, rightsConfirmed: false });
  assert.equal(no.ok, false);
  assert.equal(one(closed).status, "ecarte");

  const unknown = await active();
  await run(unknown, at17(EVE));
  unknown.state.opening = "illisibles";
  const wait = await publishNow(unknown.deps(), one(unknown), { userId: USER, revision: 1, rightsConfirmed: false });
  assert.equal(wait.ok, false);
  assert.equal(one(unknown).status, "prevenu");
  assert.ok(unknown.events.some((e) => e.kind === "refuse" && e.reason === "horaires_illisibles"));
});

test("décocher après le préavis : le texte qui en parlait ne paraît pas", async () => {
  const w = await active();
  w.state.offerings = { ...NO_OFFERINGS, onSite: true };
  await run(w, at17(EVE));
  w.state.offerings = NO_OFFERINGS;
  const r = await run(w, at10(DAY));
  assert.deepEqual([r.published, one(w).reason], [0, "infos_changees"]);

  const more = await active();
  await run(more, at17(EVE));
  more.state.offerings = { terrace: true, onSite: true, screen: true };
  assert.equal((await run(more, at10(DAY))).published, 1);
});
