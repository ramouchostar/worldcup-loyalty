import { createAdminClient } from "./supabase";
import type { MenuItem } from "@/types";

// ADR 0013 — Catalogue menu & prix de revient.
// Données euros (prix de vente / prix de revient) : service role uniquement,
// jamais exposées à une surface membre (ADR 0007).

export type MenuItemInput = {
  name: string;
  category: string;
  menu_price: number;
  cost_price: number;
};

export async function getMenuItems(restaurantId: string): Promise<MenuItem[]> {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("menu_items")
    .select("*")
    .eq("restaurant_id", restaurantId)
    .order("category")
    .order("name");
  if (error) throw new Error(`getMenuItems: ${error.message}`);
  return (data ?? []) as MenuItem[];
}

// Upsert d'un catalogue complet (ADR 0013) :
// - insère / met à jour les articles fournis (clé restaurant_id + name) ;
// - désactive les articles actifs absents du nouveau fichier, sans les
//   supprimer (préserve l'historique référencé par pending_rewards).
export async function upsertMenuCatalog(
  restaurantId: string,
  items: MenuItemInput[]
): Promise<{ upserted: number; deactivated: number }> {
  const admin = createAdminClient();
  const keep = new Set(items.map((i) => i.name));

  // Articles actifs actuels absents du nouveau fichier → à désactiver
  const { data: existing, error: exErr } = await admin
    .from("menu_items")
    .select("id, name")
    .eq("restaurant_id", restaurantId)
    .eq("is_active", true);
  if (exErr) throw new Error(`upsertMenuCatalog (lecture): ${exErr.message}`);

  const toDeactivate = (existing ?? [])
    .filter((r: { name: string }) => !keep.has(r.name))
    .map((r: { id: string }) => r.id);

  const rows = items.map((it) => ({
    restaurant_id: restaurantId,
    name: it.name,
    category: it.category,
    menu_price: it.menu_price,
    cost_price: it.cost_price,
    is_active: true,
  }));

  const { error: upErr } = await admin
    .from("menu_items")
    .upsert(rows, { onConflict: "restaurant_id,name" });
  if (upErr) throw new Error(`upsertMenuCatalog (upsert): ${upErr.message}`);

  let deactivated = 0;
  if (toDeactivate.length > 0) {
    const { error: dErr } = await admin
      .from("menu_items")
      .update({ is_active: false })
      .in("id", toDeactivate);
    if (dErr) throw new Error(`upsertMenuCatalog (désactivation): ${dErr.message}`);
    deactivated = toDeactivate.length;
  }

  return { upserted: rows.length, deactivated };
}

// ─── Parseur CSV tolérant ─────────────────────────────────────────────────────
// Gère : séparateur ; ou , (CSV européens) ; virgule décimale (0,31) ;
// en-têtes accentués / avec espaces ; guillemets. Le restaurateur remplit
// le fichier lui-même (nom, categorie, prix_vente, prix_revient).

const HEADER_ALIASES: Record<string, keyof MenuItemInput> = {
  nom: "name", name: "name", article: "name", produit: "name",
  categorie: "category", category: "category", famille: "category", rayon: "category",
  prixvente: "menu_price", prixdevente: "menu_price", prix: "menu_price",
  prixcarte: "menu_price", menuprice: "menu_price",
  prixrevient: "cost_price", prixderevient: "cost_price", cout: "cost_price",
  coutmatiere: "cost_price", coutderevient: "cost_price", costprice: "cost_price",
};

function normalizeHeader(h: string): string {
  return h
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "") // retire les accents combinants
    .replace(/[\s_]+/g, "");
}

function parseNumber(raw: string): number | null {
  const cleaned = raw.replace(/\s/g, "").replace(/[^\d,.-]/g, "").replace(",", ".");
  if (cleaned === "" || cleaned === "-" || cleaned === ".") return null;
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : null;
}

function splitLine(line: string, delim: string): string[] {
  const out: string[] = [];
  let cur = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (inQuotes) {
      if (c === '"') {
        if (line[i + 1] === '"') { cur += '"'; i++; }
        else inQuotes = false;
      } else cur += c;
    } else if (c === '"') {
      inQuotes = true;
    } else if (c === delim) {
      out.push(cur);
      cur = "";
    } else {
      cur += c;
    }
  }
  out.push(cur);
  return out.map((s) => s.trim());
}

export function parseMenuCsv(text: string): { items: MenuItemInput[]; errors: string[] } {
  const errors: string[] = [];
  const lines = text.split(/\r?\n/).filter((l) => l.trim() !== "");
  if (lines.length < 2) {
    return { items: [], errors: ["Fichier vide ou sans ligne de données."] };
  }

  const semis = lines[0].split(";").length - 1;
  const commas = lines[0].split(",").length - 1;
  const delim = semis >= commas ? ";" : ",";

  const header = splitLine(lines[0], delim).map(normalizeHeader);
  const col: Partial<Record<keyof MenuItemInput, number>> = {};
  header.forEach((h, idx) => {
    const key = HEADER_ALIASES[h];
    if (key && col[key] === undefined) col[key] = idx;
  });

  const required: (keyof MenuItemInput)[] = ["name", "category", "menu_price", "cost_price"];
  const missing = required.filter((k) => col[k] === undefined);
  if (missing.length > 0) {
    return {
      items: [],
      errors: [
        `Colonnes manquantes (${missing.join(", ")}). En-têtes attendus : nom, categorie, prix_vente, prix_revient.`,
      ],
    };
  }

  const items: MenuItemInput[] = [];
  for (let i = 1; i < lines.length; i++) {
    const f = splitLine(lines[i], delim);
    const name = (f[col.name!] ?? "").trim();
    const category = (f[col.category!] ?? "").trim();
    const menuPrice = parseNumber(f[col.menu_price!] ?? "");
    const costPrice = parseNumber(f[col.cost_price!] ?? "");

    if (!name) { errors.push(`Ligne ${i + 1} : nom manquant — ignorée.`); continue; }
    if (!category) { errors.push(`Ligne ${i + 1} (${name}) : catégorie manquante — ignorée.`); continue; }
    if (menuPrice === null || menuPrice < 0) { errors.push(`Ligne ${i + 1} (${name}) : prix de vente invalide — ignorée.`); continue; }
    if (costPrice === null || costPrice < 0) { errors.push(`Ligne ${i + 1} (${name}) : prix de revient invalide — ignorée.`); continue; }

    items.push({ name, category, menu_price: menuPrice, cost_price: costPrice });
  }

  return { items, errors };
}
