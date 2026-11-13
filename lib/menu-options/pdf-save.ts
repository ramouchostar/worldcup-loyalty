// ADR 0100 §8 — enregistrer ce que le restaurateur a relu dans l'import de son PDF. Le serveur ne croit pas le navigateur :
// forme, longueur, liste fermée d'allergènes, appartenance des plats. Ne touche QUE ce que le restaurateur a décidé :
// une description absente ou des allergènes non confirmés ne défont rien de ce qui est déjà en base.

import { createAdminClient } from "../supabase";
import { MAX_DESCRIPTION } from "./descriptions";
import { isAllergenKey, type AllergenKey } from "./pdf";
import { isMissingTable } from "./store";

export const MAX_ROWS = 500;

export type PdfRowIn = { articleId: string; description: string | null; descriptionSource: "pdf" | "restaurateur" | null; allergens: AllergenKey[] | null };

export type CheckedRows = { ok: true; rows: PdfRowIn[] } | { ok: false; errors: string[] };

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);

export function checkRows(raw: unknown): CheckedRows {
  if (!Array.isArray(raw)) return { ok: false, errors: ["Les plats à enregistrer sont absents."] };
  if (raw.length === 0) return { ok: false, errors: ["Rien à enregistrer."] };
  if (raw.length > MAX_ROWS) return { ok: false, errors: [`Trop de plats d'un coup (${MAX_ROWS} au plus).`] };
  const errors: string[] = [];
  const seen = new Set<string>();
  const rows: PdfRowIn[] = [];
  raw.forEach((r, i) => {
    const at = `Plat ${i + 1} : `;
    if (!isObj(r) || typeof r.articleId !== "string" || r.articleId === "") { errors.push(`${at}plat inconnu.`); return; }
    if (seen.has(r.articleId)) { errors.push(`${at}le même plat revient deux fois.`); return; }
    seen.add(r.articleId);
    let description: string | null = null;
    let source: PdfRowIn["descriptionSource"] = null;
    if (r.description !== null && r.description !== undefined) {
      if (typeof r.description !== "string") { errors.push(`${at}description illisible.`); return; }
      const t = r.description.replace(/[<>]/g, "").replace(/\s+/g, " ").trim();
      if (t.length > MAX_DESCRIPTION) { errors.push(`${at}description trop longue (${MAX_DESCRIPTION} lettres au plus).`); return; }
      if (t !== "") {
        if (r.descriptionSource !== "pdf" && r.descriptionSource !== "restaurateur") { errors.push(`${at}origine de la description inconnue.`); return; }
        description = t;
        source = r.descriptionSource;
      }
    }
    let allergens: AllergenKey[] | null = null;
    if (r.allergens !== null && r.allergens !== undefined) {
      if (!Array.isArray(r.allergens) || !r.allergens.every(isAllergenKey)) { errors.push(`${at}allergène inconnu.`); return; }
      allergens = [...new Set(r.allergens as AllergenKey[])];
    }
    if (description === null && allergens === null) return; // rien à écrire pour ce plat
    rows.push({ articleId: r.articleId, description, descriptionSource: source, allergens });
  });
  if (errors.length > 0) return { ok: false, errors: errors.slice(0, 10) };
  if (rows.length === 0) return { ok: false, errors: ["Rien à enregistrer : aucune description gardée, aucun allergène confirmé."] };
  return { ok: true, rows };
}

export type PdfTraceRow = {
  restaurant_id: string; created_by: string; lines_read: number; matched: number; matched_near: number; unmatched: number; articles_without: number;
  desc_proposed: number; desc_kept: number; desc_edited: number; allergens_proposed: number; allergens_changed: number; allergens_confirmed: number; rows_written: number;
};

export interface PdfDb {
  /** Parmi ces identifiants, ceux qui sont des plats de CET établissement. */
  ownedIds(restaurantId: string, ids: string[]): Promise<Set<string>>;
  /** `false` = la migration des allergènes n'est pas appliquée : rien n'a été écrit. */
  writeRows(restaurantId: string, rows: PdfRowIn[], nowIso: string): Promise<boolean>;
  writeTrace(row: PdfTraceRow): Promise<boolean>;
}

export type PdfSaveOutcome =
  | { ok: true; rows: number; traceSaved: boolean }
  | { ok: false; status: number; error: string; errors?: string[]; detail?: string };

export async function saveReviews(db: PdfDb, restaurantId: string, rawRows: unknown, rawTrace: unknown, userId: string, now: Date = new Date()): Promise<PdfSaveOutcome> {
  const checked = checkRows(rawRows);
  if (!checked.ok) return { ok: false, status: 400, error: "Ces plats ne peuvent pas être enregistrés.", errors: checked.errors };
  try {
    const owned = await db.ownedIds(restaurantId, checked.rows.map((r) => r.articleId));
    if (checked.rows.some((r) => !owned.has(r.articleId))) return { ok: false, status: 400, error: "Un des plats n'est pas dans ton menu. Recharge la page." };
    const written = await db.writeRows(restaurantId, checked.rows, now.toISOString());
    if (!written) return { ok: false, status: 503, error: "L'enregistrement des allergènes n'est pas encore activé pour ton compte. Rien n'a été changé : réessaie dans un moment." };
  } catch (e) {
    console.error("[menu-pdf] enregistrement :", e);
    return { ok: false, status: 500, error: "L'enregistrement a échoué. Rien n'est perdu : réessaie.", detail: e instanceof Error ? e.message : String(e) };
  }

  const t = isObj(rawTrace) ? rawTrace : {};
  const n = (k: string) => (typeof t[k] === "number" && Number.isFinite(t[k] as number) && (t[k] as number) >= 0 && (t[k] as number) < 1e6 ? Math.floor(t[k] as number) : 0);
  let traceSaved = false;
  try {
    traceSaved = await db.writeTrace({
      restaurant_id: restaurantId, created_by: userId, lines_read: n("linesRead"), matched: n("matched"), matched_near: n("matchedNear"), unmatched: n("unmatched"),
      articles_without: n("articlesWithout"), desc_proposed: n("descProposed"), desc_kept: n("descKept"), desc_edited: n("descEdited"),
      allergens_proposed: n("allergensProposed"), allergens_changed: n("allergensChanged"), allergens_confirmed: n("allergensConfirmed"), rows_written: checked.rows.length,
    });
  } catch (e) {
    console.error("[menu-pdf] trace non enregistrée :", e);
  }
  return { ok: true, rows: checked.rows.length, traceSaved };
}

const isMissingColumn = (error: { code?: string; message?: string } | null) =>
  !!error && (error.code === "PGRST204" || error.code === "42703" || /column .*(does not exist|schema cache)|Could not find the '.*' column/i.test(error.message ?? ""));

export function supabasePdfDb(): PdfDb {
  const admin = createAdminClient();
  return {
    async ownedIds(restaurantId, ids) {
      const { data, error } = await admin.from("menu_items").select("id").eq("restaurant_id", restaurantId).in("id", ids);
      if (error) throw new Error(`menu_items : ${error.message}`);
      return new Set((data ?? []).map((r: { id: string }) => r.id));
    },
    async writeRows(restaurantId, rows, nowIso) {
      for (let i = 0; i < rows.length; i += 10) {
        const results = await Promise.all(rows.slice(i, i + 10).map((r) => {
          const patch: Record<string, unknown> = {};
          if (r.description !== null) { patch.description = r.description; patch.description_source = r.descriptionSource; }
          if (r.allergens !== null) { patch.allergens = r.allergens; patch.allergens_confirmed_at = nowIso; }
          return admin.from("menu_items").update(patch).eq("id", r.articleId).eq("restaurant_id", restaurantId);
        }));
        for (const { error } of results) {
          if (!error) continue;
          if (isMissingColumn(error)) return false;
          throw new Error(`menu_items (PDF) : ${error.message}`);
        }
      }
      return true;
    },
    async writeTrace(row) {
      const { error } = await admin.from("menu_pdf_imports").insert(row);
      if (error) {
        if (isMissingTable(error) || isMissingColumn(error)) return false;
        throw new Error(`menu_pdf_imports : ${error.message}`);
      }
      return true;
    },
  };
}
