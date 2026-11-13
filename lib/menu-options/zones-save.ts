// ADR 0100 §9 — enregistrer le coin de cuisine de chaque plat. Le serveur ne croit pas le navigateur : nom nettoyé,
// nombre de coins, appartenance des plats. Échec jamais silencieux : migration absente = 503 dit clairement.

import { createAdminClient } from "../supabase";
import { MAX_ZONES, cleanZone, distinctZones } from "./tickets";
import { isMissingTable } from "./store";

export const MAX_ZONE_ROWS = 1000;

export type ZoneRow = { articleId: string; zone: string | null };
export type CheckedZones = { ok: true; rows: ZoneRow[] } | { ok: false; errors: string[] };

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);

export function checkZones(raw: unknown): CheckedZones {
  if (!Array.isArray(raw) || raw.length === 0) return { ok: false, errors: ["Aucun plat à enregistrer."] };
  if (raw.length > MAX_ZONE_ROWS) return { ok: false, errors: [`Trop de plats d'un coup (${MAX_ZONE_ROWS} au plus).`] };
  const errors: string[] = [];
  const seen = new Set<string>();
  const rows: ZoneRow[] = [];
  raw.forEach((r, i) => {
    if (!isObj(r) || typeof r.articleId !== "string" || r.articleId === "") { errors.push(`Plat ${i + 1} : plat inconnu.`); return; }
    if (seen.has(r.articleId)) { errors.push(`Plat ${i + 1} : le même plat revient deux fois.`); return; }
    seen.add(r.articleId);
    if (r.zone !== null && r.zone !== undefined && typeof r.zone !== "string") { errors.push(`Plat ${i + 1} : coin illisible.`); return; }
    rows.push({ articleId: r.articleId, zone: cleanZone(r.zone) });
  });
  if (errors.length > 0) return { ok: false, errors: errors.slice(0, 10) };
  if (new Set(rows.map((r) => r.zone).filter((z) => z !== null)).size > MAX_ZONES) {
    return { ok: false, errors: [`Trop de coins de cuisine (${MAX_ZONES} au plus). Regroupe-en.`] };
  }
  return { ok: true, rows };
}

export type ZoneTraceRow = { restaurant_id: string; created_by: string; articles: number; zones: number; suggested: number; suggested_kept: number; changed: number; cleared: number };

export interface ZonesDb {
  ownedIds(restaurantId: string, ids: string[]): Promise<Set<string>>;
  /** `false` = la migration n'est pas appliquée : rien n'a été écrit. */
  writeZones(restaurantId: string, rows: ZoneRow[]): Promise<boolean>;
  writeTrace(row: ZoneTraceRow): Promise<boolean>;
}

export type ZonesOutcome =
  | { ok: true; rows: number; traceSaved: boolean }
  | { ok: false; status: number; error: string; errors?: string[]; detail?: string };

export async function saveZones(db: ZonesDb, restaurantId: string, rawRows: unknown, rawTrace: unknown, userId: string): Promise<ZonesOutcome> {
  const checked = checkZones(rawRows);
  if (!checked.ok) return { ok: false, status: 400, error: "Ces coins de cuisine ne peuvent pas être enregistrés.", errors: checked.errors };
  try {
    const owned = await db.ownedIds(restaurantId, checked.rows.map((r) => r.articleId));
    if (checked.rows.some((r) => !owned.has(r.articleId))) return { ok: false, status: 400, error: "Un des plats n'est pas dans ton menu. Recharge la page." };
    if (!(await db.writeZones(restaurantId, checked.rows))) {
      return { ok: false, status: 503, error: "Les coins de cuisine ne sont pas encore activés pour ton compte. Rien n'a été changé : réessaie dans un moment." };
    }
  } catch (e) {
    console.error("[menu-zones] enregistrement :", e);
    return { ok: false, status: 500, error: "L'enregistrement a échoué. Rien n'est perdu : réessaie.", detail: e instanceof Error ? e.message : String(e) };
  }
  const t = isObj(rawTrace) ? rawTrace : {};
  const n = (k: string) => (typeof t[k] === "number" && Number.isFinite(t[k] as number) && (t[k] as number) >= 0 && (t[k] as number) < 1e6 ? Math.floor(t[k] as number) : 0);
  let traceSaved = false;
  try {
    traceSaved = await db.writeTrace({
      restaurant_id: restaurantId, created_by: userId, articles: checked.rows.length, zones: distinctZones(checked.rows.map((r) => r.zone)).length,
      suggested: n("suggested"), suggested_kept: n("suggestedKept"), changed: n("changed"), cleared: n("cleared"),
    });
  } catch (e) {
    console.error("[menu-zones] trace non enregistrée :", e);
  }
  return { ok: true, rows: checked.rows.length, traceSaved };
}

const isMissingColumn = (error: { code?: string; message?: string } | null) =>
  !!error && (error.code === "PGRST204" || error.code === "42703" || /column .*(does not exist|schema cache)|Could not find the '.*' column/i.test(error.message ?? ""));

export function supabaseZonesDb(): ZonesDb {
  const admin = createAdminClient();
  return {
    async ownedIds(restaurantId, ids) {
      const found = new Set<string>();
      for (let i = 0; i < ids.length; i += 200) {
        const { data, error } = await admin.from("menu_items").select("id").eq("restaurant_id", restaurantId).in("id", ids.slice(i, i + 200));
        if (error) throw new Error(`menu_items : ${error.message}`);
        for (const r of (data ?? []) as { id: string }[]) found.add(r.id);
      }
      return found;
    },
    async writeZones(restaurantId, rows) {
      for (let i = 0; i < rows.length; i += 10) {
        const results = await Promise.all(rows.slice(i, i + 10).map((r) =>
          admin.from("menu_items").update({ kitchen_zone: r.zone }).eq("id", r.articleId).eq("restaurant_id", restaurantId),
        ));
        for (const { error } of results) {
          if (!error) continue;
          if (isMissingColumn(error)) return false;
          throw new Error(`menu_items (coins) : ${error.message}`);
        }
      }
      return true;
    },
    async writeTrace(row) {
      const { error } = await admin.from("menu_zone_setups").insert(row);
      if (error) {
        if (isMissingTable(error) || isMissingColumn(error)) return false;
        throw new Error(`menu_zone_setups : ${error.message}`);
      }
      return true;
    },
  };
}

/** Les coins déjà enregistrés, par plat ; `null` = la migration n'est pas appliquée (l'écran le dit). */
export async function readZones(restaurantId: string): Promise<Record<string, string | null> | null> {
  const admin = createAdminClient();
  const { data, error } = await admin.from("menu_items").select("id, kitchen_zone").eq("restaurant_id", restaurantId).eq("is_active", true);
  if (error) {
    if (isMissingColumn(error)) return null;
    throw new Error(`menu_items (coins) : ${error.message}`);
  }
  return Object.fromEntries(((data ?? []) as { id: string; kitchen_zone: string | null }[]).map((r) => [r.id, r.kitchen_zone]));
}
