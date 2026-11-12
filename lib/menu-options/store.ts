import { createAdminClient } from "../supabase";
import { MAX_DEPTH } from "./model";
import type { GroupKind, OptionChoice, OptionGroup } from "./types";

// Lecture des options en base (ADR 0099). Service role uniquement : un prix en euros ne sort jamais vers un
// membre (ADR 0007) ; la surface publique du site de commande lira par une route serveur qui n'envoie que ce
// qu'il faut. Une table absente (migration pas encore appliquée) se lit « aucune option » : le code reste
// tolérant (docs/migrations/README.md). Toute autre erreur remonte, elle ne se déguise pas en « pas d'options ».

export type LibraryRow = { id: string; name: string };
export type GroupRow = { id: string; title: string; kind: GroupKind; min_choices: number; max_choices: number | null };
export type ChoiceRow = { id: string; group_id: string; library_id: string; price_delta: number | string; max_qty: number; is_default: boolean; is_available: boolean; position: number };
export type ChoiceGroupRow = { choice_id: string; group_id: string; position: number };
export type ItemGroupRow = { menu_item_id: string; group_id: string; position: number };

export type OptionRows = {
  library: LibraryRow[];
  groups: GroupRow[];
  choices: ChoiceRow[];
  choiceGroups: ChoiceGroupRow[];
  itemGroups: ItemGroupRow[];
};

const byPosition = <T extends { position: number }>(a: T, b: T) => a.position - b.position;

/**
 * Assemble les lignes en arbres, un par article. Un groupe partagé (les sauces) est construit pour chaque article
 * qui l'utilise ; un sous-groupe qui reviendrait sur un de ses ancêtres, ou qui dépasse MAX_DEPTH, est coupé au
 * lieu de boucler (la validation de l'éditeur le refuse déjà). Pur et testé.
 */
export function assembleTrees(rows: OptionRows): Map<string, OptionGroup[]> {
  const lib = new Map(rows.library.map((l) => [l.id, l]));
  const groupById = new Map(rows.groups.map((g) => [g.id, g]));
  const choicesOf = new Map<string, ChoiceRow[]>();
  for (const c of rows.choices) (choicesOf.get(c.group_id) ?? choicesOf.set(c.group_id, []).get(c.group_id)!).push(c);
  const childrenOf = new Map<string, ChoiceGroupRow[]>();
  for (const cg of rows.choiceGroups) (childrenOf.get(cg.choice_id) ?? childrenOf.set(cg.choice_id, []).get(cg.choice_id)!).push(cg);

  const build = (groupId: string, ancestors: string[], depth: number): OptionGroup | null => {
    const g = groupById.get(groupId);
    if (!g || ancestors.includes(groupId) || depth > MAX_DEPTH) return null;
    const choices: OptionChoice[] = [];
    for (const c of (choicesOf.get(groupId) ?? []).slice().sort(byPosition)) {
      const l = lib.get(c.library_id);
      if (!l) continue;
      const groups = (childrenOf.get(c.id) ?? [])
        .slice()
        .sort(byPosition)
        .map((cg) => build(cg.group_id, [...ancestors, groupId], depth + 1))
        .filter((x): x is OptionGroup => x !== null);
      choices.push({ id: c.id, libraryId: c.library_id, name: l.name, priceDelta: Number(c.price_delta), maxQty: c.max_qty, isDefault: c.is_default, isAvailable: c.is_available, groups });
    }
    return { id: g.id, title: g.title, kind: g.kind, min: g.min_choices, max: g.max_choices, choices };
  };

  const trees = new Map<string, OptionGroup[]>();
  for (const link of rows.itemGroups.slice().sort(byPosition)) {
    const g = build(link.group_id, [], 0);
    if (g) (trees.get(link.menu_item_id) ?? trees.set(link.menu_item_id, []).get(link.menu_item_id)!).push(g);
  }
  return trees;
}

export const isMissingTable = (error: { code?: string; message?: string } | null) =>
  !!error && (error.code === "PGRST205" || error.code === "42P01" || /menu_(option|item_option)/.test(error.message ?? "") && /(does not exist|Could not find the table)/i.test(error.message ?? ""));

/** Les options des articles demandés (ou de tout l'établissement si `itemIds` est omis). */
export async function loadOptionTrees(restaurantId: string, itemIds?: string[]): Promise<Map<string, OptionGroup[]>> {
  const admin = createAdminClient();
  const fail = (what: string, error: { message: string }) => new Error(`menu_options (${what}) : ${error.message}`);

  let links = admin.from("menu_item_option_groups").select("menu_item_id, group_id, position, menu_items!inner(restaurant_id)").eq("menu_items.restaurant_id", restaurantId);
  if (itemIds) links = links.in("menu_item_id", itemIds);
  const l = await links;
  if (l.error) {
    if (isMissingTable(l.error)) return new Map();
    throw fail("liens", l.error);
  }
  const itemGroups = ((l.data ?? []) as unknown as (ItemGroupRow & { menu_items?: unknown })[]).map((r) => ({ menu_item_id: r.menu_item_id, group_id: r.group_id, position: r.position }));
  if (itemGroups.length === 0) return new Map();

  const [library, groups, choices, choiceGroups] = await Promise.all([
    admin.from("menu_option_library").select("id, name").eq("restaurant_id", restaurantId),
    admin.from("menu_option_groups").select("id, title, kind, min_choices, max_choices").eq("restaurant_id", restaurantId),
    admin.from("menu_option_choices").select("id, group_id, library_id, price_delta, max_qty, is_default, is_available, position, menu_option_groups!inner(restaurant_id)").eq("menu_option_groups.restaurant_id", restaurantId),
    admin.from("menu_option_choice_groups").select("choice_id, group_id, position, menu_option_groups!inner(restaurant_id)").eq("menu_option_groups.restaurant_id", restaurantId),
  ]);
  for (const [what, r] of [["bibliothèque", library], ["groupes", groups], ["choix", choices], ["sous-groupes", choiceGroups]] as const) {
    if (r.error) throw fail(what, r.error);
  }
  return assembleTrees({
    library: (library.data ?? []) as LibraryRow[],
    groups: (groups.data ?? []) as GroupRow[],
    choices: (choices.data ?? []) as unknown as ChoiceRow[],
    choiceGroups: (choiceGroups.data ?? []) as unknown as ChoiceGroupRow[],
    itemGroups,
  });
}
