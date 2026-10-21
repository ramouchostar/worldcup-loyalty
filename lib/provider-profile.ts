// ============================================================
// Réserver un prestataire (ADR 0084) — le profil du prestataire : ce que le restaurateur lit AVANT de lui confier un brief.
//
// « Ce que je fais », « ce que je ne fais pas » (le drone, la voix off… : dit d'avance, il évite le malentendu), le matériel, la
// zone, les langues, des exemples de travaux (liens https). Le profil est LU par les restaurateurs : aucun numéro de téléphone,
// e-mail ni lien de messagerie (même règle que la messagerie : tout passe par la plateforme). Fonctions PURES.
// ============================================================

import { maskContacts } from "./mission-messages";
import { judgeUrl, URL_ISSUE_TEXT, type UrlIssue } from "./safe-url";

export const PROFILE_LANGUAGES = ["Français", "Néerlandais", "Anglais"] as const;
export const MAX_TAGS = 12;
export const TAG_MAX = 40;
export const EQUIPMENT_MAX = 300;
export const ZONE_MAX = 120;
export const BIO_MAX = 500;
export const MAX_WORKS = 8;
export const WORK_LABEL_MIN = 3;
export const WORK_LABEL_MAX = 60;

export type ProviderProfile = {
  bio: string;
  does: string[];
  doesNot: string[];
  equipment: string;
  zone: string;
  languages: string[];
  works: { label: string; url: string }[];
};

export const EMPTY_PROFILE: ProviderProfile = { bio: "", does: [], doesNot: [], equipment: "", zone: "", languages: [], works: [] };

export type ProfileIssueCode = "too_many" | "too_long" | "tag_too_long" | "duplicate" | "language_unknown" | "work_label" | "work_url" | "contact_in_text";
export type ProfileIssue = { field: "bio" | "does" | "doesNot" | "equipment" | "zone" | "languages" | "works"; code: ProfileIssueCode; index?: number; url?: UrlIssue };

const txt = (v: unknown, max: number) => (typeof v === "string" ? v.replace(/\s+/g, " ").trim().slice(0, max + 1) : "");
const tags = (v: unknown) => (Array.isArray(v) ? [...new Set(v.filter((x): x is string => typeof x === "string").map((x) => txt(x, TAG_MAX)).filter(Boolean))].slice(0, MAX_TAGS + 1) : []);

export function sanitizeProfile(raw: unknown): ProviderProfile {
  const o = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  const works = Array.isArray(o.works)
    ? o.works.slice(0, MAX_WORKS + 1).map((w) => {
        const x = w && typeof w === "object" ? (w as Record<string, unknown>) : {};
        return { label: txt(x.label, WORK_LABEL_MAX), url: typeof x.url === "string" ? x.url.trim().slice(0, 501) : "" };
      })
    : [];
  return {
    bio: txt(o.bio, BIO_MAX),
    does: tags(o.does),
    doesNot: tags(o.doesNot),
    equipment: txt(o.equipment, EQUIPMENT_MAX),
    zone: txt(o.zone, ZONE_MAX),
    languages: Array.isArray(o.languages) ? [...new Set(o.languages.filter((x): x is string => typeof x === "string"))].slice(0, 5) : [],
    works,
  };
}

/** Le profil est-il publiable ? Chaque refus dit le champ, la ligne et la cause. */
export function validateProfile(p: ProviderProfile): { ok: boolean; issues: ProfileIssue[] } {
  const issues: ProfileIssue[] = [];
  const len = (field: ProfileIssue["field"], v: string, max: number) => {
    if (v.length > max) issues.push({ field, code: "too_long" });
    else if (maskContacts(v).masked) issues.push({ field, code: "contact_in_text" });
  };
  len("bio", p.bio, BIO_MAX);
  len("equipment", p.equipment, EQUIPMENT_MAX);
  len("zone", p.zone, ZONE_MAX);
  for (const [field, list] of [["does", p.does], ["doesNot", p.doesNot]] as const) {
    if (list.length > MAX_TAGS) issues.push({ field, code: "too_many" });
    list.slice(0, MAX_TAGS).forEach((t, index) => {
      if (t.length > TAG_MAX) issues.push({ field, code: "tag_too_long", index });
      else if (maskContacts(t).masked) issues.push({ field, code: "contact_in_text", index });
    });
  }
  // Une chose ne peut pas être à la fois faite et refusée.
  const lower = new Set(p.does.map((t) => t.toLowerCase()));
  p.doesNot.forEach((t, index) => {
    if (lower.has(t.toLowerCase())) issues.push({ field: "doesNot", code: "duplicate", index });
  });
  if (p.languages.some((l) => !(PROFILE_LANGUAGES as readonly string[]).includes(l))) issues.push({ field: "languages", code: "language_unknown" });
  if (p.works.length > MAX_WORKS) issues.push({ field: "works", code: "too_many" });
  p.works.slice(0, MAX_WORKS).forEach((w, index) => {
    if (w.label.length < WORK_LABEL_MIN || w.label.length > WORK_LABEL_MAX || maskContacts(w.label).masked) return void issues.push({ field: "works", code: "work_label", index });
    const u = judgeUrl(w.url);
    // Un lien vers une messagerie est un contact déguisé.
    if (!u.ok) return void issues.push({ field: "works", code: "work_url", index, url: u.issue });
    if (maskContacts(w.url).masked) issues.push({ field: "works", code: "work_url", index, url: "blocked_host" });
  });
  return { ok: issues.length === 0, issues };
}

export const PROFILE_ISSUE_TEXT: Record<ProfileIssueCode, string> = {
  too_many: "Trop d'éléments : garde les plus importants.",
  too_long: "C'est trop long : va à l'essentiel.",
  tag_too_long: "Cet élément est trop long (40 caractères au plus).",
  duplicate: "Tu ne peux pas à la fois le faire et ne pas le faire.",
  language_unknown: "Une langue n'est pas reconnue.",
  work_label: "Donne un nom à cet exemple (3 à 60 caractères).",
  work_url: "Cette adresse n'est pas valide : elle doit commencer par https://.",
  contact_in_text: "Retire les numéros, e-mails et liens de messagerie : tout passe par la plateforme.",
};

export function profileIssueText(i: ProfileIssue): string {
  if (i.code === "work_url" && i.url) return URL_ISSUE_TEXT[i.url];
  return PROFILE_ISSUE_TEXT[i.code];
}

/** Un profil vide n'affiche rien au restaurateur. */
export function isProfileEmpty(p: ProviderProfile | null | undefined): boolean {
  if (!p) return true;
  return !p.bio && p.does.length === 0 && p.doesNot.length === 0 && !p.equipment && !p.zone && p.languages.length === 0 && p.works.length === 0;
}

/** Ce que contient la base peut avoir été écrit avant une règle : on le relit toujours à travers le nettoyage. */
export function profileFromRow(raw: unknown): ProviderProfile {
  return sanitizeProfile(raw);
}
