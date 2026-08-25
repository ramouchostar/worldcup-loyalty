// ============================================================
// Cadeaux cités par le tour de bienvenue visiteur (ADR 0040).
//
// « Gagne un Finest Burger » vend infiniment mieux que « gagne des
// cadeaux » — mais les noms viennent des paliers CONFIGURÉS du resto
// (reward_tiers + menu_items, ADR 0013), jamais codés en dur : le tour
// doit être juste chez tous les établissements. Noms seulement — jamais
// de coût ni de seuil en euros côté client (ADR 0007/0017).
// ============================================================

import { createAdminClient } from "@/lib/supabase";

export type TourGifts = {
  /** Premier palier solo — le cadeau le plus vite atteint. */
  firstGift: string | null;
  /** Le « gros » cadeau qui donne envie d'accumuler (saver, sinon dernier palier). */
  bigGift: string | null;
};

type MenuItemEmbed = { name: string; is_active: boolean; reward_eligible: boolean };
type TierRow = {
  layer: string;
  min_threshold: number;
  menu_items: MenuItemEmbed | MenuItemEmbed[] | null;
};

export async function getTourGifts(restaurantId: string): Promise<TourGifts> {
  const admin = createAdminClient();
  const { data } = await admin
    .from("reward_tiers")
    .select("layer, min_threshold, menu_items(name, is_active, reward_eligible)")
    .eq("restaurant_id", restaurantId)
    .eq("is_active", true)
    .order("min_threshold", { ascending: true });

  const byLayer: Record<string, string[]> = {};
  for (const r of ((data ?? []) as unknown as TierRow[])) {
    const mi = Array.isArray(r.menu_items) ? r.menu_items[0] : r.menu_items;
    if (!mi || !mi.is_active || !mi.reward_eligible) continue;
    (byLayer[r.layer] ??= []).push(mi.name);
  }

  const solo = byLayer.solo ?? [];
  const saver = byLayer.saver ?? [];
  const community = byLayer.community ?? [];

  const firstGift = solo[0] ?? null;
  let bigGift: string | null =
    saver[saver.length - 1] ?? solo[solo.length - 1] ?? community[community.length - 1] ?? null;
  if (bigGift === firstGift) bigGift = null; // un seul palier → pas de « gros » cadeau distinct

  return { firstGift, bigGift };
}
