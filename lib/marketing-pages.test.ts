import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { MARKETING_PAGES, getMarketingPage } from "./marketing-pages";
import { SEO_PAGES, PRIVATE_PREFIXES } from "./seo-pages";
import { BLOG_ARTICLES, getArticle } from "./blog";

// Mots interdits sur le site public (ADR 0064, 0070, .claude/product-marketing.md,
// décisions du 2026-11-01). « api » et « ia » en mots entiers seulement.
const BANNED = [
  "grâce à nous", "exploser", "réseau de clients", "tickets de plus", "seo", " crm", "segment", "attribution",
  " ia ", " ia,", " ia.", "intelligence artificielle", "ocr", "algorithme", " api ", "copilote", "plafonné", "99 €",
];
const banned = (text: string) => BANNED.filter((b) => ` ${text.toLowerCase()} `.includes(b));

test("chaque page du registre a son fichier, est dans le sitemap et n'est pas privée", () => {
  const sitemap = new Set(SEO_PAGES.map((p) => p.path));
  assert.equal(new Set(MARKETING_PAGES.map((p) => p.slug)).size, MARKETING_PAGES.length);
  for (const p of MARKETING_PAGES) {
    assert.ok(existsSync(`app/(public)/${p.slug}/page.tsx`), `${p.slug} : fichier de page manquant`);
    assert.ok(sitemap.has(`/${p.slug}`), `${p.slug} absent du sitemap`);
    assert.ok(!PRIVATE_PREFIXES.some((x) => `/${p.slug}`.startsWith(x)), p.slug);
    if (p.kind === "fonction") assert.ok(p.pillar, `${p.slug} sans pilier`);
    assert.ok(p.metaTitle.length <= 58, `${p.slug} : titre ${p.metaTitle.length}`);
    assert.ok(p.metaDescription.length >= 120 && p.metaDescription.length <= 160, `${p.slug} : description ${p.metaDescription.length}`);
  }
});

test("le texte des pages respecte les règles (fichier de page et registre)", () => {
  for (const p of MARKETING_PAGES) {
    const file = `app/(public)/${p.slug}/page.tsx`;
    // Texte visible seulement : sans commentaires ni lignes d'import (un chemin
    // comme « seo-pages » n'est pas un mot lu par le restaurateur).
    const source = existsSync(file) ? readFileSync(file, "utf8") : "";
    const visible = source
      .replace(/\/\*[\s\S]*?\*\//g, " ")
      .replace(/\{\s*\/\*[\s\S]*?\*\/\s*\}/g, " ")
      .replace(/^\s*\/\/.*$/gm, " ")
      .replace(/^\s*import .*$/gm, " ");
    const text = JSON.stringify(p) + visible;
    assert.deepEqual(banned(text), [], `${p.slug} contient des mots interdits`);
  }
});

// Brigade 17 (2026-11-05) : la landing (`/`, components/restaurateurs/**) suit
// les mêmes règles, plus celles de la brigade (CONTEXT.md, _Avoid_ de
// « Brigade ») : jamais IA, robot, bot, agent ; pas de « roue » ; et plus
// l'exemple « commande de 25 € : −7,50 € » de la maquette (décision du 2026-11-05).
const LANDING_BANNED = [" robot", " bot ", " bots ", "agent", " roue", "7,50", "instantané"];
const LANDING_DIR = "components/restaurateurs";

const visibleText = (source: string) =>
  source
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .replace(/\{\s*\/\*[\s\S]*?\*\/\s*\}/g, " ")
    .replace(/^\s*\/\/.*$/gm, " ")
    .replace(/^\s*import .*$/gm, " ")
    .replace(/^\s*\} from .*$/gm, " ")
    // Les noms de classes Tailwind ne sont pas lus par le restaurateur.
    .replace(/className=(\{`[^`]*`\}|"[^"]*")/g, " ");

test("landing restaurateurs : mots interdits absents du texte visible", () => {
  const files = readdirSync(LANDING_DIR).filter((f) => /\.tsx?$/.test(f));
  assert.ok(files.length > 0);
  for (const f of files) {
    const text = visibleText(readFileSync(`${LANDING_DIR}/${f}`, "utf8"));
    const lower = ` ${text.toLowerCase()} `;
    assert.deepEqual(banned(text), [], `${f} contient des mots interdits`);
    assert.deepEqual(LANDING_BANNED.filter((b) => lower.includes(b)), [], `${f} : mot interdit sur la landing`);
    // « IA » en majuscules, mot entier (sans attraper « via », « médias »…).
    assert.ok(!/\bIA\b/.test(text), `${f} : « IA » dans le texte`);
  }
});

test("landing restaurateurs : Nina et Max restent présentés en pilote", async () => {
  const { BRIGADE } = await import("../components/restaurateurs/brigade");
  assert.equal(BRIGADE.length, 7);
  assert.deepEqual(BRIGADE.filter((a) => a.pilot).map((a) => a.id).sort(), ["max", "nina"]);
  for (const a of BRIGADE) assert.ok(existsSync(`public${a.photo}`), `${a.id} : portrait manquant`);
});

test("articles du blog : format, longueurs, liens, règles de texte", () => {
  assert.equal(new Set(BLOG_ARTICLES.map((a) => a.slug)).size, BLOG_ARTICLES.length);
  for (const a of BLOG_ARTICLES) {
    assert.ok(a.metaTitle.length <= 58, `${a.slug} : titre ${a.metaTitle.length}`);
    assert.ok(a.metaDescription.length >= 120 && a.metaDescription.length <= 160, `${a.slug} : description ${a.metaDescription.length}`);
    assert.ok(!Number.isNaN(Date.parse(a.published)), a.slug);
    const ids = a.blocks.flatMap((b) => (b.type === "h2" ? [b.id] : []));
    assert.equal(new Set(ids).size, ids.length, `${a.slug} : ancres en double`);
    assert.ok(a.blocks.some((b) => b.type === "cta"), `${a.slug} : aucun appel à l'action dans le texte`);
    for (const r of a.related) {
      const ok = r.startsWith("blog/") ? !!getArticle(r.slice(5)) : !!getMarketingPage(r);
      assert.ok(ok, `${a.slug} → lien mort ${r}`);
    }
    assert.deepEqual(banned(JSON.stringify(a)), [], `${a.slug} contient des mots interdits`);
  }
});
