// ADR 0099 §2 — lecture du menu public d'un établissement (service role : seul le serveur filtre ce qui sort).
// Colonnes facultatives (description, allergènes : migrations 20261113-1758 et -2130) : absentes, on s'en passe, jamais une erreur.

import { createAdminClient } from "../supabase";
import { menuImageUrl } from "../menu-images";
import { loadOptionTrees } from "../menu-options/store";
import { logoPublicUrl } from "../restaurant";
import { buildPublicMenu, type MenuRow, type PublicMenu } from "./menu";
import { purgeDays } from "./purge";
import { readWhatsApp } from "./settings";

const isMissingColumn = (error: { code?: string; message?: string } | null) =>
  !!error && (error.code === "PGRST204" || error.code === "42703" || /column .*(does not exist|schema cache)|Could not find the '.*' column/i.test(error.message ?? ""));

const BASE = "id, name, category, menu_price, is_active, image_path";

const IDENTITY = "id, name, logo_url, status";
const text = (v: unknown): string | null => (typeof v === "string" && v.trim() !== "" ? v.trim() : null);

type RestaurantRow = { id: string; name: string; logo_url: string | null; status: string; address?: string | null; phone?: string | null; cuisine_types?: string[] | null };

/** L'établissement et ce qui le présente. Sans les colonnes facultatives (m29, 20261001-2321), la ligne est absente, jamais une erreur. */
async function readRestaurant(admin: ReturnType<typeof createAdminClient>, restaurantId: string): Promise<RestaurantRow | null> {
  let last = "";
  for (const cols of [`${IDENTITY}, address, cuisine_types, phone`, `${IDENTITY}, address, cuisine_types`, IDENTITY]) {
    const { data, error } = await admin.from("restaurants").select(cols).eq("id", restaurantId).maybeSingle();
    if (!error) return data as unknown as RestaurantRow | null;
    if (!isMissingColumn(error)) throw new Error(`restaurants : ${error.message}`);
    last = error.message;
  }
  throw new Error(`restaurants : ${last}`);
}

/** Le menu commandable d'un établissement actif ; `null` si l'établissement n'existe pas ou n'est pas actif. */
export async function readPublicMenu(restaurantId: string): Promise<PublicMenu | null> {
  const admin = createAdminClient();
  const resto = await readRestaurant(admin, restaurantId);
  if (!resto || resto.status !== "active") return null;

  let rows: MenuRow[] | null = null;
  for (const cols of [`${BASE}, description, allergens`, `${BASE}, description`, BASE]) {
    const { data, error } = await admin.from("menu_items").select(cols).eq("restaurant_id", restaurantId).eq("is_active", true).order("category", { ascending: true }).order("name", { ascending: true });
    if (error) {
      if (isMissingColumn(error)) continue;
      throw new Error(`menu_items : ${error.message}`);
    }
    rows = (data ?? []) as unknown as MenuRow[];
    break;
  }
  const [trees, whatsapp] = await Promise.all([loadOptionTrees(restaurantId, (rows ?? []).map((x) => x.id)), readWhatsApp(restaurantId)]);
  return buildPublicMenu({
    restaurant: {
      id: resto.id, name: resto.name, logoUrl: logoPublicUrl(resto.logo_url),
      address: text(resto.address), phone: text(resto.phone), cuisine: text((resto.cuisine_types ?? []).map((c) => c.trim()).filter(Boolean).join(", ")),
    },
    rows: rows ?? [],
    trees,
    imageUrl: menuImageUrl,
    retentionDays: purgeDays().days,
    whatsapp,
  });
}
