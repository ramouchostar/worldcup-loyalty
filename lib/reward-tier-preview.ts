// ============================================================
// Aperçu générique des paliers pour la landing publique (ADR 0042).
//
// Contrairement au tour de bienvenue (ADR 0040, lib/visitor-tour.ts) qui cite
// les noms réels des cadeaux, cette landing ne nomme jamais d'article : avant
// même le scan, rien ne garantit qu'un palier précis sera couvert (double
// verrou ADR 0007, plafond budget ADR 0012, couverture d'équipe ADR 0017).
//
// On affiche donc, par couche configurée (solo → communautaire → réserve),
// une simple CATÉGORIE DE PRIX de l'article qui y est assigné — 1 (produit le
// plus cher du catalogue), 2 (milieu de panier) ou 3 (petit produit : frites,
// milkshake…) — jamais le nom, jamais un seuil en euros (ADR 0007/0028 :
// aucun montant, même personnel, ne franchit vers le client). La catégorie
// est calculée par tertile de `menu_price` sur le catalogue actif et
// éligible aux récompenses de l'établissement — elle s'adapte donc à chaque
// resto plutôt que de coder en dur des tranches de prix.
// ============================================================

import { createAdminClient } from "@/lib/supabase";

export type TierPreviewRow = { layer: "solo" | "community" | "saver"; category: 1 | 2 | 3 };

type MenuItemEmbed = { id: string; is_active: boolean; reward_eligible: boolean };
type TierRow = {
  layer: string;
  min_threshold: number;
  menu_items: MenuItemEmbed | MenuItemEmbed[] | null;
};

const LAYER_ORDER = ["solo", "community", "saver"] as const;

export async function getLandingTierPreview(restaurantId: string): Promise<TierPreviewRow[]> {
  try {
    const admin = createAdminClient();

    const [{ data: tierData }, { data: menuData }] = await Promise.all([
      admin
        .from("reward_tiers")
        .select("layer, min_threshold, menu_items(id, is_active, reward_eligible)")
        .eq("restaurant_id", restaurantId)
        .eq("is_active", true)
        .order("min_threshold", { ascending: true }),
      admin
        .from("menu_items")
        .select("id, menu_price")
        .eq("restaurant_id", restaurantId)
        .eq("is_active", true)
        .eq("reward_eligible", true)
        .not("menu_price", "is", null),
    ]);

    const catalog = (menuData ?? []) as { id: string; menu_price: number }[];
    if (catalog.length === 0) return [];

    // Tertiles du catalogue éligible : borne basse (33e centile) sépare les
    // petits produits (3) du milieu de panier (2), borne haute (66e) sépare
    // le milieu de panier des produits premium (1).
    const sorted = [...catalog].sort((a, b) => a.menu_price - b.menu_price);
    const p33 = sorted[Math.floor(sorted.length / 3)].menu_price;
    const p66 = sorted[Math.floor((sorted.length * 2) / 3)].menu_price;
    const categoryOf = (price: number): 1 | 2 | 3 => (price <= p33 ? 3 : price <= p66 ? 2 : 1);
    const priceById = new Map(catalog.map((i) => [i.id, i.menu_price]));

    // Première occurrence par couche = seuil le plus bas (tri déjà ascendant)
    // — le palier d'entrée de chaque couche, celui qu'on peut réellement teaser.
    const firstByLayer = new Map<string, string>();
    for (const r of (tierData ?? []) as unknown as TierRow[]) {
      if (firstByLayer.has(r.layer)) continue;
      const mi = Array.isArray(r.menu_items) ? r.menu_items[0] : r.menu_items;
      if (!mi || !mi.is_active || !mi.reward_eligible || !priceById.has(mi.id)) continue;
      firstByLayer.set(r.layer, mi.id);
    }

    const rows: TierPreviewRow[] = [];
    for (const layer of LAYER_ORDER) {
      const itemId = firstByLayer.get(layer);
      if (!itemId) continue;
      rows.push({ layer, category: categoryOf(priceById.get(itemId)!) });
    }
    return rows;
  } catch {
    // Best-effort (même principe que recordLanding, ADR 0037) : la landing
    // ne doit jamais tomber pour cet aperçu — au pire, la carte reste vide.
    return [];
  }
}
