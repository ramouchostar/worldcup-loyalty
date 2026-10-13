// ============================================================
// Réserver un prestataire (ADR 0084 §3 règle 8) — les deux tours de retours.
//
// Un tour = UN envoi avec TOUTES les remarques, chacune classée et motivée : « je n'aime pas » seul est
// refusé. Une retouche n'est pas une refonte (l'écran le dit) : tout ce qui change le brief est une
// demande de modification, chiffrée par le prestataire. Fonctions PURES.
// ============================================================

import { MAX_RETOUCH_ROUNDS, roundsLeft, type MissionStatus } from "./mission-states";
import { checkRetouchNote, DESIGN_NOTE_CATEGORIES, VIDEO_NOTE_CATEGORIES, type NoteIssue } from "./mission-brief";
import type { Metier } from "./mission-money";

export const MAX_NOTES = 20;
export const MAX_NOTE_TEXT = 1_000;
export const MAX_TIMECODE = 12;

export type RetouchNote = { category: string; text: string; at: string | null };

export function categoriesFor(metier: Metier): readonly string[] {
  return metier === "video" || metier === "photo" ? VIDEO_NOTE_CATEGORIES : DESIGN_NOTE_CATEGORIES;
}

/** Un horodatage facultatif (« 0:08 », « 1:05 ») : où, dans la vidéo, la remarque s'applique. */
const TIMECODE = /^\d{1,2}:[0-5]\d$/;

export function sanitizeNotes(raw: unknown): { category: string | null; text: string; at: string }[] {
  const list = raw && typeof raw === "object" && Array.isArray((raw as { notes?: unknown }).notes) ? ((raw as { notes: unknown[] }).notes) : [];
  return list.slice(0, MAX_NOTES + 1).map((n) => {
    const o = n && typeof n === "object" ? (n as Record<string, unknown>) : {};
    return {
      category: typeof o.category === "string" ? o.category.trim() : null,
      text: typeof o.text === "string" ? o.text.trim().slice(0, MAX_NOTE_TEXT + 1) : "",
      at: typeof o.at === "string" ? o.at.trim().slice(0, MAX_TIMECODE) : "",
    };
  });
}

export type RetouchIssue = { index: number; issue: NoteIssue | "timecode_invalid" | "text_too_long" };
export type RetouchVerdict = { ok: true; notes: RetouchNote[] } | { ok: false; reason: "empty" | "too_many" | "notes"; problems: RetouchIssue[] };

/** Le tour est-il recevable ? Au moins une remarque, vingt au plus, chacune classée, motivée et lisible. */
export function judgeRetouchRound(notes: { category: string | null; text: string; at: string }[], metier: Metier): RetouchVerdict {
  if (notes.length === 0) return { ok: false, reason: "empty", problems: [] };
  if (notes.length > MAX_NOTES) return { ok: false, reason: "too_many", problems: [] };
  const categories = categoriesFor(metier);
  const problems: RetouchIssue[] = [];
  notes.forEach((n, index) => {
    const issue = checkRetouchNote({ category: n.category, text: n.text }, categories);
    if (issue) problems.push({ index, issue });
    else if (n.text.length > MAX_NOTE_TEXT) problems.push({ index, issue: "text_too_long" });
    else if (n.at && !TIMECODE.test(n.at)) problems.push({ index, issue: "timecode_invalid" });
  });
  if (problems.length > 0) return { ok: false, reason: "notes", problems };
  return { ok: true, notes: notes.map((n) => ({ category: n.category as string, text: n.text, at: n.at || null })) };
}

export const RETOUCH_ISSUE_TEXT: Record<RetouchIssue["issue"], string> = {
  no_category: "Choisis ce qui ne va pas : lumière, rythme, texte…",
  empty: "Écris ce que tu veux changer.",
  vague: "Dis pourquoi, pour que le prestataire sache quoi corriger. Par exemple : « trop sombre, on ne voit pas la sauce ».",
  too_short: "Un peu plus précis, s'il te plaît : dis ce qui ne va pas et pourquoi.",
  timecode_invalid: "Le moment s'écrit minutes:secondes, par exemple 0:08.",
  text_too_long: "Cette remarque est trop longue (1 000 caractères au plus).",
};

// ── Où en est-on ? ───────────────────────────────────────────

export type RetouchState =
  | { can: true; round: 1 | 2; left: number }
  | { can: false; reason: "not_delivered" | "no_rounds_left" };

/** Le restaurateur peut-il demander un tour ? Seulement sur une livraison, et tant qu'il en reste. */
export function retouchState(status: MissionStatus, roundsUsed: number): RetouchState {
  if (status !== "livre") return { can: false, reason: "not_delivered" };
  if (roundsLeft(roundsUsed) <= 0) return { can: false, reason: "no_rounds_left" };
  return { can: true, round: (roundsUsed + 1) as 1 | 2, left: roundsLeft(roundsUsed) };
}

/** La livraison qui suit : la 1re est la version 1, après un tour la version 2, après deux tours la version 3. */
export function nextDeliveryRound(status: MissionStatus, roundsUsed: number): { ok: true; round: 1 | 2 | 3 } | { ok: false } {
  if (status === "production") return { ok: true, round: 1 };
  if (status === "retouche" && roundsUsed >= 1 && roundsUsed <= MAX_RETOUCH_ROUNDS) return { ok: true, round: (roundsUsed + 1) as 2 | 3 };
  return { ok: false };
}

export function versionLabel(round: number): string {
  return `Version ${round}`;
}

export function roundsLabel(left: number): string {
  return left <= 0 ? "Aucun tour de retours restant" : left === 1 ? "Il te reste 1 tour de retours" : `Il te reste ${left} tours de retours`;
}
