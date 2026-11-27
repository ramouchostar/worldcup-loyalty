// ADR 0111 — l'ARTICLE DE BLOG d'un restaurant (à ne pas confondre avec un « article » de la carte, `menu_items`).
// Formes et limites partagées par le serveur, la console et les pages client. PUR : aucun import serveur.

import type { BlogBlock } from "../blog/types";

/** Paragraphe et liste : les mêmes formes que le blog Boosteats ; l'intertitre sans ancre ; photo et plat en plus. */
export type PostBlock =
  | Extract<BlogBlock, { type: "p" }>
  | Omit<Extract<BlogBlock, { type: "h2" }>, "id">
  | Extract<BlogBlock, { type: "ul" }>
  /** `path` : le fichier dans l'espace de stockage privé ; `alt` : ce qu'on voit. */
  | { type: "photo"; path: string; alt: string }
  /** `itemId` : un article de la carte ; son nom et son prix sont lus à l'affichage, jamais recopiés ici. */
  | { type: "dish"; itemId: string };

export type PostBlockType = PostBlock["type"];

export type PostContent = { title: string; blocks: PostBlock[] };

export const LIMITS = {
  title: 80,
  blocks: 12,
  photos: 4,
  paragraph: 1500,
  heading: 80,
  listItems: 10,
  listItem: 150,
  alt: 150,
  maskReason: 300,
} as const;

/** Le fichier qu'on accepte d'un navigateur (ADR 0111 §5). */
export const PHOTO_MAX_BYTES = 2 * 1024 * 1024;
export const PHOTO_TYPES = ["image/jpeg", "image/png", "image/webp"] as const;
/** Fichiers gardés au plus dans le dossier d'un article (brouillon, version en ligne et envois abandonnés). */
export const PHOTO_MAX_FILES = 24;

export const POST_PHOTO_BUCKET = "restaurant-post-photos";
/** Durée d'une adresse signée : courte, un article retiré ne doit pas laisser ses photos accessibles. */
export const PHOTO_URL_TTL_SECONDS = 10 * 60;

export const POST_STATUSES = ["brouillon", "en_ligne", "retire", "masque"] as const;
export type PostStatus = (typeof POST_STATUSES)[number];

/** `auto` : composé et proposé par la publication automatique (ADR 0112). */
export type PostOrigin = "gerant" | "nina" | "auto";

export type PostRow = {
  id: string;
  restaurant_id: string;
  slug: string;
  lang: string;
  status: PostStatus;
  draft_title: string;
  draft_blocks: PostBlock[];
  revision: number;
  published_title: string | null;
  published_blocks: PostBlock[] | null;
  published_revision: number | null;
  origin: PostOrigin;
  rights_confirmed_at: string | null;
  rights_confirmed_by: string | null;
  mask_reason: string | null;
  masked_at: string | null;
  author_id: string | null;
  created_at: string;
  updated_at: string;
  first_published_at: string | null;
  published_at: string | null;
  withdrawn_at: string | null;
  /** Fin automatique (ADR 0112) : passé cet instant, aucun client ne le lit. Absente tant que la migration 20261126-2330 manque. */
  expires_at?: string | null;
  /** La mention de source écrite sous un article automatique, que le client lit. */
  source_credit?: string | null;
  /** L'offre qu'annonce l'article (ADR 0110) : il n'est lu que tant qu'elle vaut. Absente tant que la migration 20261127-1400 manque. */
  offer_id?: string | null;
};

export type PostEventKind =
  | "publie" | "retire" | "masque" | "demasque" | "supprime" | "signale" | "refuse"
  // La publication automatique (ADR 0112).
  | "auto_active" | "auto_arret" | "auto_prevenu" | "auto_publie" | "auto_refus" | "auto_ecarte";
export type PostCounter = "lecture" | "carte";
export const POST_COUNTERS: readonly PostCounter[] = ["lecture", "carte"];
