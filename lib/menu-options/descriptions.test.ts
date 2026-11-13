import { test } from "node:test";
import assert from "node:assert/strict";
import { describeArticle, inventedWords, MAX_DESCRIPTION, TONES, type Tone, type Viande } from "./descriptions";
import { classifyArticle } from "./families";

const d = (name: string, over: { category?: string; tone?: Tone; viande?: Viande | null; id?: string } = {}) =>
  describeArticle({ id: over.id ?? "a1", name, category: over.category ?? "", family: classifyArticle({ name, category: over.category }), tone: over.tone ?? "sobre", viande: over.viande });

// ─── Les exemples de la maquette validée ─────────────────────────────────────

test("sobre : le plat, tel qu'il s'appelle, sans rien ajouter", () => {
  assert.equal(d("Pizza Margherita")?.text, "Une pizza Margherita.");
  assert.equal(d("Pizza Quatre fromages")?.text, "Une pizza quatre fromages.");
  assert.equal(d("Durum poulet")?.text, "Un durum poulet.");
  assert.equal(d("Pain turc falafel")?.text, "Un pain turc falafel.");
  assert.equal(d("Mitraillette kefta")?.text, "Une mitraillette kefta.");
  assert.equal(d("Pâtes carbonara")?.text, "Des pâtes carbonara.");
  assert.equal(d("Tacos double")?.text, "Un tacos double.");
  assert.equal(d("Panini jambon fromage")?.text, "Un panini jambon fromage.");
});

test("« Cheese burger » ne dit pas la viande : on ne l'invente pas, sauf si le restaurateur l'a dite", () => {
  assert.equal(d("Cheese burger")?.text, "Un burger au fromage.");
  assert.equal(d("Cheese burger", { viande: "bœuf" })?.text, "Un burger de bœuf au fromage.");
  assert.equal(d("Cheese burger", { viande: "poulet" })?.text, "Un burger de poulet au fromage.");
  assert.equal(d("Cheese burger", { viande: "mélange" })?.text, "Un burger au fromage.", "« un mélange » : on n'écrit pas de viande");
  assert.equal(d("Bacon burger", { viande: "bœuf" })?.text, "Un burger de bœuf au bacon.");
});

test("quand le nom dit la viande, c'est le nom qui décide, et un désaccord est signalé", () => {
  const poulet = d("Burger poulet croustillant", { viande: "bœuf" })!;
  assert.equal(poulet.text, "Un burger au poulet croustillant.");
  assert.match(poulet.conflict ?? "", /poulet croustillant.*bœuf.*nous avons gardé ce que dit le nom/);
  assert.equal(d("Burger poulet croustillant", { viande: "poulet" })?.conflict, undefined);
  assert.equal(d("Burger poulet croustillant")?.conflict, undefined);
  assert.equal(d("Chicken burger", { viande: "bœuf" })?.text, "Un burger au poulet.");
  assert.equal(d("Beef burger", { viande: "poulet" })?.text, "Un burger au bœuf.");
  assert.equal(d("Burger steak haché cheddar")?.text, "Un burger au steak haché et au cheddar.");
});

test("un burger végétarien n'a jamais de viande, quelle que soit la réponse", () => {
  assert.equal(d("Burger végétarien", { viande: "bœuf" })?.text, "Un burger végétarien.");
  assert.equal(d("Veggie burger", { viande: "poulet" })?.conflict, undefined);
});

test("un burger dont le nom ne dit rien de reconnu garde son nom, sans phrase inventée", () => {
  assert.equal(d("Burger maison")?.text, "Burger maison.", "le nom est gardé tel quel, sans « un burger de bœuf » inventé");
  assert.equal(d("Burger maison", { viande: "bœuf" })?.text, "Un burger de bœuf.", "mais la réponse du restaurateur, elle, s'écrit");
});

test("un nom que nous ne savons pas classer n'a pas de description : nous ne savons pas ce que c'est", () => {
  assert.equal(d("Big Tasty"), null);
});

test("gourmand et fun ajoutent une phrase qui parle du client", () => {
  const g = d("Pizza Margherita", { tone: "gourmand" })!.text;
  assert.match(g, /^Une pizza Margherita, pour (se faire plaisir|les gourmands)|à partager ou pas\.$/);
  const f = d("Pizza Margherita", { tone: "fun" })!.text;
  assert.match(f, /^Une pizza Margherita, pour (les amateurs de sensations pures|ceux qui aiment se faire plaisir|les gros appétits)\.$/);
});

test("la phrase de ton varie d'un plat à l'autre mais reste la même pour un même plat", () => {
  const same = Array.from({ length: 5 }, () => d("Durum poulet", { tone: "gourmand", id: "abc" })!.text);
  assert.equal(new Set(same).size, 1);
  const closers = new Set(Array.from({ length: 30 }, (_, i) => d("Durum poulet", { tone: "gourmand", id: `id-${i}` })!.text));
  assert.ok(closers.size >= 2, "plusieurs formulations pour ne pas écrire dix fois la même phrase");
});

// ─── Ce qu'on ne décrit pas, ce qu'on ne devine pas ──────────────────────────

test("boissons, desserts, sauces, formules et inconnus n'ont pas de description", () => {
  assert.equal(d("Coca-Cola 33 cl", { category: "Boissons" }), null);
  assert.equal(d("Tiramisu", { category: "Desserts" }), null);
  assert.equal(d("Samouraï", { category: "Sauces" }), null);
  assert.equal(d("Menu mitraillette", { category: "Menus" }), null);
  assert.equal(d("Spécialité du chef"), null);
  assert.equal(d(""), null);
});

test("le nom du type de plat n'est ajouté que si le restaurateur l'a écrit (nom ou catégorie)", () => {
  assert.equal(d("Royale", { category: "Pizzas" })?.text, "Une pizza Royale.");
  assert.equal(d("Calzone")?.text, "Calzone.", "classé pizza par le nom, mais « pizza » n'est écrit nulle part : on garde le nom");
  assert.equal(d("Royale", { category: "Les classiques" }), null, "ni classé ni écrit : pas de description");
});

test("un nom tout en majuscules est remis en forme", () => {
  assert.equal(d("PIZZA ROYALE")?.text, "Une pizza royale.");
  assert.equal(d("DURUM POULET")?.text, "Un durum poulet.");
});

test("espaces en trop et point final du nom sont nettoyés", () => {
  assert.equal(d("  Durum   poulet . ")?.text, "Un durum poulet.");
});

test("une description ne dépasse jamais la limite", () => {
  const long = d(`Pizza ${"très ".repeat(200)}bonne`, { tone: "fun" })!;
  assert.ok(long.text.length <= MAX_DESCRIPTION);
});

// ─── Le garde-fou : jamais rien d'inventé ────────────────────────────────────

test("le garde-fou repère un ingrédient, une viande ou un label absents du nom", () => {
  const src = { name: "Cheese burger" };
  assert.deepEqual(inventedWords("Un burger de bœuf au fromage.", src), ["boeuf"], "« bœuf » (ligature comprise) n'est pas dans le nom");
  assert.deepEqual(inventedWords("Un burger maison au cheddar fondant.", src).sort(), ["cheddar", "fondant", "maison"]);
  assert.deepEqual(inventedWords("Un burger au fromage.", src), []);
  assert.deepEqual(inventedWords("Un burger de bœuf au fromage.", { ...src, viande: "bœuf" }), [], "une réponse du restaurateur autorise le mot");
  assert.deepEqual(inventedWords("Un burger halal.", { name: "Burger", category: "Halal" }), [], "une catégorie écrite par lui aussi");
});

test("INVARIANT : aucune description générée n'introduit un ingrédient, une viande ou un label absent du nom", () => {
  const noms: [string, string][] = [
    ["Mitraillette kefta", "Snacks"], ["Mitraillette poulet", "Snacks"], ["Mitraillette hamburger", "Snacks"], ["Mitraillette merguez", "Snacks"],
    ["Mitraillette cordon bleu", "Snacks"], ["Mitraillette végétarienne", "Snacks"], ["Mitraillette dönerkebab", "Snacks"], ["Mitraillette mixte", "Snacks"],
    ["Durum poulet", ""], ["Durum kefta", ""], ["Dürüm mixte", ""], ["Durum falafel", ""], ["DURUM AGNEAU", ""],
    ["Pain turc poulet", ""], ["Pain turc mixte", ""], ["Panini jambon fromage", ""], ["Panini thon", ""], ["Kapsalon royal", ""], ["Kapsalon poulet", ""],
    ["Sandwich américain", ""], ["Sandwich poulet", ""], ["Wrap poulet", ""], ["Tacos simple", ""], ["Tacos double", ""],
    ["Pizza Margherita", ""], ["Pizza Royale", ""], ["Pizza Quatre fromages", ""], ["Pizza Hawaï", ""], ["Pizza Pepperoni", ""],
    ["Pizza Végétarienne", ""], ["Calzone", "Pizzas"], ["Margherita", "Pizzas"], ["Quatre saisons", "Pizzas"],
    ["Pâtes carbonara", ""], ["Pâtes poulet diabolo", ""], ["Pâtes pesto", ""], ["Spaghetti bolognaise", "Pâtes"],
    ["Cheese burger", "Burgers"], ["Bacon burger", ""], ["Burger poulet croustillant", ""], ["Burger végétarien", ""], ["Double cheddar burger", ""],
    ["Chicken burger", ""], ["Beef burger", ""], ["Burger steak haché", ""], ["Burger maison", ""],
    ["Nuggets x6", ""], ["Wings piquants", ""], ["Poulet frit", ""], ["Fricadelle", "Snacks"], ["Boulette sauce lapin", "Snacks"],
    ["California roll saumon", ""], ["Maki thon", ""], ["Poke bowl saumon", ""], ["Wok nouilles poulet", ""], ["Curry poulet", ""],
    ["Salade César", ""], ["Soupe de légumes", ""], ["Assiette kebab", ""], ["Brochette de bœuf", "Assiettes"], ["Croissant", "Petit-déjeuner"],
    ["Frites", "Accompagnements"], ["Falafel", "Entrées"],
  ];
  const viandes: (Viande | null)[] = [null, "bœuf", "poulet", "mélange"];
  let tested = 0;
  for (const [name, category] of noms) {
    for (const tone of TONES.map((t) => t.value)) {
      for (const viande of viandes) {
        for (const id of ["a", "bb", "ccc", "dddd"]) {
          const r = describeArticle({ id, name, category, family: classifyArticle({ name, category }), tone, viande });
          if (!r) continue;
          tested++;
          assert.deepEqual(inventedWords(r.text, { name, category, viande }), [], `« ${name} » (${tone}, ${viande}) : ${r.text}`);
          assert.ok(r.text.endsWith("."), r.text);
          assert.ok(!/\s{2,}|\n/.test(r.text), r.text);
        }
      }
    }
  }
  assert.ok(tested > 1500, `le test couvre assez de cas (${tested})`);
});

test("INVARIANT : la phrase de ton ne parle que du client, jamais du plat", () => {
  const closers = /(pour (se faire plaisir|les gourmands|les grosses faims|les vraies faims|les amateurs de [a-z ]+|une pause gourmande|ceux qui [a-zé' ]+|les gros appétits|les curieux|les fans de burgers)|à partager ou pas)\.$/;
  for (const tone of ["gourmand", "fun"] as Tone[]) {
    for (const [name, category] of [["Pizza Royale", ""], ["Durum poulet", ""], ["Cheese burger", ""], ["Poke bowl saumon", ""], ["Frites", "Accompagnements"], ["Salade César", ""]]) {
      for (let i = 0; i < 12; i++) {
        const text = d(name, { category, tone, id: `x${i}` })!.text;
        assert.match(text, closers, text);
      }
    }
  }
});
