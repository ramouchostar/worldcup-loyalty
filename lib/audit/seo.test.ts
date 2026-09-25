import { test } from "node:test";
import assert from "node:assert/strict";
import { platformsOutrank, readSite, scoreSite, seoGaps } from "./seo";

const HTML = `<!doctype html><html lang="fr"><head>
<title>Krusty Smash Burger - Commander un repas en ligne à Anderlecht</title>
<meta name="description" content="Smash burgers halal faits maison à Anderlecht, à 2 minutes de Delacroix. Commandez en ligne ou venez sur place.">
<meta name="viewport" content="width=device-width, initial-scale=1">
<script type="application/ld+json">{"@context":"https://schema.org","@type":"Restaurant","name":"Krusty","address":{"@type":"PostalAddress","postalCode":"1070"}}</script>
</head><body><h1>KRUSTY SMASH BURGER</h1>
<a href="/menu">Notre carte</a>
<a href="https://www.takeaway.com/be-fr/menu/krusty">Commander</a>
<img src="a.jpg"><img src="b.jpg" alt="Smash">
<footer>Rue Ropsy Chaudron 65, 1070 Anderlecht · 0497 67 84 73</footer></body></html>`;

test("lecture du site : titre, description, balisage, adresse, liens", () => {
  const s = readSite(HTML, "https://krusty.be", "https://krusty.be/", 200, { phone: "0497 67 84 73", postalCode: "1070" });
  assert.equal(s.https, true);
  assert.match(s.title ?? "", /Anderlecht/);
  assert.ok(s.viewport);
  assert.deepEqual(s.schemaTypes.sort(), ["PostalAddress", "Restaurant"]);
  assert.ok(s.schemaHasAddress);
  assert.ok(!s.schemaHasHours);
  assert.ok(s.phoneOnPage && s.postalOnPage);
  assert.ok(s.menuLink && !s.menuIsPdf);
  assert.deepEqual(s.orderLinks, { direct: false, platforms: ["Takeaway.com"] });
  assert.equal(s.imagesWithoutAlt, 1);
});

test("note du site et manques pour le moteur", () => {
  const site = readSite(HTML, "https://krusty.be", null, 200, { phone: "0497 67 84 73", postalCode: "1070" });
  const { score, checks } = scoreSite(site, null, { rank: 5, keyword: "burger Anderlecht" }, { keyword: "burger", commune: "Anderlecht" });
  assert.ok(score != null && score > 50 && score < 100);
  const st = (k: string) => checks.find((c) => c.key === k)?.status;
  assert.equal(st("schema"), "partiel"); // Restaurant + adresse, sans horaires
  assert.equal(st("commande"), "partiel"); // seulement Takeaway.com
  assert.equal(st("vitesse"), "non_verifie"); // PageSpeed indisponible : hors dénominateur
  assert.equal(st("google"), "partiel"); // 5e
  assert.deepEqual(seoGaps(checks).sort(), ["seo_commande_plateformes", "seo_rang_google", "seo_schema"]);
});

test("pas de site : un seul manque, lourd", () => {
  const { checks } = scoreSite(null, null, { rank: null, keyword: "pizza Uccle" }, { keyword: "pizza", commune: "Uccle" });
  assert.ok(seoGaps(checks).includes("seo_pas_de_site"));
});

test("les plateformes de livraison passent-elles devant le site ?", () => {
  const top = [
    { rank: 1, title: "", domain: "tripadvisor.be" },
    { rank: 2, title: "", domain: "ubereats.com" },
    { rank: 5, title: "", domain: "krusty.be" },
  ];
  assert.equal(platformsOutrank({ keyword: "k", rank: 5, top }), true);
  assert.equal(platformsOutrank({ keyword: "k", rank: 1, top: [{ rank: 1, title: "", domain: "krusty.be" }, { rank: 3, title: "", domain: "deliveroo.be" }] }), false);
  assert.equal(platformsOutrank(null), null);
});
