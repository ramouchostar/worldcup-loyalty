// ADR 0099 §2 — le menu que le client voit sur la page de commande. Logique PURE : on lui donne les lignes du catalogue, les
// options et ce qui est enregistré (descriptions, allergènes confirmés), elle rend ce qui peut être COMMANDÉ, rien de plus.
//
// Rien d'interne ne sort : ni prix de revient, ni coin de cuisine, ni identifiant de bibliothèque d'options. Un plat qu'on
// ne saurait pas servir (sans prix, plus proposé, options impossibles à satisfaire) n'est pas montré : un client ne doit
// jamais pouvoir remplir un panier que le serveur refusera (ADR 0099 §7, seuil « choix_invalide »).

import { validateTree } from "../menu-options/model";
import type { OptionGroup } from "../menu-options/types";
import { allergenText, type AllergenText } from "../menu-options/site-preview";
import { isAllergenKey, type AllergenKey } from "../menu-options/pdf";

export type MenuRow = {
  id: string;
  name: string;
  category: string | null;
  menu_price: number | string;
  is_active: boolean;
  image_path: string | null;
  description?: string | null;
  allergens?: string[] | null;
};

export type PublicItem = {
  id: string;
  name: string;
  priceCents: number;
  description: string | null;
  allergens: AllergenText;
  imageUrl: string | null;
  groups: OptionGroup[];
};

export type PublicMenu = {
  restaurant: { id: string; name: string; logoUrl: string | null };
  /** Combien de jours le prénom et le téléphone sont gardés (lib/site-orders/purge.ts) : dit au client, jamais inventé. */
  retentionDays: number;
  categories: { name: string; items: PublicItem[] }[];
  /** Plats actifs que nous n'avons PAS montrés (prix absent, options impossibles) : la trace dit combien. */
  hidden: number;
};

export type MenuInput = {
  restaurant: { id: string; name: string; logoUrl: string | null };
  rows: MenuRow[];
  trees: Map<string, OptionGroup[]>;
  imageUrl: (path: string | null) => string | null;
  retentionDays: number;
};

const OTHER = "Autres plats";

export function buildPublicMenu(input: MenuInput): PublicMenu {
  const byCat = new Map<string, PublicItem[]>();
  let hidden = 0;
  for (const r of input.rows) {
    if (!r.is_active) continue;
    const price = Math.round(Number(r.menu_price) * 100);
    const groups = input.trees.get(r.id) ?? [];
    const broken = validateTree(groups).some((i) => i.level === "erreur");
    if (!Number.isFinite(price) || price <= 0 || broken) { hidden++; continue; }
    const confirmed = Array.isArray(r.allergens) ? (r.allergens.filter(isAllergenKey) as AllergenKey[]) : null;
    const item: PublicItem = {
      id: r.id,
      name: r.name,
      priceCents: price,
      description: r.description && r.description.trim() !== "" ? r.description.trim() : null,
      allergens: allergenText(confirmed),
      imageUrl: input.imageUrl(r.image_path),
      groups,
    };
    const cat = (r.category ?? "").trim() || OTHER;
    byCat.set(cat, [...(byCat.get(cat) ?? []), item]);
  }
  return { restaurant: input.restaurant, retentionDays: input.retentionDays, categories: [...byCat.entries()].map(([name, items]) => ({ name, items })), hidden };
}
