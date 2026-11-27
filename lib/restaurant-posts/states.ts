// ADR 0111 §3 et §6 — les quatre états d'un article et qui peut faire quoi. PUR, testé.
// Brouillon, en ligne, retiré, masqué par Boosteats. Gérant et manager écrivent, publient et retirent ; un siège
// « équipe » non ; la plateforme ne publie jamais à la place du restaurant, elle peut seulement masquer.

import type { PostRow, PostStatus } from "./types";
import { readBlocks, sameContent } from "./blocks";

export const STATUS_LABEL: Record<PostStatus, string> = {
  brouillon: "Brouillon",
  en_ligne: "En ligne",
  retire: "Retiré",
  masque: "Masqué par Boosteats",
};

/** « Oui, publier » : possible partout sauf quand Boosteats a masqué (seule la plateforme lève le masquage). */
export const canPublish = (status: PostStatus): boolean => status !== "masque";
export const canWithdraw = (status: PostStatus): boolean => status === "en_ligne";
/** Masquer vise ce que des clients ont pu lire : en ligne, ou retiré (il pourrait revenir). */
export const canMask = (status: PostStatus): boolean => status === "en_ligne" || status === "retire";
export const canUnmask = (status: PostStatus): boolean => status === "masque";

/** Ce qu'on sait d'une personne devant la console (lib/admin-guard.ts). */
export type Seat = { isOwner: boolean; isLegacyAdmin: boolean; isSuperAdmin: boolean; seatRole: string | null };

const isRestaurantManager = (a: Seat) => a.isOwner || a.isLegacyAdmin || a.seatRole === "gerant" || a.seatRole === "manager";

/** Écrire, publier, retirer, supprimer : le gérant ou le manager du restaurant, jamais la plateforme à sa place. */
export const canWritePosts = (a: Seat): boolean => isRestaurantManager(a);
/** Voir la liste : les mêmes, et la plateforme (assistance), qui ne peut rien y changer. */
export const canSeePosts = (a: Seat): boolean => isRestaurantManager(a) || a.isSuperAdmin;

/** L'article est en ligne et le brouillon dit autre chose : « des changements attendent ton Oui ». */
export function hasPendingChanges(row: Pick<PostRow, "status" | "draft_title" | "draft_blocks" | "published_title" | "published_blocks">): boolean {
  if (row.status !== "en_ligne" || row.published_title === null) return false;
  return !sameContent(
    { title: row.draft_title, blocks: readBlocks(row.draft_blocks) },
    { title: row.published_title, blocks: readBlocks(row.published_blocks) },
  );
}
