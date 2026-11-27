import { test } from "node:test";
import assert from "node:assert/strict";
import { checkPublication } from "../check";
import { excerpt, parseContent } from "../blocks";
import { LIMITS } from "../types";
import { cleanName } from "./clean";
import { pickDish } from "./dish";
import { compose, initialVariant, nextVariant, occasionLabel, sourceDetails, sourceLine, VARIANTS } from "./phrases";
import { DISH_ID, MENU } from "./testing";
import { endOfDay } from "./time";
import { EVENT_CATEGORIES, type Facts, type Offerings, type PromoFacts } from "./types";

const DAYS = ["2026-11-28", "2026-12-01", "2026-12-02", "2027-01-01"]; // dont le plus long nom de jour et le 1er du mois
const OFFERINGS: Offerings[] = [false, true].flatMap((terrace) => [false, true].flatMap((onSite) => [false, true].map((screen) => ({ terrace, onSite, screen }))));
const LONG = cleanName("Grande brocante annuelle des habitants du quartier Saint-Exemple et des environs immédiats")!;

const promo = (day: string, over: Partial<PromoFacts> = {}): Facts => ({
  kind: "promo", offerId: "o", label: "Une boisson offerte le midi", day, startsDay: day, endsDay: day, weekdays: null, itemId: null, hasConditions: false, ...over,
});

const facts: Facts[] = DAYS.flatMap((day): Facts[] => [
  ...EVENT_CATEGORIES.flatMap((category) =>
    [50, 600, 1500].map((distanceM): Facts => ({ kind: "evenement", source: "visitbrussels", externalId: "x", eventId: "x", name: LONG, category, day, distanceM })),
  ),
  { kind: "match", matchId: 1, home: "Royale Union Saint-Gilloise", away: "Club Brugge", competition: "Ligue des champions", kickoffUtc: `${day}T19:45:00Z`, day },
  { kind: "meteo", sky: "soleil", service: "midi", day },
  { kind: "meteo", sky: "pluie", service: "midi", day },
  { kind: "meteo", sky: "pluie", service: "soir", day },
  promo(day),
  promo(day, { startsDay: "2026-11-01", endsDay: "2026-12-01", weekdays: [1, 2, 3, 4, 5, 6], hasConditions: true }),
  promo(day, { label: "Frites offertes pour tout menu poulet commandé en ligne le midi !", itemId: DISH_ID }),
  promo(day, { label: "x".repeat(79) + "." }),
]);

test("CHAQUE version de CHAQUE phrase passe le contrôle de publication", () => {
  let n = 0;
  for (const f of facts) {
    for (const offerings of OFFERINGS) {
      for (let variant = 0; variant < VARIANTS; variant++) {
        const content = compose(f, { offerings, dishId: DISH_ID, variant });
        assert.deepEqual(checkPublication(content, new Set([DISH_ID])), [], `${content.title}\n${JSON.stringify(content.blocks)}`);
        assert.ok(content.title.length <= LIMITS.title, content.title);
        // Et le serveur accepte de l'enregistrer tel quel : même forme qu'un article écrit à la main.
        const parsed = parseContent(content, { restaurantId: "r", postId: "p" });
        assert.ok(parsed.ok && JSON.stringify(parsed.content) === JSON.stringify(content), content.title);
        assert.ok(excerpt(content.blocks).length > 20);
        n++;
      }
    }
    assert.ok(sourceLine(f).length > 5);
    assert.ok(occasionLabel(f).length > 0 && occasionLabel(f).length <= 120);
  }
  assert.ok(n > 1000);
});

test("rien de coché : un article ne parle que d'emporter, jamais de salle, de terrasse ni d'écran", () => {
  const none: Offerings = { terrace: false, onSite: false, screen: false };
  for (const f of facts) {
    for (let variant = 0; variant < VARIANTS; variant++) {
      const c = compose(f, { offerings: none, dishId: null, variant });
      const all = [c.title, ...c.blocks.map((b) => (b.type === "p" ? b.text : ""))].join(" ");
      assert.doesNotMatch(all, /sur place|terrasse|écran|installe-toi|à l'abri|au sec/i, all);
      assert.match(all, /emport/i, all);
    }
  }
});

test("les versions diffèrent, tournent en rond, et un article de match ne dit jamais « ce soir » (il peut paraître la veille)", () => {
  for (const f of facts) {
    const titles = [0, 1, 2].map((variant) => compose(f, { offerings: OFFERINGS[0], dishId: null, variant }));
    assert.equal(new Set(titles.map((t) => JSON.stringify(t))).size, VARIANTS, titles[0].title);
    assert.deepEqual(compose(f, { offerings: OFFERINGS[0], dishId: null, variant: 3 }), titles[0]);
    if (f.kind === "match") for (const t of titles) assert.doesNotMatch(JSON.stringify(t), /ce soir/i);
  }
  assert.deepEqual([0, 1, 2].map(nextVariant), [1, 2, 0]);
  assert.equal(initialVariant("evenement:a"), initialVariant("evenement:a"));
});

test("le texte dit les faits : nom, date, distance ; les informations disent d'où ils viennent", () => {
  const f: Facts = { kind: "evenement", source: "visitbrussels", externalId: "x", eventId: "x", name: "Brocante de la place Exemple", category: "brocante", day: "2026-11-28", distanceM: 600 };
  const c = compose(f, { offerings: OFFERINGS[0], dishId: DISH_ID, variant: 0 });
  assert.equal(c.title, "Brocante samedi : fais une pause chez nous");
  assert.deepEqual(c.blocks[0], { type: "p", text: "Ce samedi 28 novembre, « Brocante de la place Exemple » a lieu à 600 m de chez nous." });
  assert.deepEqual(c.blocks[2], { type: "dish", itemId: DISH_ID });
  assert.equal(sourceLine(f), "Brocante à 600 m. Source : agenda de Bruxelles.");
  assert.deepEqual(sourceDetails(f, { hasDish: true, offerings: OFFERINGS[0], expiresAt: endOfDay(f.day) }), [
    "Nom, date et distance à vol d'oiseau : agenda de Bruxelles.",
    "Plat et prix : ta carte.",
    "« À emporter » : ta page de commande.",
    "Retiré tout seul samedi soir.",
  ]);
});

test("un nom venu d'un tiers est nettoyé et limité ; le contrôle refuse ce qu'il n'accepte pas", () => {
  assert.equal(cleanName("  La « Grande »​ Brocante\n du \"Parvis\" – "), "La Grande Brocante du Parvis");
  assert.equal(cleanName("‮euqnacorb"), "euqnacorb");
  assert.equal(cleanName(" -- !! "), null);
  assert.equal(cleanName(42), null);
  const long = cleanName("x".repeat(30) + " " + "y".repeat(60))!;
  assert.ok(long.length <= 60 && long.endsWith("…"), long);
  for (const name of ["Concert 15 € sur place", "Fête www.exemple.be", "Foire 0470 12 34 56", "Festival sans gluten", "Brocante [complet]", "Fête <b>folle</b>"]) {
    const f: Facts = { kind: "evenement", source: "visitbrussels", externalId: "x", eventId: "x", name: cleanName(name)!, category: "fete", day: "2026-11-28", distanceM: 300 };
    assert.notDeepEqual(checkPublication(compose(f, { offerings: OFFERINGS[0], dishId: null, variant: 0 }), new Set()), [], name);
  }
});

test("l'article d'une offre ne promet pas plus que la page : dates, jours, comptoir, aucun prix changé", () => {
  const f = promo("2026-12-01", { startsDay: "2026-12-01", endsDay: "2026-12-15", weekdays: [2, 4], hasConditions: true }) as PromoFacts;
  for (let variant = 0; variant < VARIANTS; variant++) {
    const c = compose(f, { offerings: OFFERINGS[0], dishId: null, variant });
    const all = c.blocks.map((b) => (b.type === "p" ? b.text : "")).join(" ");
    assert.match(all, /du 1er au 15 décembre inclus, chaque mardi et jeudi/, all);
    assert.match(all, /au comptoir/, all);
    assert.match(all, /total (en ligne|affiché en ligne) ne la compte pas|les prix ne changent pas/, all);
    assert.match(all, /Des conditions s'appliquent/, all);
    assert.ok(all.includes("« Une boisson offerte le midi »"), all);
    assert.ok(c.title.includes(f.label), c.title);
  }
  // Un titre trop long pour un préambule paraît seul, jamais coupé.
  const long = promo("2026-12-01", { label: "x".repeat(80) }) as PromoFacts;
  for (let variant = 0; variant < VARIANTS; variant++) assert.equal(compose(long, { offerings: OFFERINGS[0], dishId: null, variant }).title, long.label);
  // Une offre d'un seul jour le dit tel quel, sans conditions inventées.
  const one = compose(promo("2026-12-03"), { offerings: OFFERINGS[0], dishId: null, variant: 0 });
  assert.match(JSON.stringify(one), /vaut le 3 décembre/);
  assert.doesNotMatch(JSON.stringify(one), /conditions/);
  assert.deepEqual(sourceDetails(f, { hasDish: false, offerings: OFFERINGS[0], expiresAt: endOfDay("2026-12-15") }), [
    "Titre, jours et dates : ton offre.",
    "« À emporter » : ta page de commande.",
    "Retiré tout seul mardi 15 décembre au soir, ou dès que ton offre s'arrête.",
  ]);
});

// Les titres qu'un restaurant pourrait écrire et que le contrôle (inchangé) refuse : pas d'article, la raison est dite.
test("un titre d'offre avec un prix, une promesse de santé ou d'allergène n'a pas d'article", () => {
  const blocked = ["Menu burger à 9,90 €", "Menu midi à 8,50", "2 tacos pour 12 euros", "Moins 2 € sur le menu duo", "Boisson sans sucre offerte", "Salade healthy offerte", "Pizza sans gluten offerte", "Menu allégé offert aux étudiants"];
  const passes = ["-20 % sur les menus", "2e burger à moitié prix", "Frites offertes dès 2 menus", "1 + 1 sur les tacos", "Boisson offerte avec un menu"];
  const issues = (label: string) => checkPublication(compose(promo("2026-12-01", { label }), { offerings: OFFERINGS[0], dishId: null, variant: 0 }), new Set());
  for (const label of blocked) assert.notDeepEqual(issues(label), [], label);
  for (const label of passes) assert.deepEqual(issues(label), [], label);
});

test("le plat montré est un repas de la carte, jamais une boisson seule", () => {
  assert.equal(pickDish(MENU, "2026-11-28"), DISH_ID);
  const drinks = { categories: [{ name: "Boissons", items: MENU.categories[0].items.map((i) => ({ ...i, name: "Coca-Cola" })) }] };
  assert.equal(pickDish(drinks, "2026-11-28"), null);
  assert.equal(pickDish({ categories: [] }, "2026-11-28"), null);
});
