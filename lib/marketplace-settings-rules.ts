// ============================================================
// Réserver un prestataire (ADR 0084 §2) — les réglages de la place de marché, LUS par le code.
//
// Jusqu'ici la commission, la commission Pro et l'acompte étaient des constantes ; la table
// `marketplace_settings` existait mais personne ne la lisait. Elle est maintenant la source : la plateforme
// les règle, le code les lit (ou retombe sur les valeurs de l'ADR, DIT dans les logs, si la lecture échoue).
// Ces trois seulement : les deux tours de retours, les 7 jours et la validation automatique sont des RÈGLES de
// l'ADR gravées dans la base (CHECK) et dans les écrans, pas des réglages.
//
// Fichier PUR (aucun accès à la base) : il est importé aussi par des composants du navigateur. La lecture/écriture est dans
// lib/marketplace-settings.ts.
// ============================================================

import { BPS, DEFAULT_TERMS, MIN_DEPOSIT_BPS, type MarketplaceTerms } from "./mission-money";

export const MAX_COMMISSION_BPS = 5_000; // 50 % : au-delà, c'est une erreur de saisie, jamais un choix

export type SettingsInput = { commissionPct: string; proCommissionPct: string; depositPct: string };
export type SettingsIssue = "commission_invalid" | "commission_too_high" | "pro_invalid" | "pro_above_standard" | "deposit_invalid" | "deposit_too_low";
export type SettingsVerdict = { ok: true; terms: MarketplaceTerms } | { ok: false; issues: SettingsIssue[] };

/** « 12,5 », « 12.5 », « 12,5 % » → 1250 ; tout le reste → null. Deux décimales au plus. */
export function pctToBps(input: string): number | null {
  const cleaned = String(input).replace(/[\s% ]/g, "").replace(",", ".");
  if (!/^\d+(\.\d{1,2})?$/.test(cleaned)) return null;
  const bps = Math.round(Number(cleaned) * 100);
  return Number.isSafeInteger(bps) ? bps : null;
}

export function bpsToPct(bps: number): string {
  const v = bps / 100;
  return Number.isInteger(v) ? String(v) : v.toFixed(2).replace(/0$/, "").replace(".", ",");
}

export function validateSettings(i: SettingsInput): SettingsVerdict {
  const issues: SettingsIssue[] = [];
  const commission = pctToBps(i.commissionPct);
  const pro = pctToBps(i.proCommissionPct);
  const deposit = pctToBps(i.depositPct);
  if (commission === null) issues.push("commission_invalid");
  else if (commission > MAX_COMMISSION_BPS) issues.push("commission_too_high");
  if (pro === null) issues.push("pro_invalid");
  else if (commission !== null && pro > commission) issues.push("pro_above_standard"); // une remise négative
  if (deposit === null || deposit > BPS) issues.push("deposit_invalid");
  else if (deposit < MIN_DEPOSIT_BPS) issues.push("deposit_too_low"); // jamais moins de 20 %
  if (issues.length > 0) return { ok: false, issues };
  return { ok: true, terms: { commissionBps: commission!, proCommissionBps: pro!, depositBps: deposit! } };
}

export const SETTINGS_ISSUE_TEXT: Record<SettingsIssue, string> = {
  commission_invalid: "Écris la commission en pourcentage, par exemple 12,5.",
  commission_too_high: "Une commission de plus de 50 % est sûrement une erreur de saisie.",
  pro_invalid: "Écris la commission du plan Pro en pourcentage, par exemple 5.",
  pro_above_standard: "La commission du plan Pro ne peut pas dépasser la commission standard : ce serait une remise négative.",
  deposit_invalid: "Écris l'acompte en pourcentage, par exemple 20.",
  deposit_too_low: "L'acompte ne descend jamais sous 20 % : c'est la règle qui protège le prestataire.",
};

/** Le prestataire reçoit (100 − commission) % du prix ; ce que ça donne sur 1 000 €, pour que la saisie soit lisible. */
export function exampleBreakdown(t: MarketplaceTerms): { provider: number; standardPays: number; proPays: number; platformStandard: number; platformPro: number } {
  const ref = 100_000;
  const provider = Math.round((ref * (BPS - t.commissionBps)) / BPS);
  const proPays = Math.round((ref * (BPS - (t.commissionBps - t.proCommissionBps))) / BPS);
  return { provider, standardPays: ref, proPays, platformStandard: ref - provider, platformPro: proPays - provider };
}

// ── Lire une ligne de la base (pur : la ligne est une entrée) ─

type Row = { commission_bps: number; pro_commission_bps: number; deposit_bps: number };

/** Une ligne illisible ou incohérente n'est JAMAIS appliquée : on retombe sur l'ADR, et on le dit. */
export function termsFromRow(row: Row | null): { terms: MarketplaceTerms; source: "base" | "defaut" } {
  if (!row) return { terms: DEFAULT_TERMS, source: "defaut" };
  const v = validateSettings({ commissionPct: bpsToPct(row.commission_bps), proCommissionPct: bpsToPct(row.pro_commission_bps), depositPct: bpsToPct(row.deposit_bps) });
  return v.ok ? { terms: v.terms, source: "base" } : { terms: DEFAULT_TERMS, source: "defaut" };
}

