// ============================================================
// Réserver un prestataire (ADR 0084 §5 terdecies) — la couche de traduction : français, néerlandais, anglais.
//
// Le français est la langue de référence et le repli : une clé introuvable (ou une langue inconnue) rend le texte français, jamais
// une clé nue ni une page vide. Le typage garantit qu'aucune clé ne manque en NL ni en EN. Fonctions PURES, importables par le
// navigateur. Ce fichier ne charge QUE le français (repli) : les dictionnaires NL et EN sont chargés par `index.ts`, côté serveur, et seule la
// langue du bon utilisateur est envoyée au client (voir components/i18n/I18nProvider.tsx).
// ============================================================

import { fr, type MessageKey, type Messages } from "./messages/fr";

export type { MessageKey, Messages };

export const LOCALES = ["fr", "nl", "en"] as const;
export type Locale = (typeof LOCALES)[number];
export const DEFAULT_LOCALE: Locale = "fr";

export const LOCALE_LABEL: Record<Locale, string> = { fr: "Français", nl: "Nederlands", en: "English" };
/** L'étiquette BCP 47 pour les dates et les nombres : la Belgique pour le français et le néerlandais. */
export const LOCALE_TAG: Record<Locale, string> = { fr: "fr-BE", nl: "nl-BE", en: "en-GB" };

export const isLocale = (v: unknown): v is Locale => typeof v === "string" && (LOCALES as readonly string[]).includes(v);
export const normalizeLocale = (v: unknown): Locale => (isLocale(v) ? v : DEFAULT_LOCALE);

export type Vars = Record<string, string | number>;

/** Remplace les `{variables}`. Une variable absente reste visible (`{n}`) : on voit l'oubli, on ne cache rien. */
export function interpolate(template: string, vars?: Vars): string {
  if (!vars) return template;
  return template.replace(/\{(\w+)\}/g, (whole, name: string) => (name in vars ? String(vars[name]) : whole));
}

/** Les clés dont existent les deux formes `.one` et `.other`. */
export type PluralBase = { [K in MessageKey]: K extends `${infer B}.one` ? B : never }[MessageKey];

export type Translator = {
  locale: Locale;
  t: (key: MessageKey, vars?: Vars) => string;
  /** Pluriel : « 1 message » / « 3 messages ». `n` est aussi disponible comme `{n}`. */
  tp: (base: PluralBase, n: number, vars?: Vars) => string;
  /**
   * Une prestation ou une raison écrite telle quelle dans les données (en français : « Montage », « Je suis malade »…) est affichée dans la
   * langue de celui qui lit ; ce qui n'a pas de traduction (texte libre) reste tel quel. La donnée enregistrée ne change JAMAIS.
   */
  canon: (kind: CanonKind, text: string) => string;
  /**
   * Le message d'une réponse d'erreur du serveur : une cause connue (`reason`) a sa phrase dans la langue de l'utilisateur ; en français on garde
   * le texte précis du serveur ; sinon le repli donné.
   */
  err: (body: { reason?: unknown; error?: unknown } | null | undefined, fallback: MessageKey) => string;
};

export type CanonKind = "included" | "refuse" | "cancel" | "report" | "changeRefuse";

export function makeTranslator(locale: Locale, messages: Messages): Translator {
  const t = (key: MessageKey, vars?: Vars) => interpolate(messages[key] ?? fr[key] ?? key, vars);
  return {
    locale,
    t,
    tp: (base, n, vars) => t(`${base}.${n === 1 ? "one" : "other"}` as MessageKey, { n, ...vars }),
    err: (body, fallback) => {
      const key = typeof body?.reason === "string" ? `err.${body.reason}` : "";
      if (key && key in fr) return t(key as MessageKey);
      if (locale === "fr" && typeof body?.error === "string" && body.error) return body.error;
      return t(fallback);
    },
    canon: (kind, text) => {
      if (text === "Autre raison") return t("canon.other");
      const key = `canon.${kind}.${text}`;
      return key in fr ? t(key as MessageKey) : text;
    },
  };
}

// ── Formats ──────────────────────────────────────────────────

/** Euros « 1 234,50 € » (fr, nl) ou « €1,234.50 » (en). Interface restaurateur / prestataire / plateforme, jamais membre. */
export function formatEurosL(cents: number, locale: Locale): string {
  return new Intl.NumberFormat(LOCALE_TAG[locale], { style: "currency", currency: "EUR", minimumFractionDigits: cents % 100 === 0 ? 0 : 2, maximumFractionDigits: 2 }).format(cents / 100);
}

/** Un jour « YYYY-MM-DD » en toutes lettres : « mardi 20 octobre » / « dinsdag 20 oktober » / « Tuesday 20 October ». */
export function dayLabel(day: string, locale: Locale): string {
  const d = new Date(`${day}T12:00:00Z`);
  if (Number.isNaN(d.getTime())) return day;
  return new Intl.DateTimeFormat(LOCALE_TAG[locale], { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" }).format(d).replace(",", "");
}

/** Les sept jours de la semaine abrégés, lundi d'abord (24 octobre 2022 était un lundi). */
export function weekdayShort(locale: Locale): string[] {
  const f = new Intl.DateTimeFormat(LOCALE_TAG[locale], { weekday: "short", timeZone: "UTC" });
  return Array.from({ length: 7 }, (_, i) => f.format(new Date(Date.UTC(2022, 9, 24 + i, 12))));
}

/** « octobre 2026 » / « oktober 2026 » / « October 2026 » pour un mois « YYYY-MM ». */
export function monthLabel(month: string, locale: Locale): string {
  const d = new Date(`${month}-01T12:00:00Z`);
  if (Number.isNaN(d.getTime())) return month;
  return new Intl.DateTimeFormat(LOCALE_TAG[locale], { month: "long", year: "numeric", timeZone: "UTC" }).format(d);
}

/** La taille d'un fichier : « 1,5 Mo » (fr), « 1,5 MB » (nl), « 1.5 MB » (en). */
export function humanSizeL(bytes: number, locale: Locale): string {
  const unit = locale === "fr" ? ["o", "Ko", "Mo"] : ["B", "KB", "MB"];
  if (bytes < 1024) return `${bytes} ${unit[0]}`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} ${unit[1]}`;
  const n = (bytes / (1024 * 1024)).toFixed(1);
  return `${locale === "en" ? n : n.replace(".", ",")} ${unit[2]}`;
}
