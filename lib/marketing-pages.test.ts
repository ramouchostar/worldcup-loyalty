import { test } from "node:test";
import assert from "node:assert/strict";
import { MARKETING_PAGES, getMarketingPage } from "./marketing-pages";
import { SEO_PAGES, PRIVATE_PREFIXES } from "./seo-pages";

test("slugs uniques, liens internes valides, toutes les pages dans le sitemap", () => {
  const slugs = MARKETING_PAGES.map((p) => p.slug);
  assert.equal(new Set(slugs).size, slugs.length);
  const sitemap = new Set(SEO_PAGES.map((p) => p.path));
  for (const p of MARKETING_PAGES) {
    assert.ok(sitemap.has(`/${p.slug}`), `${p.slug} absent du sitemap`);
    for (const r of p.related) assert.ok(getMarketingPage(r), `${p.slug} → lien mort ${r}`);
    assert.ok(!PRIVATE_PREFIXES.some((x) => `/${p.slug}`.startsWith(x)), p.slug);
    if (p.kind === "fonction") assert.ok(p.pillar, `${p.slug} sans pilier`);
    if (p.kind === "analyse") assert.ok((p.checklist?.items.length ?? 0) >= 6, `${p.slug} : contenu propre insuffisant`);
  }
});

test("titres et descriptions à la bonne longueur pour Google", () => {
  for (const p of MARKETING_PAGES) {
    assert.ok(p.metaTitle.length <= 58, `${p.slug} : titre ${p.metaTitle.length}`);
    assert.ok(p.metaDescription.length >= 120 && p.metaDescription.length <= 160, `${p.slug} : description ${p.metaDescription.length}`);
  }
});

test("règles de texte : pas de technique, pas de promesse interdite, pas de fonction non livrée au présent", () => {
  const banned = [
    "grâce à nous", "exploser", "réseau de clients", "tickets de plus", "seo", " crm", "segment", "attribution",
    " ia ", "intelligence artificielle", "ocr", "algorithme", " api", "copilote", "plafonné", "99 €",
  ];
  for (const p of MARKETING_PAGES) {
    const text = ` ${JSON.stringify(p).toLowerCase()} `;
    for (const b of banned) assert.ok(!text.includes(b), `${p.slug} contient « ${b.trim()} »`);
  }
});
