import { test } from "node:test";
import assert from "node:assert/strict";
import { excerpt, isPhotoPathOf, parseContent, readBlocks, sameContent } from "./blocks";
import { draftSlug, isSlug, slugCandidate, slugify } from "./slug";
import { LIMITS } from "./types";

const POST = "11111111-1111-4111-8111-111111111111";
const FILE = "22222222-2222-4222-8222-222222222222.jpg";
const owner = { restaurantId: "resto", postId: POST };
const photo = (path = `resto/${POST}/${FILE}`) => ({ type: "photo", path, alt: "Le comptoir" });

test("un brouillon peut être incomplet, mais pas hors forme", () => {
  const r = parseContent({ title: "  Nouveau   menu ", blocks: [{ type: "p", text: "" }, { type: "dish", itemId: "" }, { type: "ul", items: ["a", "  ", "b"] }] }, null);
  assert.ok(r.ok);
  assert.equal(r.content.title, "Nouveau menu");
  assert.deepEqual(r.content.blocks[2], { type: "ul", items: ["a", "b"] });
});

test("bloc inconnu, article illisible, identifiant de plat inventé : refusés", () => {
  for (const raw of [null, {}, { title: 3, blocks: [] }, { title: "a", blocks: [{ type: "cta" }] }, { title: "a", blocks: [{ type: "dish", itemId: "../x" }] }, { title: "a", blocks: ["p"] }]) {
    assert.equal(parseContent(raw, owner).ok, false, JSON.stringify(raw));
  }
});

test("les limites de l'ADR 0111 §4 : titre 80, 12 blocs, 4 photos, rien de tronqué en silence", () => {
  assert.equal(parseContent({ title: "x".repeat(LIMITS.title), blocks: [] }, null).ok, true);
  assert.equal(parseContent({ title: "x".repeat(LIMITS.title + 1), blocks: [] }, null).ok, false);
  const p = { type: "p", text: "a" };
  assert.equal(parseContent({ title: "a", blocks: Array(LIMITS.blocks).fill(p) }, null).ok, true);
  assert.equal(parseContent({ title: "a", blocks: Array(LIMITS.blocks + 1).fill(p) }, null).ok, false);
  assert.equal(parseContent({ title: "a", blocks: Array(LIMITS.photos).fill(photo()) }, owner).ok, true);
  assert.equal(parseContent({ title: "a", blocks: Array(LIMITS.photos + 1).fill(photo()) }, owner).ok, false);
  assert.equal(parseContent({ title: "a", blocks: [{ type: "p", text: "x".repeat(LIMITS.paragraph + 1) }] }, null).ok, false);
  assert.equal(parseContent({ title: "a", blocks: [{ type: "ul", items: Array(LIMITS.listItems + 1).fill("a") }] }, null).ok, false);
});

test("une photo vient du dossier de CET article, jamais d'un autre", () => {
  assert.equal(isPhotoPathOf(`resto/${POST}/${FILE}`, "resto", POST), true);
  for (const path of [`autre/${POST}/${FILE}`, `resto/${FILE.slice(0, -4)}/${FILE}`, `resto/${POST}/../${FILE}`, `resto/${POST}/photo.svg`, `https://x.be/${FILE}`]) {
    assert.equal(parseContent({ title: "a", blocks: [photo(path)] }, owner).ok, false, path);
  }
  assert.equal(parseContent({ title: "a", blocks: [photo()] }, null).ok, false); // à la création : aucune photo possible
});

test("les caractères invisibles disparaissent (ils cacheraient un mot au contrôle)", () => {
  const hidden = `glu${String.fromCharCode(0x200b)}ten${String.fromCharCode(0xad)}`;
  const r = parseContent({ title: hidden, blocks: [{ type: "p", text: `a\r\n\r\n\r\n\r\nb ${hidden}` }] }, null);
  assert.ok(r.ok);
  assert.equal(r.content.title, "gluten");
  assert.deepEqual(r.content.blocks[0], { type: "p", text: "a\n\nb gluten" });
});

test("lecture de la base : les blocs abîmés sont ignorés", () => {
  assert.deepEqual(readBlocks("x"), []);
  assert.deepEqual(readBlocks([{ type: "p", text: "ok" }, { type: "p" }, null, { type: "table" }]), [{ type: "p", text: "ok" }]);
});

test("les premières lignes : le premier paragraphe, coupé à un mot", () => {
  assert.equal(excerpt([{ type: "h2", text: "Titre" }, { type: "p", text: "Bonjour à tous." }]), "Bonjour à tous.");
  const long = excerpt([{ type: "p", text: "mot ".repeat(100) }], 20);
  assert.ok(long.endsWith("…") && long.length <= 21 && !long.includes("mo…"), long);
  assert.equal(excerpt([{ type: "ul", items: ["un", "deux"] }]), "un, deux");
  assert.equal(excerpt([]), "");
});

test("deux contenus identiques le restent quel que soit l'ordre des clés rendu par la base", () => {
  const a = { title: "t", blocks: [{ type: "photo" as const, path: "p", alt: "a" }] };
  const b = { title: "t", blocks: [{ alt: "a", path: "p", type: "photo" as const }] };
  assert.equal(sameContent(a, b), true);
  assert.equal(sameContent(a, { ...b, title: "u" }), false);
});

test("adresse d'article : tirée du titre, sans accents, bornée", () => {
  assert.equal(slugify("Nouveau menu d'été !"), "nouveau-menu-d-ete");
  assert.equal(slugify("Œufs brouillés"), "oeufs-brouilles");
  assert.equal(slugify("🎉"), "article");
  const long = slugify("un titre vraiment très long qui ne tient pas dans une adresse raisonnable du tout");
  assert.ok(long.length <= 60 && isSlug(long) && !long.endsWith("-"), long);
  assert.equal(slugCandidate("menu", 1), "menu");
  assert.equal(slugCandidate("menu", 3), "menu-3");
  assert.ok(isSlug(draftSlug("AB12-cd34-ef56-7890")));
  assert.equal(isSlug("a b"), false);
  assert.equal(isSlug("-a"), false);
});
