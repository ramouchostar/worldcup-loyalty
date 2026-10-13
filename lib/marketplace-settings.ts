import { createAdminClient } from "./supabase";
import { isMissingTable } from "./audit/store";
import { DEFAULT_TERMS, type MarketplaceTerms } from "./mission-money";
import { termsFromRow } from "./marketplace-settings-rules";

// Lecture et écriture des réglages de la place de marché (ADR 0084 §2). Les règles pures (pourcentages, validation,
// exemple chiffré) vivent dans lib/marketplace-settings-rules.ts : ce fichier-ci touche la base, il reste côté serveur.
export * from "./marketplace-settings-rules";

type Row = { commission_bps: number; pro_commission_bps: number; deposit_bps: number };

/** Les conditions en vigueur. Lecture en échec ou table absente : les valeurs de l'ADR, le journal le dit. */
export async function getTerms(): Promise<{ terms: MarketplaceTerms; source: "base" | "defaut" }> {
  try {
    const { data, error } = await createAdminClient().from("marketplace_settings").select("commission_bps, pro_commission_bps, deposit_bps").maybeSingle();
    if (error) throw error;
    const r = termsFromRow((data as Row | null) ?? null);
    if (data && r.source === "defaut") console.error("[marketplace-settings] ligne incohérente : valeurs de l'ADR appliquées");
    return r;
  } catch (e) {
    if (!isMissingTable(e as { code?: string; message?: string })) console.error("[marketplace-settings] lecture impossible, valeurs de l'ADR appliquées:", (e as Error).message);
    return { terms: DEFAULT_TERMS, source: "defaut" };
  }
}

export async function saveTerms(terms: MarketplaceTerms, userId: string): Promise<boolean> {
  try {
    const { error } = await createAdminClient()
      .from("marketplace_settings")
      .upsert({ id: true, commission_bps: terms.commissionBps, pro_commission_bps: terms.proCommissionBps, deposit_bps: terms.depositBps, updated_by: userId, updated_at: new Date().toISOString() }, { onConflict: "id" });
    if (error) throw error;
    return true;
  } catch (e) {
    console.error("[marketplace-settings] saveTerms failed:", (e as Error).message);
    return false;
  }
}
