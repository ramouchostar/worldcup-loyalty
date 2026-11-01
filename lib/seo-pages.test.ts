import { test } from "node:test";
import assert from "node:assert/strict";
import { SEO_PAGES, PRIVATE_PREFIXES, absoluteUrl } from "./seo-pages";

test("aucune page du sitemap n'est dans un préfixe privé", () => {
  for (const p of SEO_PAGES) {
    for (const prefix of PRIVATE_PREFIXES) {
      assert.ok(!(p.path === prefix || p.path.startsWith(prefix.endsWith("/") ? prefix : `${prefix}/`)), `${p.path} est privé (${prefix})`);
    }
  }
});

test("chemins uniques, dates valides, URL absolues sur www", () => {
  assert.equal(new Set(SEO_PAGES.map((p) => p.path)).size, SEO_PAGES.length);
  for (const p of SEO_PAGES) assert.ok(!Number.isNaN(Date.parse(p.updated)), p.path);
  assert.equal(absoluteUrl("/"), "https://www.boosteats.be");
  assert.equal(absoluteUrl("/audit-gratuit"), "https://www.boosteats.be/audit-gratuit");
});
