import { test } from "node:test";
import assert from "node:assert/strict";
import fixture from "./local-events-visitbrussels.fixture.json";
import {
  brusselsLocalToUtc,
  distanceKm,
  isNotable,
  RANKING_KEEP_THRESHOLD,
  parseVisitBrusselsEvents,
  selectLocalEvents,
  type LocalEvent,
} from "./local-events";

// Vraie réponse de l'agenda (visit.brussels), 17 événements, lue le 2026-10-06.
const WINDOW = { from: "2026-10-06", to: "2026-11-15" };
const all = parseVisitBrusselsEvents(fixture, WINDOW);
const byName = (rx: RegExp) => all.filter((e) => rx.test(e.name));
const first = (rx: RegExp) => byName(rx)[0];

test("brusselsLocalToUtc : heure d'été, heure d'hiver, changements d'heure", () => {
  assert.equal(brusselsLocalToUtc("2026-10-08", "20:30:00"), "2026-10-08T18:30:00.000Z"); // UTC+2
  assert.equal(brusselsLocalToUtc("2026-11-12", "18:00:00"), "2026-11-12T17:00:00.000Z"); // UTC+1
  // Bascule d'automne (25/10/2026) : 02:30 existe deux fois, on prend la première (été).
  assert.equal(brusselsLocalToUtc("2026-10-25", "02:30:00"), "2026-10-25T00:30:00.000Z");
  assert.equal(brusselsLocalToUtc("2026-10-25", "03:30:00"), "2026-10-25T02:30:00.000Z"); // déjà l'hiver
  // Saut de printemps (28/03/2027) : 02:30 n'existe pas, repli sur UTC+1.
  assert.equal(brusselsLocalToUtc("2027-03-28", "02:30:00"), "2027-03-28T01:30:00.000Z");
  assert.equal(brusselsLocalToUtc("2026-10-08", "pas une heure"), null);
  assert.equal(brusselsLocalToUtc("08/10/2026", "20:30"), null);
});

test("lecture : une ligne par jour, permanents et événements sans date écartés, fenêtre respectée", () => {
  assert.ok(all.length > 17);
  assert.ok(all.every((e) => e.day >= WINDOW.from && e.day <= WINDOW.to));
  assert.ok(!all.some((e) => /monde des Insectes/.test(e.name))); // exposition permanente
  assert.ok(!all.some((e) => /clowns/.test(e.name))); // aucune date
  const keys = new Set(all.map((e) => e.externalId));
  assert.equal(keys.size, all.length, "l'identifiant d'occurrence doit être unique");
  // Fenêtre plus étroite : seulement les jours demandés.
  const one = parseVisitBrusselsEvents(fixture, { from: "2026-10-06", to: "2026-10-06" });
  assert.ok(one.length > 0 && one.every((e) => e.day === "2026-10-06"));
});

test("lecture : un concert à Forest National, heures de Bruxelles converties en UTC", () => {
  const e = first(/PATRICK BRUEL/);
  assert.equal(e.day, "2026-10-06");
  assert.equal(e.startsAt, "2026-10-06T18:00:00.000Z"); // 20:00 à Bruxelles
  assert.equal(e.endsAt, "2026-10-06T21:00:00.000Z"); // 23:00
  assert.equal(e.isHighCapacity, true);
  assert.equal(e.venueName, "Forest National");
  assert.equal(e.venueZip, "1190");
  assert.equal(e.ranking, 2);
  assert.equal(typeof e.lat, "number");
  assert.equal(typeof e.lng, "number");
  assert.match(e.url ?? "", /visit\.brussels/);
  assert.equal(e.externalId, `${e.eventId}:2026-10-06T20:00`);
});

test("lecture : deux séances le même jour = deux occurrences distinctes (cas réel : Monte Cristo, 15 h et 20 h 30)", () => {
  const sessions = byName(/MONTE CRISTO/).filter((e) => e.day === "2026-10-10");
  assert.equal(sessions.length, 2);
  assert.deepEqual(sessions.map((e) => e.externalId.split(":").slice(1).join(":")), ["2026-10-10T15:00", "2026-10-10T20:30"]);
  assert.equal(new Set(sessions.map((e) => e.externalId)).size, 2);
  // Même heure répétée : la clé reste unique grâce au numéro.
  const twin = {
    data: [{ id: 7, translations: { fr: { name: "Doublon" } }, dates: [{ day: "2026-10-10", start: "20:00:00" }, { day: "2026-10-10", start: "20:00:00" }], place: null }],
  };
  const keys = parseVisitBrusselsEvents(twin, WINDOW).map((e) => e.externalId);
  assert.deepEqual(keys, ["7:2026-10-10T20:00", "7:2026-10-10T20:00#2"]);
  // Sans heure : la clé n'a pas de « T ».
  const noTime = { data: [{ id: 8, translations: { fr: { name: "Sans heure" } }, dates: [{ day: "2026-10-10" }], place: null }] };
  assert.deepEqual(parseVisitBrusselsEvents(noTime, WINDOW).map((e) => e.externalId), ["8:2026-10-10"]);
});

test("lecture : fin de soirée après minuit (« afterwork & party » jusqu'à 01:00)", () => {
  const e = first(/afterwork/);
  assert.equal(e.category, "fete");
  assert.equal(e.endsAt, null);
  assert.equal(e.nightLifeUntil, "2026-10-08T23:00:00.000Z"); // 01:00 le lendemain à Bruxelles
  assert.equal(e.doorsAt, "2026-10-08T16:00:00.000Z");
});

test("lecture : événement annulé, catégories normalisées, aucune donnée personnelle", () => {
  assert.ok(byName(/Brussel Discovery/).every((e) => e.isCanceled));
  assert.equal(first(/mary in the junkyard/).category, "concert");
  assert.equal(first(/À qui la faute/).category, "theatre");
  assert.equal(first(/Marché du mardi/).category, "brocante");
  assert.equal(first(/Pumpkimania/).category, "foire");
  assert.equal(first(/Seuls, Même pas peur/).category, "autre");
  assert.equal(first(/Atelier Internet utile/).sourceCategory, "training");
  // Les seuls champs : pas d'e-mail, de téléphone ni de site d'organisateur.
  const expected = [
    "source", "externalId", "eventId", "name", "category", "sourceCategory", "day", "startsAt", "endsAt", "doorsAt",
    "nightLifeUntil", "venueName", "venueZip", "venueCity", "lat", "lng", "isHighCapacity", "isFree", "isCanceled",
    "isSoldout", "ranking", "url",
  ];
  assert.deepEqual(Object.keys(all[0]).sort(), [...expected].sort());
});

test("lecture : réponses inexploitables ignorées sans planter", () => {
  assert.deepEqual(parseVisitBrusselsEvents(null, WINDOW), []);
  assert.deepEqual(parseVisitBrusselsEvents({ error: "x" }, WINDOW), []);
  assert.deepEqual(parseVisitBrusselsEvents({ data: [null, 3, "x", { id: 1 }, { id: 2, dates: [{ day: "2026-10-08" }] }] }, WINDOW), []);
});

test("isNotable : le seuil de classement est 2 — un lieu à 1,3 (bibliothèque, centre communautaire) ne passe plus", () => {
  const base = first(/Seuls, Même pas peur/); // « autre », classé 0,5 dans la fixture
  const at = (ranking: number | null): LocalEvent => ({ ...base, isHighCapacity: false, sourceCategory: "other", category: "autre", ranking });
  assert.equal(isNotable(at(2)), true); // Ancienne Belgique, Bozar, Flagey, Cirque Royal
  assert.equal(isNotable(at(1.99)), false);
  assert.equal(isNotable(at(1.3)), false); // cas réel : activités de bibliothèque
  assert.equal(isNotable(at(1)), false);
  assert.equal(isNotable(at(null)), false);
  assert.equal(RANKING_KEEP_THRESHOLD, 2);
  // Les catégories d'événement et la grande salle ne dépendent pas du classement.
  assert.equal(isNotable({ ...at(0.1), category: "concert" }), true);
  assert.equal(isNotable({ ...at(0.1), isHighCapacity: true }), true);
  // Cinéma de quartier mal classé : non ; formation même classée 2 : non.
  assert.equal(isNotable({ ...at(1.3), category: "cinema", sourceCategory: "movie" }), false);
  assert.equal(isNotable({ ...at(2), sourceCategory: "training" }), false);
});

test("isNotable : grande salle, catégories d'événement, ou classement élevé — pas les ateliers ni les visites", () => {
  assert.equal(isNotable(first(/PATRICK BRUEL/)), true); // grande salle (catégorie « autre »)
  assert.equal(isNotable(first(/mary in the junkyard/)), true); // concert
  assert.equal(isNotable(first(/afterwork/)), true); // fête
  assert.equal(isNotable(first(/Marché du mardi/)), true); // brocante
  assert.equal(isNotable(first(/Pumpkimania/)), true); // foire
  assert.equal(isNotable(first(/Jalen Ngonda/)), true); // « autre » mais lieu de classement 2
  // Formations et visites guidées : jamais, même bien classées (ici 1,3 et 1,0).
  assert.equal(isNotable(first(/Atelier Internet utile/)), false);
  assert.equal(isNotable(first(/Expo M.C. Escher/)), false);
  // « autre » peu classé et sport de loisir : non.
  assert.equal(isNotable(first(/Seuls, Même pas peur/)), false);
  assert.equal(isNotable(first(/Drohme Park/)), false);
});

test("sélection par code postal : Forest National pour un établissement à Forest", () => {
  const out = selectLocalEvents({ events: all.filter(isNotable), today: "2026-10-06", near: { zips: ["1190"] }, horizonDays: 7 });
  assert.ok(out.length >= 1);
  assert.ok(out.every((o) => o.event.venueZip === "1190" && o.reasons.join() === "code_postal"));
  const bruel = out.find((o) => /PATRICK BRUEL/.test(o.event.name))!;
  assert.equal(bruel.daysUntil, 0);
  assert.equal(bruel.isEvening, true); // 20 h
  assert.equal(bruel.runsLate, true); // finit à 23 h
  assert.equal(bruel.distanceKm, null);
});

test("sélection par distance : le rayon compte, le code postal n'est pas requis", () => {
  const forest = { lat: 50.80999, lng: 4.32601 };
  const near = selectLocalEvents({ events: all.filter(isNotable), today: "2026-10-06", near: { center: forest, radiusKm: 0.5 }, horizonDays: 7 });
  assert.ok(near.some((o) => /PATRICK BRUEL/.test(o.event.name)));
  assert.ok(near.every((o) => o.reasons.join() === "distance" && (o.distanceKm ?? 99) <= 0.5));
  // Centre de Bruxelles : Forest National est à environ 6 km.
  const centre = selectLocalEvents({ events: all.filter(isNotable), today: "2026-10-06", near: { center: { lat: 50.8467, lng: 4.3525 }, radiusKm: 1.5 }, horizonDays: 7 });
  assert.ok(!centre.some((o) => /PATRICK BRUEL/.test(o.event.name)));
  // Code postal ET distance : les deux raisons.
  const both = selectLocalEvents({ events: all.filter(isNotable), today: "2026-10-06", near: { zips: ["1190"], center: forest, radiusKm: 1 }, horizonDays: 0 });
  assert.deepEqual(both.find((o) => /PATRICK BRUEL/.test(o.event.name))!.reasons, ["code_postal", "distance"]);
});

test("sélection : annulés écartés par défaut, catégories et grande salle filtrables, horizon borné", () => {
  const events = all;
  const zips = Array.from(new Set(events.map((e) => e.venueZip).filter((z): z is string => !!z)));
  const base = { events, today: "2026-10-06", near: { zips }, horizonDays: 40 };
  const normal = selectLocalEvents(base);
  assert.ok(!normal.some((o) => o.event.isCanceled));
  assert.ok(selectLocalEvents({ ...base, includeCanceled: true }).some((o) => o.event.isCanceled));
  assert.ok(selectLocalEvents({ ...base, categories: ["concert"] }).every((o) => o.event.category === "concert"));
  assert.ok(selectLocalEvents({ ...base, highCapacityOnly: true }).every((o) => o.event.isHighCapacity));
  assert.ok(selectLocalEvents({ ...base, horizonDays: 3 }).every((o) => o.daysUntil <= 3));
  assert.deepEqual(selectLocalEvents({ ...base, today: "2026-12-01" }), []); // tout est passé
});

test("sélection : tri par jour, grande salle d'abord, puis classement", () => {
  const zips = Array.from(new Set(all.map((e) => e.venueZip).filter((z): z is string => !!z)));
  const out = selectLocalEvents({ events: all.filter(isNotable), today: "2026-10-06", near: { zips }, horizonDays: 30 });
  for (let i = 1; i < out.length; i++) {
    const a = out[i - 1].event, b = out[i].event;
    assert.ok(a.day <= b.day, "jours croissants");
    if (a.day === b.day) assert.ok(Number(a.isHighCapacity) >= Number(b.isHighCapacity), "grande salle d'abord");
  }
});

test("sélection : sans lieu renseigné, aucun événement n'est inventé", () => {
  assert.deepEqual(selectLocalEvents({ events: all, today: "2026-10-06", near: {} }), []);
  const noCoords: LocalEvent = { ...all[0], lat: null, lng: null, venueZip: null };
  assert.deepEqual(selectLocalEvents({ events: [noCoords], today: noCoords.day, near: { center: { lat: 50.8, lng: 4.3 }, radiusKm: 50 } }), []);
});

test("distanceKm : Grand-Place – Atomium ≈ 5,4 km", () => {
  const d = distanceKm({ lat: 50.8467, lng: 4.3525 }, { lat: 50.8949, lng: 4.3415 });
  assert.ok(d > 5 && d < 5.8, `distance ${d}`);
  assert.equal(distanceKm({ lat: 50, lng: 4 }, { lat: 50, lng: 4 }), 0);
});
