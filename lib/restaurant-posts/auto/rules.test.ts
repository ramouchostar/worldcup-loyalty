import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { previewEntries } from "../../email-templates/fixtures";
import { proArticleAutoEmail } from "../../email-templates/pro-article-auto";
import { isSequenceKey, MESSAGES } from "../../message-catalog";
import { kindChoices, missedItems, publishedNote, readyKinds, upcomingItems } from "./overview";
import { planOccasions, type ExistingOccasion } from "./plan";
import { deliveryProof } from "./proof";
import { AUTO_REASONS } from "./reasons";
import { eventSource } from "./sources/events";
import { promoSource } from "./sources/promos";
import { weatherSource } from "./sources/weather";
import { publishAt, weekStart } from "./time";
import { readRefusalToken, refusalToken } from "./token";
import type { AutoKind, Candidate, Occasion } from "./types";

const TODAY = "2026-11-27";
const cand = (kind: AutoKind, key: string, day: string, rank = 0): Candidate => ({
  kind, sourceKey: key, rank,
  days: [{ day, expiresAt: `${day}T23:00:00Z`, facts: { kind: "meteo", sky: "pluie", service: "midi", day } }],
});
const exist = (id: string, kind: AutoKind, day: string, over: Partial<ExistingOccasion> = {}): ExistingOccasion => ({
  id, kind, source_key: id, publish_day: day, status: "prevu", reason: null, modified_at: null, ...over,
});
const ALL: AutoKind[] = ["promo", "evenement", "match", "meteo"];
const keys = (steps: { candidate: Candidate }[]) => steps.map((s) => s.candidate.sourceKey);

test("priorité le même jour : promo, puis l'événement le plus proche, puis le match, puis la météo", () => {
  const p = planOccasions({
    today: TODAY, kinds: ALL, existing: [],
    candidates: [cand("meteo", "m", "2026-11-28"), cand("match", "f", "2026-11-28"), cand("evenement", "loin", "2026-11-28", 900), cand("evenement", "pres", "2026-11-28", 100), cand("promo", "p", "2026-11-29")],
  });
  assert.deepEqual(keys(p.create).sort(), ["p", "pres"]);
  assert.deepEqual(p.discard.map((d) => [d.candidate.sourceKey, d.reason]), [["loin", "un_par_jour"], ["f", "un_par_jour"], ["m", "un_par_jour"]]);
});

test("seuls les types cochés, les trois prochains jours, et jamais deux fois la même occasion", () => {
  const p = planOccasions({
    today: TODAY, kinds: ["evenement"],
    existing: [exist("vu", "evenement", "2026-11-28", { status: "refuse", reason: "refus" })],
    candidates: [cand("match", "f", "2026-11-28"), cand("evenement", "hier", TODAY), cand("evenement", "loin", "2026-12-05"), cand("evenement", "vu", "2026-11-29")],
  });
  assert.deepEqual([p.create, p.discard, p.replace], [[], [], []]);
});

test("plus prioritaire : il prend la place d'une occasion pas encore annoncée, jamais d'une annoncée ou modifiée", () => {
  const candidates = [cand("promo", "p", "2026-11-29")];
  const free = planOccasions({ today: TODAY, kinds: ALL, existing: [exist("old", "match", "2026-11-29")], candidates });
  assert.deepEqual([free.replace, keys(free.create)], [["old"], ["p"]]);
  for (const over of [{ status: "prevenu" as const }, { modified_at: "2026-11-27T10:00:00Z" }, { status: "publie" as const }]) {
    const p = planOccasions({ today: TODAY, kinds: ALL, existing: [exist("old", "match", "2026-11-29", over)], candidates });
    assert.deepEqual([p.replace, p.discard.map((d) => d.reason)], [[], ["un_par_jour"]]);
  }
});

test("trois par semaine, du lundi au dimanche ; les refusées et écartées ne comptent pas", () => {
  assert.equal(weekStart("2026-11-29"), "2026-11-23");
  assert.equal(weekStart("2026-11-30"), "2026-11-30");
  const three = [exist("a", "evenement", "2026-11-23", { status: "publie" }), exist("b", "evenement", "2026-11-24", { status: "publie" }), exist("c", "evenement", "2026-11-28", { status: "prevenu" })];
  const p = planOccasions({ today: TODAY, kinds: ALL, existing: three, candidates: [cand("evenement", "d", "2026-11-29"), cand("evenement", "lundi", "2026-11-30")] });
  assert.deepEqual(p.discard.map((d) => [d.candidate.sourceKey, d.reason]), [["d", "limite_semaine"]]);
  assert.deepEqual(keys(p.create), ["lundi"]);
  const freed = planOccasions({ today: TODAY, kinds: ALL, existing: [three[0], three[1], { ...three[2], status: "refuse" }], candidates: [cand("evenement", "d", "2026-11-29")] });
  assert.deepEqual(keys(freed.create), ["d"]);
});

test("par type et par jour, trois occasions au plus sont retenues ou gardées comme écartées", () => {
  const p = planOccasions({ today: TODAY, kinds: ALL, existing: [], candidates: [1, 2, 3, 4, 5, 6].map((n) => cand("evenement", `e${n}`, "2026-11-28", n)) });
  assert.deepEqual([keys(p.create), keys(p.discard)], [["e1"], ["e2", "e3"]]);
});

test("une occasion écartée à l'arrêt ou au décochage peut revenir, les autres non", () => {
  const candidates = [cand("evenement", "x", "2026-11-28")];
  for (const [reason, back] of [["arret", true], ["type_decoche", true], ["controle", false], ["mail_rebond", false]] as const) {
    const p = planOccasions({ today: TODAY, kinds: ALL, existing: [exist("x", "evenement", "2026-11-28", { status: "ecarte", reason })], candidates });
    assert.deepEqual(p.create.map((s) => s.reviveId), back ? ["x"] : [], reason);
  }
});

test("prévenu veut dire délivré : ni seulement envoyé, ni rebondi, ni signalé", () => {
  const row = { status: "delivered", delivered_at: "2026-11-27T16:00:01Z", bounced_at: null, complained_at: null };
  assert.deepEqual(deliveryProof(row), { ok: true });
  assert.deepEqual(deliveryProof({ ...row, status: "sent", delivered_at: null }), { ok: false, reason: "mail_non_confirme" });
  assert.deepEqual(deliveryProof({ ...row, complained_at: "2026-11-27T17:00:00Z" }), { ok: false, reason: "mail_rebond" });
  assert.deepEqual(deliveryProof({ ...row, status: "bounced", bounced_at: "2026-11-27T17:00:00Z" }), { ok: false, reason: "mail_rebond" });
  assert.deepEqual(deliveryProof({ ...row, status: "failed", delivered_at: null }), { ok: false, reason: "mail_non_parti" });
  assert.deepEqual(deliveryProof(null), { ok: false, reason: "mail_non_parti" });
});

test("le lien de refus : signé, pour cette occasion seulement, jusqu'à l'heure de publication", () => {
  const id = "11111111-1111-4111-8111-111111111111";
  const other = "22222222-2222-4222-8222-222222222222";
  const until = publishAt("2026-11-28");
  assert.equal(until, "2026-11-28T09:00:00.000Z");
  const token = refusalToken(id, until, "secret");
  const before = new Date("2026-11-28T08:59:59Z");
  assert.deepEqual(readRefusalToken(token, before, "secret"), { occasionId: id, expired: false });
  assert.deepEqual(readRefusalToken(token, new Date(until), "secret"), { occasionId: id, expired: true });
  assert.equal(readRefusalToken(token, before, "autre secret"), null);
  assert.equal(readRefusalToken(token.replace(id, other), before, "secret"), null);
  const [i, exp, sig] = token.split(".");
  assert.equal(readRefusalToken(`${i}.${Number(exp) + 3600}.${sig}`, before, "secret"), null);
  for (const bad of [null, "", "abc", `${token}x`, `${i}.${exp}`]) assert.equal(readRefusalToken(bad, before, "secret"), null);
});

test("le réglage dit ce qu'on peut cocher, et pourquoi le reste ne l'est pas", async () => {
  const off = weatherSource({ reader: null, off: "MET_NORWAY_USER_AGENT est vide", cacheReady: async () => true });
  const promos = promoSource({ ready: async () => "pas activées", published: async () => [], get: async () => null, orderable: async () => new Set() });
  const ready = await readyKinds([promos, eventSource({ nearby: async () => [], one: async () => null }), off]);
  assert.deepEqual(kindChoices(ready, true).map((c) => [c.kind, c.available]), [["promo", false], ["evenement", true], ["match", false], ["meteo", false]]);
  assert.match(kindChoices(ready, true)[3].note, /pas encore allumée/);
  assert.equal(kindChoices(ready, false)[1].available, false);
  for (const c of kindChoices(ready, false)) assert.ok(c.note.length > 0);
  const on = kindChoices(new Set<AutoKind>(["meteo"]), true)[3];
  assert.deepEqual([on.available, /MET Norway/.test(on.note)], [true, true]);
  assert.equal(kindChoices(new Set<AutoKind>(["meteo"]), false)[3].available, false);
});

const occasion = (over: Partial<Occasion>): Occasion => ({
  id: "o", restaurant_id: "r", kind: "evenement", source_key: "k", label: "Concert à la salle Exemple", title: "Concert samedi",
  facts: { kind: "evenement", source: "visitbrussels", externalId: "x", eventId: "x", name: "Concert à la salle Exemple", category: "concert", day: "2026-11-28", distanceM: 600 },
  occasion_day: "2026-11-28", publish_day: "2026-11-28", publish_at: "2026-11-28T09:00:00Z", expires_at: "2026-11-28T23:00:00Z", variant: 0, status: "prevenu", reason: null,
  reason_detail: null, post_id: "p", send_id: null, notified_at: null, published_at: null, published_mode: null, modified_at: null, refused_via: null, decided_by: null,
  decided_at: null, created_at: "2026-11-27T16:00:00Z", updated_at: "2026-11-27T16:00:00Z", ...over,
});

test("la console : bientôt publiés, pas publiés avec la raison, publiés tout seuls", () => {
  const now = new Date("2026-11-27T18:00:00Z");
  const soon = upcomingItems([occasion({}), occasion({ id: "q", status: "prevu", publish_day: "2026-11-29", post_id: null, expires_at: "2026-11-29T23:00:00Z" })], now);
  assert.deepEqual(soon.map((s) => [s.when, s.postId, s.line]), [
    ["Demain, samedi à 10:00", "p", "Concert à 600 m. Source : agenda de Bruxelles."],
    ["Dimanche 29 novembre à 10:00", null, "Tu seras prévenu samedi à 17:00."],
  ]);
  const missed = missedItems([occasion({ status: "ecarte", reason: "un_par_jour" }), occasion({ id: "vieux", status: "refuse", reason: "refus", publish_day: "2026-11-01" })], now);
  assert.deepEqual(missed, [{ id: "o", label: "Concert à la salle Exemple (samedi 28 novembre)", reason: "Un article par jour au plus." }]);
  const published = occasion({ status: "publie", published_mode: "auto", published_at: "2026-11-28T09:00:00Z" });
  assert.equal(publishedNote(published, new Date("2026-11-28T12:00:00Z")), "Publié tout seul aujourd'hui. Retiré tout seul samedi soir.");
  assert.match(publishedNote(published, new Date("2026-11-30T12:00:00Z")), /à la fin de l'occasion/);
});

test("chaque motif a sa phrase, sans jargon", () => {
  for (const text of Object.values(AUTO_REASONS)) assert.ok(text.endsWith(".") && text.length > 10, text);
});

test("le message de la veille : au catalogue, pas une séquence, valeurs échappées, lien de refus et lien de lecture", () => {
  const def = MESSAGES.find((m) => m.key === "article_auto_preavis")!;
  assert.deepEqual([def.audience, def.kind], ["restaurant", "transactionnel"]);
  assert.equal(isSequenceKey("article_auto_preavis"), false);
  const mail = proArticleAutoEmail({
    restaurantName: "Chez <Exemple>", restaurantId: "r", weekday: "samedi", title: "Un titre <script>alert(1)</script> de quatre-vingts caractères au plus pour voir",
    paragraphs: ["Un & deux <b>trois</b>"], dishName: "Plat <i>x</i>", credit: "agenda.brussels", refuseUrl: "https://exemple.test/e/ne-pas-publier/jeton", postId: "p",
  });
  assert.ok(mail.subject.length <= 90, mail.subject);
  assert.ok(!/<script>|<b>trois|<i>x|<Exemple>/.test(mail.html));
  assert.ok(mail.html.includes("https://exemple.test/e/ne-pas-publier/jeton"));
  assert.ok(mail.html.includes("/admin/r/articles/p/apercu?de=message"));
  assert.ok(mail.text.includes("Tu n'as rien à faire si tu es d'accord."));
  assert.ok(previewEntries({ logoUrl: null, image: () => null }).some((e) => e.id === "t-article-auto"));
});

test("la tâche est déclarée toutes les heures, la réserve météo à une minute décalée ; la migration automatique ne détruit rien", () => {
  const crons = JSON.parse(readFileSync(join(process.cwd(), "vercel.json"), "utf8")).crons as { path: string; schedule: string }[];
  assert.equal(crons.find((c) => c.path === "/api/cron/auto-articles")?.schedule, "0 * * * *");
  // Jamais à l'heure pile : les conditions de MET Norway le demandent.
  assert.match(crons.find((c) => c.path === "/api/cron/auto-articles-weather")!.schedule, /^(?!0 )[1-5]?\d \* \* \* \*$/);
  const cache = readFileSync(join(process.cwd(), "docs", "migrations", "20261127-0930-weather-forecast-cache.sql"), "utf8");
  assert.match(cache, /CREATE TABLE IF NOT EXISTS weather_forecast_cache/);
  assert.match(cache, /ENABLE ROW LEVEL SECURITY/);
  assert.doesNotMatch(cache, /CREATE POLICY|DROP |ALTER TABLE restaurant|DELETE FROM|TRUNCATE/);
  const sql = readFileSync(join(process.cwd(), "docs", "migrations", "20261126-2330-restaurant-posts-auto.sql"), "utf8");
  assert.match(sql, /to_regclass\('public\.restaurant_posts'\) IS NULL/);
  // Chaque table nouvelle est fermée (service role seulement) et rien n'est détruit.
  assert.equal((sql.match(/ENABLE ROW LEVEL SECURITY/g) ?? []).length, 2);
  assert.doesNotMatch(sql, /CREATE POLICY|DROP TABLE|DROP COLUMN|DELETE FROM|TRUNCATE/);
});
