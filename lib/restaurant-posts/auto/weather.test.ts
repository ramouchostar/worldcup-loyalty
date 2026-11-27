// La météo des articles automatiques, de la règle à la publication. Données inventées.
import { test } from "node:test";
import assert from "node:assert/strict";
import type { MetHour } from "../../signals/weather-met";
import { proArticleAutoEmail } from "../../email-templates/pro-article-auto";
import { creditParts, WEATHER_CREDIT } from "../credit";
import { publishNow, saveAutoSettings } from "./actions";
import { prefetchWeather, runAuto } from "./engine";
import { sourceCredit } from "./phrases";
import { skyOf, weatherCandidate, weatherSource } from "./sources/weather";
import { agendaRow, at10, at17, forecast, rainAtNoon, RESTO, sunAtNoon, world } from "./testing";

const EVE = "2026-11-27";
const DAY = "2026-11-28";
const at = (hours: number[], over: Partial<MetHour>) => forecast(DAY, (h) => (hours.includes(h) ? over : {}));
const sunny: Partial<MetHour> = { cloudAreaFraction: 5, airTemperature: 15 };

test("pluie : un service entier, au moins 2 mm répartis sur deux heures, et assez doux pour ne pas être de la neige", () => {
  assert.deepEqual(skyOf(rainAtNoon(DAY), DAY), { sky: "pluie", service: "midi" });
  assert.deepEqual(skyOf(at([18, 19, 20, 21], { precipitationNextHour: 0.5 }), DAY), { sky: "pluie", service: "soir" });
  assert.equal(skyOf(at([11, 12, 13], { precipitationNextHour: 0.6 }), DAY), null, "1,8 mm : pas assez");
  assert.equal(skyOf(at([12], { precipitationNextHour: 6 }), DAY), null, "une seule heure pluvieuse");
  assert.equal(skyOf(at([11, 12, 13], { precipitationNextHour: 2, airTemperature: 2 }), DAY), null, "peut-être de la neige");
  const missing = (over: Partial<MetHour>) => forecast(DAY, (h) => (h === 13 ? over : h >= 11 && h <= 12 ? { precipitationNextHour: 3 } : {}));
  for (const over of [{ precipitationNextHour: null }, { airTemperature: null }]) assert.equal(skyOf(missing(over), DAY), null, JSON.stringify(over));
  const gap = rainAtNoon(DAY);
  gap.hours = gap.hours.filter((h) => h.time !== `${DAY}T11:00:00.000Z`);
  assert.equal(skyOf(gap, DAY), null, "une heure manque");
});

test("soleil : jamais sans donnée", () => {
  assert.deepEqual(skyOf(sunAtNoon(DAY), DAY), { sky: "soleil", service: "midi" });
  assert.deepEqual(skyOf(at([11, 12, 13], { ...sunny, cloudAreaFraction: 25 }), DAY), { sky: "soleil", service: "midi" });
  for (const over of [
    { cloudAreaFraction: null }, { cloudAreaFraction: 26 }, { precipitationNextHour: null }, { precipitationNextHour: 0.1 },
    { airTemperature: null }, { airTemperature: 11.9 },
  ]) {
    assert.equal(skyOf(forecast(DAY, (h) => (h === 12 ? { ...sunny, ...over } : h === 11 || h === 13 ? sunny : {})), DAY), null, JSON.stringify(over));
  }
  assert.equal(skyOf(forecast(DAY), DAY), null);
  assert.equal(skyOf(sunAtNoon(DAY), "2026-11-29"), null);
  // La pluie du soir passe avant le soleil de midi.
  const both = forecast(DAY, (h) => (h >= 11 && h <= 13 ? sunny : h >= 18 && h <= 21 ? { precipitationNextHour: 1 } : {}));
  assert.deepEqual(skyOf(both, DAY), { sky: "pluie", service: "soir" });
});

test("l'occasion météo se retire à la fin du service, une seule par jour", () => {
  assert.equal(weatherCandidate(rainAtNoon(DAY), DAY)!.days[0].expiresAt, "2026-11-28T13:00:00.000Z");
  assert.equal(weatherCandidate(at([18, 19, 20, 21], { precipitationNextHour: 1 }), DAY)!.days[0].expiresAt, "2026-11-28T21:00:00.000Z");
  assert.equal(weatherCandidate(rainAtNoon(DAY), DAY)!.sourceKey, weatherCandidate(sunAtNoon(DAY), DAY)!.sourceKey);
  assert.equal(weatherCandidate(forecast(DAY), DAY), null);
});

test("éteinte tant que l'identification ou la réserve manquent, et la raison est dite", async () => {
  const none = weatherSource({ reader: null, off: "MET_NORWAY_USER_AGENT est vide", cacheReady: async () => assert.fail("inutile") });
  assert.equal(await none.unavailable(), "MET_NORWAY_USER_AGENT est vide");
  const ctx = { restaurantId: "r", coords: { lat: 50.85, lng: 4.35 }, now: at17(EVE), network: true };
  assert.deepEqual(await none.prefetch!(ctx), { ok: false, error: "MET_NORWAY_USER_AGENT est vide" });
  const noTable = weatherSource({ reader: { get: async () => assert.fail("aucune demande") }, off: null, cacheReady: async () => false });
  assert.match((await noTable.unavailable())!, /20261127-0930/);
  assert.equal((await noTable.read(ctx, { from: DAY, to: DAY })).ok, false);

  const w = world();
  await saveAutoSettings(w.deps(), { restaurantId: RESTO, userId: "u", kinds: ["evenement"], accepted: true });
  w.state.now = new Date(`${EVE}T15:23:00Z`);
  const r = await prefetchWeather(w.deps());
  assert.deepEqual([r.acted, r.restaurants, r.off !== null], [true, 0, true]);
});

async function withWeather() {
  const w = world();
  w.state.weather.on = true;
  w.state.weather.forecast = rainAtNoon(DAY);
  const res = await saveAutoSettings(w.deps(), { restaurantId: RESTO, userId: "u", kinds: ["meteo", "evenement"], accepted: true });
  assert.ok(res.ok);
  return w;
}
const run = (w: ReturnType<typeof world>, now: Date) => { w.state.now = now; return runAuto(w.deps()); };

test("la réserve se remplit une heure avant, à d'autres heures rien ; les passages à l'heure pile ne demandent rien", async () => {
  const w = await withWeather();
  for (const time of ["14:23", "16:23", "10:23"]) {
    w.state.now = new Date(`${EVE}T${time}:00Z`);
    assert.equal((await prefetchWeather(w.deps())).acted, false, time);
  }
  assert.equal(w.state.weather.asked.length, 0);
  for (const time of ["08:23", "15:23"]) {
    w.state.now = new Date(`${EVE}T${time}:00Z`);
    const r = await prefetchWeather(w.deps());
    assert.deepEqual([r.acted, r.restaurants, r.ready], [true, 1, 1], time);
  }
  await run(w, at17(EVE));
  await run(w, at10(DAY));
  assert.ok(w.state.weather.asked.slice(2).every((a) => a.network === false), JSON.stringify(w.state.weather.asked));
});

test("de la pluie annoncée : prévenu la veille, publié le jour même avec la source et la licence, retiré à 14 h", async () => {
  const w = await withWeather();
  await run(w, at17(EVE));
  const [o] = w.list();
  assert.deepEqual([o.kind, o.status, o.publish_day, o.expires_at], ["meteo", "prevenu", DAY, "2026-11-28T13:00:00.000Z"]);
  assert.match(o.title, /[Pp]luie/);
  assert.match(o.title, /à midi/);
  assert.equal((await run(w, at10(DAY))).published, 1);
  const post = w.posts.get(o.post_id!)!;
  assert.equal(post.source_credit, WEATHER_CREDIT);
});

test("prévision changée ou service en panne : pas de publication, raison gardée", async () => {
  for (const [change, reason] of [
    [(w: ReturnType<typeof world>) => { w.state.weather.forecast = sunAtNoon(DAY); }, "meteo_change"],
    [(w: ReturnType<typeof world>) => { w.state.weather.forecast = forecast(DAY); }, "meteo_change"],
    [(w: ReturnType<typeof world>) => { w.state.weather.forecast = at([18, 19, 20, 21], { precipitationNextHour: 1 }); }, "meteo_change"],
    [(w: ReturnType<typeof world>) => { w.state.weather.down = true; }, "meteo_indisponible"],
    [(w: ReturnType<typeof world>) => { w.state.weather.on = false; }, "meteo_indisponible"],
  ] as const) {
    // Au passage de 10 h.
    const w = await withWeather();
    await run(w, at17(EVE));
    change(w);
    assert.equal((await run(w, at10(DAY))).published, 0, reason);
    assert.deepEqual([w.list()[0].status, w.list()[0].reason], ["ecarte", reason]);

    // Au préavis de 17 h : la préparation lit, la revérification relit juste avant d'écrire le message.
    const early = await withWeather();
    early.state.now = at17(EVE);
    const deps = early.deps();
    const meteo = deps.sources.find((s) => s.kind === "meteo")!;
    const read = meteo.read.bind(meteo);
    meteo.read = async (ctx, window) => {
      const found = await read(ctx, window);
      change(early);
      return found;
    };
    assert.equal((await runAuto(deps)).notified, 0, reason);
    assert.deepEqual([early.list()[0].status, early.list()[0].reason, early.sent.length], ["ecarte", reason, 0]);
  }
});

test("« Publier maintenant » interroge la source ; en panne, rien ne paraît, l'article attend et la raison est tracée", async () => {
  const w = await withWeather();
  await run(w, at17(EVE));
  w.state.now = new Date(`${EVE}T20:00:00Z`);
  w.state.weather.down = true;
  const o = w.list()[0];
  const res = await publishNow(w.deps(), o, { userId: "u", revision: 1, rightsConfirmed: false });
  assert.equal(res.ok, false);
  assert.match(res.ok ? "" : res.error, /n'a pas pu être vérifiée/);
  assert.equal(w.list()[0].status, "prevenu");
  assert.ok(w.events.some((e) => e.kind === "refuse" && e.reason === "meteo_indisponible"));
  assert.equal(w.state.weather.asked.at(-1)!.network, true);

  w.state.weather.down = false;
  w.state.weather.forecast = sunAtNoon(DAY);
  const changed = await publishNow(w.deps(), w.list()[0], { userId: "u", revision: 1, rightsConfirmed: false });
  assert.equal(changed.ok, false);
  assert.deepEqual([w.list()[0].status, w.list()[0].reason], ["ecarte", "meteo_change"]);
});

test("la météo passe après les autres occasions, et seulement pour le lendemain", async () => {
  const w = await withWeather();
  w.agenda.push(agendaRow(DAY));
  await run(w, at17(EVE));
  const meteo = w.list().find((o) => o.kind === "meteo")!;
  assert.deepEqual([meteo.status, meteo.reason], ["ecarte", "un_par_jour"]);

  const far = await withWeather();
  far.state.weather.forecast = rainAtNoon("2026-11-29");
  await run(far, at17(EVE));
  assert.equal(far.list().length, 0);
});

test("la mention de source porte ses liens, sous l'article et dans l'e-mail", () => {
  assert.equal(sourceCredit("meteo"), WEATHER_CREDIT);
  assert.ok(WEATHER_CREDIT.length <= 200);
  assert.match(WEATHER_CREDIT, /d'après les prévisions de MET Norway/);
  assert.deepEqual(creditParts(WEATHER_CREDIT).filter((p) => p.href).map((p) => [p.text, p.href]), [
    ["MET Norway", "https://www.met.no/en"],
    ["CC BY 4.0", "https://creativecommons.org/licenses/by/4.0/"],
  ]);
  assert.equal(creditParts(WEATHER_CREDIT).map((p) => p.text).join(""), WEATHER_CREDIT);
  assert.deepEqual(creditParts("agenda.brussels"), [{ text: "agenda.brussels", href: null }]);
  const mail = proArticleAutoEmail({
    restaurantName: "Chez Exemple", restaurantId: "r", weekday: "samedi", title: "Pluie annoncée", paragraphs: ["La météo annonce de la pluie."],
    dishName: null, credit: WEATHER_CREDIT, refuseUrl: "https://exemple.test/e/ne-pas-publier/j", postId: "p",
  });
  assert.ok(mail.html.includes('href="https://creativecommons.org/licenses/by/4.0/"'));
  assert.ok(mail.text.includes("CC BY 4.0 : https://creativecommons.org/licenses/by/4.0/"));
});
