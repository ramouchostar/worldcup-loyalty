// ============================================================
// Aperçu des paliers pour la landing publique (ADR 0042, amendé par
// ADR 0043).
//
// Par couche configurée (solo → communautaire → réserve), on tire au hasard
// le nom d'un article du catalogue appartenant à la même TRANCHE DE PRIX que
// le palier d'entrée de la couche — jamais l'article réellement assigné,
// jamais un montant en euros (ADR 0007/0028 inchangé). La tranche (tertile
// de `menu_price` sur le catalogue actif et éligible aux récompenses) ne
// sert plus qu'à choisir dans quel sous-ensemble piocher ; elle ne s'affiche
// plus au client (ADR 0042 l'affichait en clair sous la forme "catégorie
// 1/2/3" — abandonné).
//
// Risque assumé (ADR 0043) : le produit nommé peut ne pas être le cadeau
// réellement délivré une fois le double verrou (ADR 0007), le plafond
// budget (ADR 0012) ou la couverture d'équipe (ADR 0017) appliqués — tous
// invisibles côté client. Décision produit explicite, pas une omission.
// ============================================================

import { createAdminClient } from "@/lib/supabase";

export type TierPreviewRow = { layer: "solo" | "community" | "saver"; productName: string };

type MenuItemEmbed = { id: string; is_active: boolean; reward_eligible: boolean };
type TierRow = {
  layer: string;
  min_threshold: number;
  menu_items: MenuItemEmbed | MenuItemEmbed[] | null;
};
type CatalogItem = { id: string; name: string; menu_price: number };

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
        .select("id, name, menu_price")
        .eq("restaurant_id", restaurantId)
        .eq("is_active", true)
        .eq("reward_eligible", true)
        .not("menu_price", "is", null),
    ]);

    const catalog = (menuData ?? []) as CatalogItem[];
    if (catalog.length === 0) return [];

    // Tertiles du catalogue éligible : borne basse (33e centile) sépare les
    // petits produits du milieu de panier, borne haute (66e) sépare le
    // milieu de panier des produits premium.
    const sorted = [...catalog].sort((a, b) => a.menu_price - b.menu_price);
    const p33 = sorted[Math.floor(sorted.length / 3)].menu_price;
    const p66 = sorted[Math.floor((sorted.length * 2) / 3)].menu_price;
    const categoryOf = (price: number): 1 | 2 | 3 => (price <= p33 ? 3 : price <= p66 ? 2 : 1);
    const byId = new Map(catalog.map((i) => [i.id, i]));

    const byCategory = new Map<1 | 2 | 3, CatalogItem[]>();
    for (const item of catalog) {
      const cat = categoryOf(item.menu_price);
      const bucket = byCategory.get(cat);
      if (bucket) bucket.push(item);
      else byCategory.set(cat, [item]);
    }

    // Première occurrence par couche = seuil le plus bas (tri déjà ascendant)
    // — le palier d'entrée de chaque couche, celui qui fixe la tranche à
    // piocher pour cette couche.
    const firstByLayer = new Map<string, string>();
    for (const r of (tierData ?? []) as unknown as TierRow[]) {
      if (firstByLayer.has(r.layer)) continue;
      const mi = Array.isArray(r.menu_items) ? r.menu_items[0] : r.menu_items;
      if (!mi || !mi.is_active || !mi.reward_eligible || !byId.has(mi.id)) continue;
      firstByLayer.set(r.layer, mi.id);
    }

    const rows: TierPreviewRow[] = [];
    for (const layer of LAYER_ORDER) {
      const itemId = firstByLayer.get(layer);
      if (!itemId) continue;
      const refItem = byId.get(itemId)!;
      const bucket = byCategory.get(categoryOf(refItem.menu_price)) ?? [refItem];
      const pick = bucket[Math.floor(Math.random() * bucket.length)];
      rows.push({ layer, productName: pick.name });
    }
    return rows;
  } catch {
    // Best-effort (même principe que recordLanding, ADR 0037) : la landing
    // ne doit jamais tomber pour cet aperçu — au pire, la carte reste vide.
    return [];
  }
}
