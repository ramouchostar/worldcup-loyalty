import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { addToCart, saveCart } from "../site-orders/cart";
import type { PublicItem, PublicMenu } from "../site-orders/menu";
import { PRIVATE_PREFIXES, SEO_PAGES } from "../seo-pages";
import { cartStorageKey, savedCartCount } from "./cart-peek";
import type { PostRow } from "./types";
import { dishesOfMenu, postCard, publicPost } from "./view";

const item: PublicItem = { id: "33333333-3333-4333-8333-333333333333", name: "Tenders", priceCents: 890, description: null, allergens: { text: "", confirmed: false }, imageUrl: null, groups: [] };
const menu: PublicMenu = { restaurant: { id: "r", name: "Resto", logoUrl: null }, retentionDays: 30, whatsapp: null, categories: [{ name: "Poulet", items: [item] }], hidden: 0 };

const row: PostRow = {
  id: "p", restaurant_id: "r", slug: "menu", lang: "fr", status: "en_ligne", draft_title: "Brouillon secret", draft_blocks: [{ type: "p", text: "pas encore dit" }], revision: 2,
  published_title: "Menu", published_blocks: [
    { type: "p", text: "Bonjour" }, { type: "photo", path: "r/p/a.jpg", alt: "Une photo" }, { type: "photo", path: "r/p/b.jpg", alt: "Sans adresse" },
    { type: "dish", itemId: item.id }, { type: "dish", itemId: "44444444-4444-4444-8444-444444444444" },
  ],
  published_revision: 1, origin: "gerant", rights_confirmed_at: null, rights_confirmed_by: "u", mask_reason: null, masked_at: null, author_id: "u",
  created_at: "2026-11-20T10:00:00Z", updated_at: "2026-11-26T10:00:00Z", first_published_at: "2026-11-25T23:30:00Z", published_at: "2026-11-26T09:00:00Z", withdrawn_at: null,
};
const urls = new Map([["r/p/a.jpg", "https://signe/a"]]);

test("le client lit la version publiée : plat retiré caché, photo sans adresse cachée, prix de la carte", () => {
  const post = publicPost(row, urls, dishesOfMenu(menu))!;
  assert.equal(post.title, "Menu");
  assert.equal(post.publishedLabel, "26 novembre 2026"); // au jour de Bruxelles
  assert.deepEqual(post.blocks.map((b) => b.type), ["p", "photo", "dish"]);
  const dish = post.blocks[2];
  assert.equal(dish.type === "dish" && dish.dish.priceCents, 890);
});

test("rien d'interne ne sort, et un article qui n'est pas en ligne n'existe pas", () => {
  const out = JSON.stringify([publicPost(row, urls, dishesOfMenu(menu)), postCard(row, urls)]);
  for (const secret of ["secret", "pas encore dit", "author", "rights", "r/p/a.jpg", "revision"]) assert.equal(out.includes(secret), false, secret);
  for (const status of ["brouillon", "retire", "masque"] as const) {
    assert.equal(publicPost({ ...row, status }, urls, dishesOfMenu(menu)), null);
    assert.equal(postCard({ ...row, status }, urls), null);
  }
  assert.equal(postCard(row, urls)?.photoUrl, "https://signe/a");
});

test("le panier gardé par la page de commande se compte sans être touché", () => {
  const now = Date.now();
  const raw = JSON.stringify(saveCart(addToCart([], item, {}, 2), now));
  assert.equal(savedCartCount(raw, menu, now), 2);
  assert.equal(savedCartCount(raw, { ...menu, categories: [] }, now), 0);
  assert.equal(savedCartCount(raw, menu, now + 3 * 60 * 60 * 1000), 0);
  assert.equal(savedCartCount(null, menu), 0);
  assert.equal(savedCartCount("{", menu), 0);
});

test("la clé du panier est la même que celle de la page de commande", () => {
  const files = ["components/commander/OrderApp.tsx", "lib/site-orders/cart.ts"].map((f) => readFileSync(join(process.cwd(), f), "utf8")).join("\n");
  assert.equal(cartStorageKey("x"), "site_order_cart:x");
  assert.ok(files.includes("site_order_cart"), "la page de commande a changé de clé : ajuster lib/restaurant-posts/cart-peek.ts");
});

test("les articles ne sont pas indexés : noindex, absents du plan du site, pas bloqués dans robots.txt (ADR 0111 §2)", () => {
  for (const f of ["app/commander/[restaurantId]/articles/page.tsx", "app/commander/[restaurantId]/articles/[slug]/page.tsx"]) {
    assert.match(readFileSync(join(process.cwd(), f), "utf8"), /robots: \{ index: false, follow: false \}/, f);
  }
  assert.equal(SEO_PAGES.some((p) => p.path.startsWith("/commander")), false);
  assert.equal(PRIVATE_PREFIXES.some((p) => "/commander/r/articles".startsWith(p)), false);
});
