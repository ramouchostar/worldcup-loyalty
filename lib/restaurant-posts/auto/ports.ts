// ADR 0112 — ce que la publication automatique attend du monde : la base, les sources, la carte, le message qui
// prévient. En production : db.ts et server.ts ; dans les tests : une mémoire.

import type { PublicMenu } from "../../site-orders/menu";
import type { PostsDb } from "../service";
import type { PostContent, PostRow } from "../types";
import type { SendProof } from "./proof";
import type { AutoReason } from "./reasons";
import type { OccasionSource } from "./sources/types";
import type { AutoSettings, Occasion, OccasionStatus, Offerings } from "./types";

export type NewOccasion = Omit<Occasion, "id" | "created_at" | "updated_at">;

export type AutoDb = {
  settings(restaurantId: string): Promise<AutoSettings | null>;
  enabledSettings(): Promise<AutoSettings[]>;
  saveSettings(row: AutoSettings): Promise<void>;
  /** Les occasions d'un établissement dont le jour de publication est `sinceDay` ou après. */
  recentOccasions(restaurantId: string, sinceDay: string): Promise<Occasion[]>;
  occasion(id: string): Promise<Occasion | null>;
  occasionByPost(restaurantId: string, postId: string): Promise<Occasion | null>;
  /** Prévues ou annoncées ; `restaurantId` absent = tous les établissements. */
  pendingOccasions(restaurantId?: string): Promise<Occasion[]>;
  /** `null` : cette occasion existe déjà, ou le jour est déjà pris. */
  insertOccasion(row: NewOccasion): Promise<Occasion | null>;
  /** Écrit SEULEMENT si l'occasion est encore dans l'un des états attendus ; `null` sinon (ou jour déjà pris). */
  updateOccasion(id: string, patch: Partial<Occasion>, expect: readonly OccasionStatus[]): Promise<Occasion | null>;
  /** La ligne du journal des messages ; `null` si elle n'existe pas. */
  sendProof(sendId: string): Promise<SendProof | null>;
  /** Les articles encore « en ligne » dont la fin est passée. */
  expiredPosts(nowIso: string): Promise<PostRow[]>;
};

export type AutoRestaurant = {
  id: string;
  name: string;
  coords: { lat: number; lng: number } | null;
  /** L'espace de commande est ouvert (drapeau ET forfait) et l'établissement actif. */
  open: boolean;
};

export type NotifyInput = {
  occasion: Occasion;
  content: PostContent;
  restaurant: AutoRestaurant;
  settings: AutoSettings;
  /** L'identifiant sous lequel le message s'écrit au journal. */
  sendId: string;
};

export type AutoDeps = {
  db: AutoDb;
  posts: PostsDb;
  sources: OccasionSource[];
  now: Date;
  restaurant(restaurantId: string): Promise<AutoRestaurant | null>;
  /** La carte proposée à la commande aujourd'hui ; `null` si elle ne se lit pas. */
  menu(restaurantId: string): Promise<PublicMenu | null>;
  offerings(restaurantId: string): Promise<Offerings>;
  /** Prévenir la veille (e-mail, puis notification si activée). `sent: false` : le message n'est pas parti. */
  notify(input: NotifyInput): Promise<{ sent: true } | { sent: false; reason: AutoReason }>;
};
