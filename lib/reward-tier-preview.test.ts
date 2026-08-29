import { test } from "node:test";
import assert from "node:assert/strict";
import { buildTierPreview, type CatalogItem, type Layer } from "./reward-tier-preview";

const item = (id: string, name: string, menu_price: number): CatalogItem => ({ id, name, menu_price });

test("catalogue vide → aucune ligne, sans planter", () => {
  assert.deepEqual(buildTierPreview([], new Map()), []);
});

test("aucun palier référencé pour une couche → cette couche est absente", () => {
  const catalog = [item("a", "Frites", 3)];
  const rows = buildTierPreview(catalog, new Map());
  assert.deepEqual(rows, []);
});

test("référence vers un article absent du catalogue éligible → couche ignorée, pas de crash", () => {
  const catalog = [item("a", "Frites", 3)];
  const firstByLayer = new Map<Layer, string>([["solo", "n-existe-pas"]]);
  assert.deepEqual(buildTierPreview(catalog, firstByLayer), []);
});

test("un seul article au catalogue → toujours lui, quelle que soit la tranche", () => {
  const catalog = [item("a", "Frites", 3)];
  const firstByLayer = new Map<Layer, string>([["solo", "a"]]);
  const rows = buildTierPreview(catalog, firstByLayer);
  assert.deepEqual(rows, [{ layer: "solo", productName: "Frites" }]);
});

test("l'ordre des lignes suit toujours solo → community → saver, peu importe l'ordre d'insertion", () => {
  const catalog = [item("a", "Frites", 3), item("b", "Burger", 12), item("c", "Menu XL", 20)];
  const firstByLayer = new Map<Layer, string>([
    ["saver", "c"],
    ["solo", "a"],
    ["community", "b"],
  ]);
  const rows = buildTierPreview(catalog, firstByLayer, () => 0);
  assert.deepEqual(
    rows.map((r) => r.layer),
    ["solo", "community", "saver"]
  );
});

test("tirage déterministe : rng=0 prend le premier article de la tranche, rng proche de 1 le dernier", () => {
  // Tertiles sur 6 prix triés [1,2,3,10,11,12] : p33=sorted[2]=3, p66=sorted[4]=11.
  // Tranche "petit produit" (<=3) : Frites(1), Nuggets(2), Wings(3).
  const catalog = [
    item("nuggets", "Nuggets", 2),
    item("frites", "Frites", 1),
    item("wings", "Wings", 3),
    item("burger", "Burger", 10),
    item("menu", "Menu", 11),
    item("xl", "XL", 12),
  ];
  const firstByLayer = new Map<Layer, string>([["solo", "frites"]]); // réf. dans la tranche "petit produit"

  const low = buildTierPreview(catalog, firstByLayer, () => 0);
  const high = buildTierPreview(catalog, firstByLayer, () => 0.999);

  // Le nom tiré doit appartenir à la même tranche que la référence (Frites) :
  // {Nuggets, Frites, Wings} dans l'ordre d'apparition au catalogue.
  const smallBucketNames = ["Nuggets", "Frites", "Wings"];
  assert.ok(smallBucketNames.includes(low[0].productName));
  assert.ok(smallBucketNames.includes(high[0].productName));
  assert.equal(low[0].productName, "Nuggets"); // premier de la tranche dans l'ordre du catalogue
  assert.equal(high[0].productName, "Wings"); // dernier de la tranche
});

test("tous les articles au même prix → une seule tranche, aucun crash", () => {
  const catalog = [item("a", "A", 5), item("b", "B", 5), item("c", "C", 5)];
  const firstByLayer = new Map<Layer, string>([["community", "b"]]);
  const rows = buildTierPreview(catalog, firstByLayer, () => 0.5);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].layer, "community");
  assert.ok(["A", "B", "C"].includes(rows[0].productName));
});

test("jamais de fuite de tranche entre deux couches sur des paliers différents", () => {
  // 4 articles pour que les 3 tranches soient toutes atteignables (voir le
  // test suivant sur la limite à 3 articles) : petit(1), petit bis(2, même
  // tranche, pour vérifier que le tirage reste bien DANS la tranche de la
  // référence), milieu(15), premium(30).
  const catalog = [
    item("petit", "Petit produit", 1),
    item("petit-bis", "Petit produit bis", 2),
    item("milieu", "Milieu de panier", 15),
    item("premium", "Premium", 30),
  ];
  const firstByLayer = new Map<Layer, string>([
    ["solo", "milieu"],
    ["community", "premium"],
    ["saver", "petit"],
  ]);
  const rows = buildTierPreview(catalog, firstByLayer, () => 0);
  assert.deepEqual(rows, [
    { layer: "solo", productName: "Milieu de panier" },
    { layer: "community", productName: "Premium" },
    { layer: "saver", productName: "Petit produit" }, // premier de sa tranche (avec "Petit produit bis")
  ]);
});

test("limite connue : avec seulement 3 articles, le moins cher et le médian partagent la même tranche", () => {
  // n=3 : p33 = sorted[1] (le prix médian), p66 = sorted[2] (le prix max,
  // floor(2*3/3)=2=dernier index). Le médian passe `price<=p33` par égalité
  // et rejoint la tranche "petit produit" avec le moins cher ; la tranche
  // "premium" (catégorie 1) n'est jamais atteignable avec 3 articles ou
  // moins — il en faut au moins 4 distincts (voir le test précédent).
  // Comportement hérité de l'ADR 0042, documenté ici pour ne pas surprendre.
  const catalog = [item("bas", "Bas", 2), item("milieu", "Milieu", 8), item("haut", "Haut", 20)];

  const lowAndMid = buildTierPreview(
    catalog,
    new Map<Layer, string>([["solo", "bas"], ["community", "milieu"]]),
    () => 0
  );
  assert.equal(lowAndMid[0].productName, lowAndMid[1].productName); // même tranche, même tirage

  const high = buildTierPreview(catalog, new Map<Layer, string>([["saver", "haut"]]), () => 0);
  assert.notEqual(high[0].productName, lowAndMid[0].productName); // le plus cher, seul dans sa tranche
});
