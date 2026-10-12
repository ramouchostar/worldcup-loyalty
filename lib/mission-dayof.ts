// ============================================================
// Réserver un prestataire (ADR 0084 §5) — le jour J.
//
//   date_bloquee → production : le prestataire est arrivé (à partir du jour du tournage)
//   compte-rendu : arrivée réelle, fin, ce qui a manqué — le restaurateur confirme ou conteste
//   production → livre : le prestataire livre des liens de téléchargement
//   livre → valide : le restaurateur valide
//
// Fonctions PURES : le jour belge est injecté ; rien ici ne lit ni n'écrit en base.
// ============================================================

// ── Démarrer ─────────────────────────────────────────────────

export type StartVerdict = "ok" | "too_early" | "not_booked";

/** On démarre à partir du JOUR du tournage (jamais la veille) ; la date réservée est la seule source. */
export function judgeStart(status: string, shootDate: string | null, today: string): StartVerdict {
  if (status !== "date_bloquee" || !shootDate) return "not_booked";
  return today < shootDate ? "too_early" : "ok";
}

// ── Compte-rendu ─────────────────────────────────────────────

/** Ce qui peut avoir manqué le jour J — des faits, pas des reproches : le litige lit ces cases. */
export const REPORT_MISSING_OPTIONS = [
  "Un plat n'était pas prêt",
  "Une personne prévue était absente",
  "Le lieu n'était pas rangé",
  "L'accès était difficile",
  "Le contact sur place était injoignable",
  "Du matériel me manquait",
  "Autre",
] as const;

export type ReportInput = { arrival: string; end: string; missing: string[]; note: string };
export type ReportIssueCode = "arrival_invalid" | "end_invalid" | "end_before_arrival" | "too_long" | "missing_unknown" | "note_too_long" | "note_required";
export type ReportIssue = { field: "arrival" | "end" | "missing" | "note"; code: ReportIssueCode };

const HHMM = /^([01]\d|2[0-3]):([0-5]\d)$/;
const toMinutes = (t: string): number => Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5));

export const MAX_REPORT_MINUTES = 12 * 60;
export const MAX_NOTE = 1_000;

export function sanitizeReport(raw: unknown): ReportInput {
  const o = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  const str = (v: unknown, max: number) => (typeof v === "string" ? v.trim().slice(0, max) : "");
  return {
    arrival: str(o.arrival, 5),
    end: str(o.end, 5),
    missing: Array.isArray(o.missing) ? [...new Set(o.missing.filter((x): x is string => typeof x === "string").map((x) => x.trim()))].slice(0, 10) : [],
    note: str(o.note, MAX_NOTE + 1),
  };
}

export function validateReport(r: ReportInput): { ok: boolean; issues: ReportIssue[]; durationMinutes: number | null } {
  const issues: ReportIssue[] = [];
  const arrivalOk = HHMM.test(r.arrival);
  const endOk = HHMM.test(r.end);
  if (!arrivalOk) issues.push({ field: "arrival", code: "arrival_invalid" });
  if (!endOk) issues.push({ field: "end", code: "end_invalid" });
  let durationMinutes: number | null = null;
  if (arrivalOk && endOk) {
    const d = toMinutes(r.end) - toMinutes(r.arrival);
    if (d <= 0) issues.push({ field: "end", code: "end_before_arrival" });
    else if (d > MAX_REPORT_MINUTES) issues.push({ field: "end", code: "too_long" });
    else durationMinutes = d;
  }
  if (r.missing.some((m) => !(REPORT_MISSING_OPTIONS as readonly string[]).includes(m))) issues.push({ field: "missing", code: "missing_unknown" });
  if (r.note.length > MAX_NOTE) issues.push({ field: "note", code: "note_too_long" });
  // « Autre » sans un mot d'explication ne dit rien à celui qui arbitrera.
  if (r.missing.includes("Autre") && r.note.trim().length < 5) issues.push({ field: "note", code: "note_required" });
  return { ok: issues.length === 0, issues, durationMinutes };
}

/**
 * Le tournage a-t-il dépassé ce que le devis annonçait ? Une demi-heure de marge : on ne chicane pas sur un quart d'heure.
 * C'est une INFORMATION pour la plateforme (la survente du temps est la première cause de dispute), jamais un refus.
 */
export function overrun(durationMinutes: number | null, quotedHours: number | null | undefined): { over: boolean; extraMinutes: number } {
  if (durationMinutes === null || !quotedHours || quotedHours <= 0) return { over: false, extraMinutes: 0 };
  const extra = durationMinutes - Math.round(quotedHours * 60);
  return { over: extra > 30, extraMinutes: Math.max(0, extra) };
}

export function formatDuration(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return h === 0 ? `${m} min` : m === 0 ? `${h} h` : `${h} h ${String(m).padStart(2, "0")}`;
}

export const REPORT_ISSUE_TEXT: Record<ReportIssueCode, string> = {
  arrival_invalid: "Indique ton heure d'arrivée (par exemple 09:30)",
  end_invalid: "Indique l'heure à laquelle tu as fini (par exemple 11:45)",
  end_before_arrival: "Tu as fini avant d'arriver : vérifie les heures",
  too_long: "Plus de 12 heures sur place : vérifie les heures",
  missing_unknown: "Une des cases n'est pas reconnue",
  note_too_long: "Ton commentaire est trop long (1 000 caractères au plus)",
  note_required: "Explique en quelques mots ce que « autre » recouvre",
};

// ── Confirmer ou contester ───────────────────────────────────

export type ContestInput = { contest: boolean; note: string };

/** Contester demande une raison : « je ne suis pas d'accord » seul ne dit rien à celui qui arbitrera. */
export function validateContest(i: ContestInput): { ok: boolean; issue?: "note_too_short" | "note_too_long" } {
  if (!i.contest) return { ok: true };
  const n = i.note.trim().length;
  if (n < 12) return { ok: false, issue: "note_too_short" };
  if (n > MAX_NOTE) return { ok: false, issue: "note_too_long" };
  return { ok: true };
}

// ── Livraison ────────────────────────────────────────────────

export const MAX_LINKS = 10;
export const MAX_LINK_LENGTH = 500;
export const MAX_DELIVERY_MESSAGE = 1_000;

export type DeliveryInput = { links: string[]; message: string };
export type DeliveryIssueCode = "no_link" | "too_many" | "link_invalid" | "link_not_https" | "link_credentials" | "link_too_long" | "message_too_long";
export type DeliveryIssue = { code: DeliveryIssueCode; index?: number };

export function sanitizeDelivery(raw: unknown): DeliveryInput {
  const o = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  const links = Array.isArray(o.links) ? o.links.filter((x): x is string => typeof x === "string").map((x) => x.trim()).filter(Boolean) : [];
  return {
    links: [...new Set(links)].slice(0, MAX_LINKS + 1),
    message: typeof o.message === "string" ? o.message.trim().slice(0, MAX_DELIVERY_MESSAGE + 1) : "",
  };
}

/**
 * Des liens de téléchargement, jamais des fichiers dans cette version (le stockage vient plus tard). Un lien
 * est affiché au restaurateur et cliqué : https seulement, pas d'identifiants dans l'adresse (hameçonnage),
 * jamais un `javascript:` ni un `data:`.
 */
export function validateDelivery(d: DeliveryInput): { ok: boolean; issues: DeliveryIssue[] } {
  const issues: DeliveryIssue[] = [];
  if (d.links.length === 0) issues.push({ code: "no_link" });
  if (d.links.length > MAX_LINKS) issues.push({ code: "too_many" });
  d.links.slice(0, MAX_LINKS).forEach((raw, index) => {
    if (raw.length > MAX_LINK_LENGTH) return void issues.push({ code: "link_too_long", index });
    let url: URL;
    try {
      url = new URL(raw);
    } catch {
      return void issues.push({ code: "link_invalid", index });
    }
    if (url.protocol !== "https:") return void issues.push({ code: "link_not_https", index });
    if (url.username || url.password) return void issues.push({ code: "link_credentials", index });
    if (!url.hostname.includes(".")) issues.push({ code: "link_invalid", index });
  });
  if (d.message.length > MAX_DELIVERY_MESSAGE) issues.push({ code: "message_too_long" });
  return { ok: issues.length === 0, issues };
}

export const DELIVERY_ISSUE_TEXT: Record<DeliveryIssueCode, string> = {
  no_link: "Ajoute au moins un lien de téléchargement",
  too_many: "10 liens au plus : regroupe tes fichiers dans un dossier partagé",
  link_invalid: "Ce lien n'est pas une adresse valide",
  link_not_https: "Le lien doit commencer par https://",
  link_credentials: "Retire l'identifiant et le mot de passe de l'adresse : partage un lien public",
  link_too_long: "Ce lien est trop long",
  message_too_long: "Ton message est trop long (1 000 caractères au plus)",
};

/** Où mène un lien, en clair : « wetransfer.com » — le restaurateur voit la destination avant de cliquer. */
export function linkHost(link: string): string {
  try {
    return new URL(link).hostname.replace(/^www\./, "");
  } catch {
    return link;
  }
}
