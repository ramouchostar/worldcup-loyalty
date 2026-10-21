import { createAdminClient } from "./supabase";
import { isMissingTable } from "./audit/store";
import { loadTemplate } from "./missions";
import type { Metier } from "./mission-money";
import { applyEdits, sanitizeEdits, type EditIssue } from "./mission-template-edit";

// ============================================================
// Réserver un prestataire (ADR 0084 §5 duodecies) — enregistrer une nouvelle version du questionnaire d'un métier.
//
// Jamais de modification sur place : chaque enregistrement crée la version suivante (`brief_templates`, UNIQUE (métier, version)),
// l'ancienne reste, désactivée. Les planchers de budget et les seuils d'ambition passent d'une version à l'autre. Pas de transaction
// côté client : si l'insertion échoue après la désactivation, l'ancienne version est réactivée (jamais un métier sans questionnaire).
// ============================================================

type DbError = { code?: string; message?: string } | null;

export type SaveTemplateResult =
  | { ok: true; version: number; changed: number }
  | { ok: false; reason: "unavailable" | "unknown_metier" | "nothing_changed" }
  | { ok: false; reason: "invalid"; issues: EditIssue[] };

export async function saveTemplateEdits(metier: Metier, rawEdits: unknown, userId: string): Promise<SaveTemplateResult> {
  const loaded = await loadTemplate(metier);
  if (!loaded) return { ok: false, reason: "unknown_metier" };
  const applied = applyEdits(loaded.template.questions, sanitizeEdits(rawEdits));
  if (!applied.ok) return { ok: false, reason: "invalid", issues: applied.issues };
  if (applied.changed === 0) return { ok: false, reason: "nothing_changed" };

  try {
    const admin = createAdminClient();
    const { data: active, error: e1 } = await admin.from("brief_templates").select("id, version, budget_floor_cents, ambition_budget_cents").eq("metier", metier).eq("active", true).maybeSingle();
    if (e1) throw e1;
    const row = active as { id: string; version: number; budget_floor_cents: number | null; ambition_budget_cents: Record<string, number> | null } | null;

    const { data: latest, error: e2 } = await admin.from("brief_templates").select("version").eq("metier", metier).order("version", { ascending: false }).limit(1).maybeSingle();
    if (e2) throw e2;
    const version = ((latest as { version: number } | null)?.version ?? 0) + 1;

    // Pas encore de ligne en base : le plancher et l'ambition viennent du code (aucun), le questionnaire de base est celui du code.
    if (row) {
      const { error } = await admin.from("brief_templates").update({ active: false }).eq("id", row.id).eq("active", true);
      if (error) throw error;
    }
    const { error: e3 } = await admin.from("brief_templates").insert({
      metier,
      version,
      questions: applied.questions,
      budget_floor_cents: row?.budget_floor_cents ?? null,
      ambition_budget_cents: row?.ambition_budget_cents ?? {},
      active: true,
      updated_by: userId,
    });
    if (e3) {
      if (row) await admin.from("brief_templates").update({ active: true }).eq("id", row.id);
      throw e3;
    }
    return { ok: true, version, changed: applied.changed };
  } catch (e) {
    if (!isMissingTable(e as DbError)) console.error("[marketplace-templates] save failed:", (e as Error).message);
    return { ok: false, reason: "unavailable" };
  }
}
