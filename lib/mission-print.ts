// ============================================================
// Réserver un prestataire (ADR 0084, PR P) — l'impression : le bon à tirer (BAT).
//
// Le BAT est le dernier regard avant que le papier parte à l'impression : l'imprimeur envoie une épreuve (liens https), le
// restaurateur la vérifie point par point et la SIGNE — ou demande des corrections (deux tours, chacun en un seul envoi,
// comme les retouches). Une fois signé, c'est exactement ce qui sera imprimé : on n'annule plus, on ne corrige plus, et une
// erreur visible sur le BAT n'est pas réimprimée gratuitement. Le solde est dû à la signature (ADR 0084 §2).
// Fonctions PURES : l'état du BAT se déduit de la liste des épreuves.
// ============================================================

import type { MessageKey, Translator } from "./i18n/core";
import { optionText } from "./i18n/questionnaire";
import type { BriefAnswers } from "./mission-brief";
import { MAX_LINKS, MAX_DELIVERY_MESSAGE, validateDelivery, type DeliveryInput, type DeliveryIssue } from "./mission-dayof";
import { MAX_NOTES, MAX_NOTE_TEXT } from "./mission-retouch";
import { checkRetouchNote, type NoteIssue } from "./mission-brief";

/** Une épreuve d'origine et deux corrections au plus : trois épreuves. */
export const MAX_BAT_ROUNDS = 3;
export const SIGN_NAME_MIN = 3;
export const SIGN_NAME_MAX = 80;
export const BAT_NOTE_CATEGORIES = ["Texte", "Prix", "Couleur", "Logo", "Photo", "Mise en page", "QR code", "Format", "Autre"] as const;

export type ProofStatus = "proposed" | "corrections" | "signed";
export type ProofLite = { round: number; status: ProofStatus };
export type BatPhase = "none" | "awaiting_review" | "corrections" | "signed";

export function batPhase(proofs: readonly ProofLite[]): BatPhase {
  if (proofs.some((p) => p.status === "signed")) return "signed";
  const last = [...proofs].sort((a, b) => a.round - b.round).at(-1);
  if (!last) return "none";
  return last.status === "proposed" ? "awaiting_review" : "corrections";
}

export const isBatSigned = (proofs: readonly ProofLite[]): boolean => batPhase(proofs) === "signed";

// ── Ce que contrôle le restaurateur ──────────────────────────

export type BatCheck = { key: string; label: string; sub: string };

/** La liste des points à cocher AVANT de signer. Le QR code n'en fait partie que s'il y en a un sur l'impression. */
export function batChecklist(brief: BriefAnswers | null | undefined): BatCheck[] {
  const a = brief ?? {};
  const hasQr = typeof a.qr_url === "string" && a.qr_url.trim().length > 0;
  const spec = [a.quantity, a.product, a.size].filter((x): x is string => typeof x === "string" && x.length > 0).join(" · ");
  return [
    { key: "texts", label: "Les textes et les prix sont corrects", sub: "Orthographe, prix, horaires, adresse, téléphone" },
    { key: "visual", label: "Le visuel et les couleurs me conviennent", sub: "Ce que tu vois est ce qui sera imprimé" },
    ...(hasQr ? [{ key: "qr", label: "Le QR code mène au bon endroit", sub: "Scanne-le avec ton téléphone depuis l'épreuve" }] : []),
    { key: "spec", label: "La quantité et le format sont corrects", sub: spec || "Quantité, format, papier" },
  ];
}

/** La liste de contrôle du bon à tirer dans la langue du restaurateur (mêmes clés que `batChecklist`). */
export function batChecklistT(brief: BriefAnswers | null | undefined, tr: Translator): BatCheck[] {
  const { t, locale } = tr;
  const a = brief ?? {};
  const spec = [
    ["quantity", a.quantity],
    ["product", a.product],
    ["size", a.size],
  ]
    .filter((x): x is [string, string] => typeof x[1] === "string" && x[1].length > 0)
    .map(([key, v]) => optionText(locale, "impression", key, v))
    .join(" · ");
  return batChecklist(brief).map((c) => ({ key: c.key, label: t(`rc.bat.check.${c.key}` as MessageKey), sub: c.key === "spec" ? spec || t("rc.bat.check.spec.default") : t(`rc.bat.check.${c.key}.sub` as MessageKey) }));
}

export type SignInput = { checks: Record<string, boolean>; name: string };
export type SignIssue = { code: "unchecked" | "name_missing" | "name_short" | "name_long"; key?: string };

export function sanitizeSign(raw: unknown): SignInput {
  const o = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  const c = o.checks && typeof o.checks === "object" && !Array.isArray(o.checks) ? (o.checks as Record<string, unknown>) : {};
  const checks: Record<string, boolean> = {};
  for (const [k, v] of Object.entries(c).slice(0, 10)) checks[k] = v === true;
  return { checks, name: typeof o.name === "string" ? o.name.trim().replace(/\s+/g, " ").slice(0, SIGN_NAME_MAX + 1) : "" };
}

/** Tout est coché (chaque point de LA liste, pas un autre) et la signature porte un vrai nom. */
export function validateSign(i: SignInput, required: readonly BatCheck[]): { ok: boolean; issues: SignIssue[] } {
  const issues: SignIssue[] = [];
  for (const c of required) if (i.checks[c.key] !== true) issues.push({ code: "unchecked", key: c.key });
  if (i.name.length === 0) issues.push({ code: "name_missing" });
  else if (i.name.length < SIGN_NAME_MIN) issues.push({ code: "name_short" });
  else if (i.name.length > SIGN_NAME_MAX) issues.push({ code: "name_long" });
  return { ok: issues.length === 0, issues };
}

export const SIGN_ISSUE_TEXT: Record<SignIssue["code"], string> = {
  unchecked: "Coche chaque point avant de signer.",
  name_missing: "Écris ton nom pour signer.",
  name_short: "Écris ton nom en entier pour signer.",
  name_long: "Ce nom est trop long.",
};

// ── Les gestes, selon l'état du BAT ──────────────────────────

export type ProofVerdict = "ok" | "not_production" | "already_signed" | "awaiting_review" | "no_rounds_left";

/** L'imprimeur envoie une épreuve : la première, ou la suivante après des corrections. Jamais après la signature, jamais deux à la fois. */
export function judgeSubmitProof(status: string, proofs: readonly ProofLite[]): ProofVerdict {
  if (status !== "production") return "not_production";
  const phase = batPhase(proofs);
  if (phase === "signed") return "already_signed";
  if (phase === "awaiting_review") return "awaiting_review";
  if (proofs.length >= MAX_BAT_ROUNDS) return "no_rounds_left";
  return "ok";
}

/** Le restaurateur répond à une épreuve en attente. */
export function judgeReview(status: string, proofs: readonly ProofLite[]): "ok" | "not_production" | "not_awaiting_review" {
  if (status !== "production") return "not_production";
  return batPhase(proofs) === "awaiting_review" ? "ok" : "not_awaiting_review";
}

/** Des corrections : seulement tant qu'il reste un tour (la 3e épreuve se signe, ou se plaide devant la plateforme). */
export function canRequestCorrections(proofs: readonly ProofLite[]): boolean {
  return batPhase(proofs) === "awaiting_review" && proofs.length < MAX_BAT_ROUNDS;
}

export function correctionRoundsLeft(proofs: readonly ProofLite[]): number {
  return Math.max(0, MAX_BAT_ROUNDS - proofs.length);
}

/** La livraison de l'impression suit la signature : jamais avant. */
export function canDeliverPrint(status: string, proofs: readonly ProofLite[]): boolean {
  return status === "production" && isBatSigned(proofs);
}

/** Après la signature, plus personne n'annule (l'impression est lancée) : seule la plateforme arrête. */
export function printLocksCancellation(proofs: readonly ProofLite[]): boolean {
  return isBatSigned(proofs);
}

// ── L'épreuve ────────────────────────────────────────────────

export type ProofInput = DeliveryInput;

/** Une épreuve a au moins un lien https (le PDF d'épreuve) : mêmes règles que les liens d'une livraison. */
export function validateProof(p: ProofInput): { ok: boolean; issues: DeliveryIssue[] } {
  return validateDelivery(p);
}

// ── Les corrections ──────────────────────────────────────────

export type CorrectionNote = { category: string; text: string };
export type CorrectionIssue = { index: number; issue: NoteIssue | "text_too_long" };

export function sanitizeCorrections(raw: unknown): { category: string | null; text: string }[] {
  const list = raw && typeof raw === "object" && Array.isArray((raw as { notes?: unknown }).notes) ? (raw as { notes: unknown[] }).notes : [];
  return list.slice(0, MAX_NOTES + 1).map((n) => {
    const o = n && typeof n === "object" ? (n as Record<string, unknown>) : {};
    return { category: typeof o.category === "string" ? o.category.trim() : null, text: typeof o.text === "string" ? o.text.trim().slice(0, MAX_NOTE_TEXT + 1) : "" };
  });
}

/** Toutes les corrections d'un tour, d'un coup, chacune classée et motivée. */
export function judgeCorrections(notes: { category: string | null; text: string }[]): { ok: true; notes: CorrectionNote[] } | { ok: false; reason: "empty" | "too_many" | "notes"; problems: CorrectionIssue[] } {
  if (notes.length === 0) return { ok: false, reason: "empty", problems: [] };
  if (notes.length > MAX_NOTES) return { ok: false, reason: "too_many", problems: [] };
  const problems: CorrectionIssue[] = [];
  notes.forEach((n, index) => {
    const issue = checkRetouchNote({ category: n.category, text: n.text }, BAT_NOTE_CATEGORIES);
    if (issue) problems.push({ index, issue });
    else if (n.text.length > MAX_NOTE_TEXT) problems.push({ index, issue: "text_too_long" });
  });
  if (problems.length > 0) return { ok: false, reason: "notes", problems };
  return { ok: true, notes: notes.map((n) => ({ category: n.category as string, text: n.text })) };
}

// ── La livraison de l'impression ─────────────────────────────

export const PRINT_DELIVERY_MESSAGE_MIN = 10;

/**
 * L'impression est un objet : « livrée au restaurant le 3 », « prête au retrait chez nous ». Pas de lien obligatoire, mais
 * un mot qui dit où et quand ; un lien (suivi du colis) est accepté s'il est valide.
 */
export function validatePrintDelivery(d: DeliveryInput): { ok: boolean; issues: DeliveryIssue[] } {
  if (d.links.length > 0) return validateDelivery(d);
  const issues: DeliveryIssue[] = [];
  if (d.message.length < PRINT_DELIVERY_MESSAGE_MIN) issues.push({ code: "no_link" });
  if (d.message.length > MAX_DELIVERY_MESSAGE) issues.push({ code: "message_too_long" });
  return { ok: issues.length === 0, issues };
}

export const PRINT_DELIVERY_ISSUE_TEXT: Record<"no_link", string> = { no_link: "Dis où et quand : « livré au restaurant le … » ou « prêt au retrait »." };

export { MAX_LINKS };

// ── Ce que le restaurateur relit sur le BAT ──────────────────

/** Ce que le restaurateur relit sur le BAT, dans sa langue. */
export function batSummaryT(brief: BriefAnswers | null | undefined, tr: Translator): { label: string; value: string }[] {
  const { t, locale } = tr;
  const a = brief ?? {};
  const s = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : null);
  const o = (key: string) => {
    const v = s(a[key]);
    return v ? optionText(locale, "impression", key, v) : null;
  };
  const rows: [string, string | null][] = [
    [t("rc.bat.sum.product"), o("product")],
    [t("rc.bat.sum.quantity"), o("quantity")],
    [t("rc.bat.sum.size"), o("size")],
    [t("rc.bat.sum.paper"), [o("paper"), o("finish")?.toLowerCase()].filter(Boolean).join(", ") || null],
    [t("rc.bat.sum.delivery"), o("delivery_mode")],
  ];
  return rows.filter((r): r is [string, string] => !!r[1]).map(([label, value]) => ({ label, value }));
}

export function batSummary(brief: BriefAnswers | null | undefined): { label: string; value: string }[] {
  const a = brief ?? {};
  const s = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : null);
  const rows: [string, string | null][] = [
    ["Produit", s(a.product)],
    ["Quantité", s(a.quantity)],
    ["Format", s(a.size)],
    ["Papier", [s(a.paper), s(a.finish)?.toLowerCase()].filter(Boolean).join(", ") || null],
    ["Réception", s(a.delivery_mode)],
  ];
  return rows.filter((r): r is [string, string] => !!r[1]).map(([label, value]) => ({ label, value }));
}
