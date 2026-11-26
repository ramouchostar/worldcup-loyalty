// ADR 0111 §1, §4 — ce qu'un CLIENT voit d'un article publié. PUR, testé. Rien d'interne ne sort : ni brouillon, ni
// auteur, ni motif. Le nom et le prix d'un plat sont lus sur la carte au moment de l'affichage ; un plat retiré de la
// carte fait disparaître son bloc. Une photo sans adresse (signature impossible) est cachée, jamais une image cassée.

import type { PublicMenu } from "../site-orders/menu";
import { excerpt, readBlocks } from "./blocks";
import type { PostBlock, PostRow } from "./types";

export type PublicDish = { id: string; name: string; priceCents: number; imageUrl: string | null; hasOptions: boolean };

export type PublicBlock =
  | { type: "p"; text: string }
  | { type: "h2"; text: string }
  | { type: "ul"; items: string[] }
  | { type: "photo"; url: string; alt: string }
  | { type: "dish"; dish: PublicDish };

export type PostCard = { slug: string; title: string; excerpt: string; publishedAt: string; publishedLabel: string; photoUrl: string | null };
export type PublicPost = { slug: string; title: string; publishedLabel: string; blocks: PublicBlock[] };

/** « 26 novembre 2026 », au jour de Bruxelles. */
export const dayLabel = (iso: string): string =>
  new Date(iso).toLocaleDateString("fr-BE", { day: "numeric", month: "long", year: "numeric", timeZone: "Europe/Brussels" });

/** Les plats proposés à la commande aujourd'hui, par identifiant. */
export function dishesOfMenu(menu: Pick<PublicMenu, "categories">): Map<string, PublicDish> {
  return new Map(
    menu.categories.flatMap((c) => c.items).map((it) => [
      it.id,
      { id: it.id, name: it.name, priceCents: it.priceCents, imageUrl: it.imageUrl, hasOptions: it.groups.length > 0 },
    ]),
  );
}

/** La photo qui illustre un article dans les listes : la première de la version publiée. */
export function coverPath(row: Pick<PostRow, "published_blocks">): string | null {
  const b = readBlocks(row.published_blocks).find((x) => x.type === "photo");
  return b?.type === "photo" ? b.path : null;
}

/** `null` si la ligne n'est pas lisible par un client (pas en ligne, ou sans version publiée). */
export function postCard(row: PostRow, photoUrls: ReadonlyMap<string, string>): PostCard | null {
  if (row.status !== "en_ligne" || !row.published_title || !row.first_published_at) return null;
  const cover = coverPath(row);
  return {
    slug: row.slug,
    title: row.published_title,
    excerpt: excerpt(readBlocks(row.published_blocks)),
    publishedAt: row.first_published_at,
    publishedLabel: dayLabel(row.first_published_at),
    photoUrl: cover ? photoUrls.get(cover) ?? null : null,
  };
}

/** Les blocs tels qu'on les montre : adresses de photos signées, plats relus sur la carte, le reste caché. */
export function viewBlocks(blocks: PostBlock[], photoUrls: ReadonlyMap<string, string>, dishes: ReadonlyMap<string, PublicDish>): PublicBlock[] {
  const out: PublicBlock[] = [];
  for (const b of blocks) {
    if (b.type === "photo") {
      const url = photoUrls.get(b.path);
      if (url) out.push({ type: "photo", url, alt: b.alt });
    } else if (b.type === "dish") {
      const dish = dishes.get(b.itemId);
      if (dish) out.push({ type: "dish", dish });
    } else if (b.type === "ul" ? b.items.length > 0 : b.text !== "") out.push(b);
  }
  return out;
}

export function publicPost(row: PostRow, photoUrls: ReadonlyMap<string, string>, dishes: ReadonlyMap<string, PublicDish>): PublicPost | null {
  if (row.status !== "en_ligne" || !row.published_title || !row.first_published_at) return null;
  return {
    slug: row.slug,
    title: row.published_title,
    publishedLabel: dayLabel(row.first_published_at),
    blocks: viewBlocks(readBlocks(row.published_blocks), photoUrls, dishes),
  };
}
