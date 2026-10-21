import { createAdminClient } from "./supabase";
import { isMissingTable } from "./audit/store";
import { defaultTemplate } from "./mission-brief";
import type { Metier } from "./mission-money";

// Lecture et écriture des budgets planchers (ADR 0084 §3). Les règles pures (validation, phrases lues par le
// restaurateur) vivent dans lib/marketplace-budgets-rules.ts : ce fichier-ci touche la base, il reste côté serveur.
export * from "./marketplace-budgets-rules";

// ── Lecture / écriture ───────────────────────────────────────

export async function loadBudgetConfig(metier: Metier): Promise<{ ok: true; floorCents: number | null; ambition: Record<string, number>; fromDatabase: boolean } | { ok: false }> {
  try {
    const { data, error } = await createAdminClient().from("brief_templates").select("budget_floor_cents, ambition_budget_cents").eq("metier", metier).eq("active", true).maybeSingle();
    if (error) throw error;
    const row = data as { budget_floor_cents: number | null; ambition_budget_cents: Record<string, number> | null } | null;
    return { ok: true, floorCents: row?.budget_floor_cents ?? null, ambition: row?.ambition_budget_cents ?? {}, fromDatabase: !!row };
  } catch (e) {
    if (!isMissingTable(e as { code?: string; message?: string })) console.error("[marketplace-budgets] lecture impossible:", (e as Error).message);
    return { ok: false };
  }
}

/**
 * Enregistre le plancher et l'ambition. Pas encore de ligne en base (le modèle vit dans le code) : on la crée à
 * partir du modèle du code, tel quel, pour que le modèle ET ses seuils vivent au même endroit ensuite.
 */
export async function saveBudgetConfig(metier: Metier, floorCents: number | null, ambition: Record<string, number>, userId: string): Promise<boolean> {
  try {
    const admin = createAdminClient();
    const { data: existing, error: e1 } = await admin.from("brief_templates").select("id").eq("metier", metier).eq("active", true).maybeSingle();
    if (e1) throw e1;
    if (existing) {
      const { error } = await admin.from("brief_templates").update({ budget_floor_cents: floorCents, ambition_budget_cents: ambition, updated_by: userId }).eq("id", (existing as { id: string }).id);
      if (error) throw error;
      return true;
    }
    const template = defaultTemplate(metier);
    if (!template) return false; // un métier sans questionnaire n'a pas de budget à régler
    const { error } = await admin.from("brief_templates").insert({ metier, version: 1, questions: template.questions, budget_floor_cents: floorCents, ambition_budget_cents: ambition, active: true, updated_by: userId });
    if (error) {
      // Deux enregistrements en même temps : l'autre a créé la ligne entre-temps, on la met à jour.
      if (error.code === "23505") return saveBudgetConfig(metier, floorCents, ambition, userId);
      throw error;
    }
    return true;
  } catch (e) {
    console.error("[marketplace-budgets] saveBudgetConfig failed:", (e as Error).message);
    return false;
  }
}
