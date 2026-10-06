// ============================================================
// Vacances scolaires — lecture d'OpenHolidays (backlog plateforme, décidé le
// 2026-10-01 ; ADR 0027 §5 amendé).
//
// Module PUR : aucun accès réseau ni base, aucune horloge (la date est
// injectée). Il transforme la réponse de l'API en lignes `reference_calendar`
// et PLANIFIE la synchro : quoi écrire, quoi retirer, quels trous signaler.
// L'exécution (réseau + base + journal) est dans school-holidays-sync.ts.
//
// Règle du 2026-10-06 : « API prioritaire, saisie en repli ». Une ligne
// manuelle (seed m46) n'est retirée que si l'API décrit la MÊME période pour la
// même communauté ; là où l'API ne dit rien (communauté germanophone après
// l'été 2026, fin de l'été francophone 2027), la ligne manuelle reste et le
// trou est compté.
//
// Rien ici n'atteint un membre (ADR 0007).
// ============================================================

export type SchoolCommunity = "FR" | "NL" | "DE";

/** Code de groupe OpenHolidays → communauté (ADR 0027 §5). */
const GROUP_TO_COMMUNITY: Record<string, SchoolCommunity> = {
  "BE-FR": "FR",
  "BE-NL": "NL",
  "BE-DE": "DE",
};

const COMMUNITY_SUFFIX: Record<SchoolCommunity, string> = {
  FR: "FWB",
  NL: "Vlaanderen",
  DE: "Ostbelgien",
};

export type ApiHoliday = {
  id: string;
  startDate: string; // AAAA-MM-JJ
  endDate: string;
  name: { language: string; text: string }[];
  groups: { code: string }[];
};

export type SyncRow = {
  external_id: string; // « <id OpenHolidays>:<communauté> »
  community: SchoolCommunity;
  starts_on: string;
  ends_on: string;
  label: string;
};

export type ExistingRow = {
  id: string;
  source: string; // « manuel » | « openholidays »
  external_id: string | null;
  community: string | null;
  starts_on: string;
  ends_on: string;
};

export type RemovedRow = { id: string; community: string | null; starts_on: string; ends_on: string; reason: string };

export type SyncPlan = {
  upserts: SyncRow[];
  /** Lignes manuelles remplacées par l'API (même période, même communauté). */
  removeManual: RemovedRow[];
  /** Lignes déjà synchronisées que l'API ne fournit plus. */
  removeStale: RemovedRow[];
  /** Jusqu'où l'API couvre chaque communauté (dernière fin de période multi-jours). */
  coveredThrough: Partial<Record<SchoolCommunity, string>>;
  /** Communautés que l'API ne couvre pas jusqu'à l'horizon. */
  shortCommunities: SchoolCommunity[];
  /** Lignes manuelles dans la zone couverte que l'API ne confirme pas : gardées, signalées. */
  orphanManual: RemovedRow[];
  /** Entrées ignorées : un seul jour (jour férié scolaire, « début des vacances d'été »…) ou groupe inconnu. */
  skipped: { singleDay: number; unknownGroup: number };
  /** Total de trous à surveiller = communautés courtes + lignes manuelles non confirmées. */
  gaps: number;
};

// ── Lecture de la réponse ───────────────────────────────────────────────────

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/** Ne garde que les entrées bien formées ; tout le reste est ignoré sans planter. */
export function parseOpenHolidays(raw: unknown): ApiHoliday[] {
  if (!Array.isArray(raw)) return [];
  const out: ApiHoliday[] = [];
  for (const x of raw) {
    if (!x || typeof x !== "object") continue;
    const o = x as Record<string, unknown>;
    if (typeof o.id !== "string" || typeof o.startDate !== "string" || typeof o.endDate !== "string") continue;
    if (!ISO_DATE.test(o.startDate) || !ISO_DATE.test(o.endDate) || o.startDate > o.endDate) continue;
    const name = Array.isArray(o.name)
      ? (o.name as unknown[]).flatMap((n) => {
          const r = n as Record<string, unknown>;
          return r && typeof r.language === "string" && typeof r.text === "string"
            ? [{ language: r.language, text: r.text }]
            : [];
        })
      : [];
    const groups = Array.isArray(o.groups)
      ? (o.groups as unknown[]).flatMap((g) => {
          const r = g as Record<string, unknown>;
          return r && typeof r.code === "string" ? [{ code: r.code }] : [];
        })
      : [];
    out.push({ id: o.id, startDate: o.startDate, endDate: o.endDate, name, groups });
  }
  return out;
}

// ── Dates (jours calendaires, UTC) ──────────────────────────────────────────

const DAY_MS = 86_400_000;
function dayNumber(iso: string): number {
  return Math.floor(Date.parse(`${iso}T00:00:00Z`) / DAY_MS);
}
export function addDays(iso: string, n: number): string {
  return new Date((dayNumber(iso) + n) * DAY_MS).toISOString().slice(0, 10);
}

/** Écart maximal (jours) entre deux débuts pour dire qu'il s'agit de la MÊME période. */
export const SAME_HOLIDAY_MAX_START_GAP_DAYS = 21;

// ── Lignes de l'API ─────────────────────────────────────────────────────────

export function toSyncRows(api: ApiHoliday[]): {
  rows: SyncRow[];
  coveredThrough: Partial<Record<SchoolCommunity, string>>;
  skipped: { singleDay: number; unknownGroup: number };
} {
  const rows: SyncRow[] = [];
  const coveredThrough: Partial<Record<SchoolCommunity, string>> = {};
  const skipped = { singleDay: 0, unknownGroup: 0 };

  for (const h of api) {
    // Un seul jour : fête de la Communauté (fermeture d'un jour) ou simple
    // repère de début (« Début des vacances d'été », sans date de fin). Ce
    // n'est pas une période de vacances — m46 n'en contient pas non plus.
    if (h.startDate === h.endDate) {
      skipped.singleDay += 1;
      continue;
    }
    const base = h.name.find((n) => n.language === "FR")?.text ?? h.name[0]?.text ?? "Vacances scolaires";
    for (const g of h.groups) {
      const community = GROUP_TO_COMMUNITY[g.code];
      if (!community) {
        skipped.unknownGroup += 1;
        continue;
      }
      rows.push({
        external_id: `${h.id}:${community}`,
        community,
        starts_on: h.startDate,
        ends_on: h.endDate,
        label: `${base} (${COMMUNITY_SUFFIX[community]})`,
      });
      const seen = coveredThrough[community];
      if (!seen || h.endDate > seen) coveredThrough[community] = h.endDate;
    }
  }
  return { rows, coveredThrough, skipped };
}

// ── Plan de synchro ─────────────────────────────────────────────────────────

export type PlanInput = {
  today: string; // AAAA-MM-JJ (injecté)
  /** Début de la fenêtre interrogée : rien d'antérieur n'est touché. */
  windowFrom: string;
  api: ApiHoliday[];
  /** Lignes `school_holiday` de `reference_calendar` dont la fin est ≥ windowFrom. */
  existing: ExistingRow[];
  /** Horizon de couverture attendu, en jours après `today` (défaut 365). */
  horizonDays?: number;
};

export const DEFAULT_HORIZON_DAYS = 365;

export function planSchoolHolidaySync(input: PlanInput): SyncPlan {
  const { rows, coveredThrough, skipped } = toSyncRows(input.api);
  const horizon = addDays(input.today, input.horizonDays ?? DEFAULT_HORIZON_DAYS);
  const apiIds = new Set(rows.map((r) => r.external_id));

  const removeStale: RemovedRow[] = input.existing
    .filter((e) => e.source === "openholidays" && e.external_id && !apiIds.has(e.external_id) && e.starts_on >= input.windowFrom)
    .map((e) => ({ id: e.id, community: e.community, starts_on: e.starts_on, ends_on: e.ends_on, reason: "plus fournie par l'API" }));

  const removeManual: RemovedRow[] = [];
  const orphanManual: RemovedRow[] = [];
  for (const e of input.existing) {
    if (e.source !== "manuel" || !e.community || e.starts_on < input.windowFrom) continue;
    const c = e.community as SchoolCommunity;
    const covered = coveredThrough[c];
    if (!covered || e.starts_on > covered) continue; // l'API ne dit rien : la ligne manuelle reste
    const twin = rows.find(
      (r) =>
        r.community === c &&
        Math.abs(dayNumber(r.starts_on) - dayNumber(e.starts_on)) <= SAME_HOLIDAY_MAX_START_GAP_DAYS
    );
    const entry = { id: e.id, community: e.community, starts_on: e.starts_on, ends_on: e.ends_on };
    if (twin) removeManual.push({ ...entry, reason: `remplacée par ${twin.starts_on} → ${twin.ends_on}` });
    else orphanManual.push({ ...entry, reason: "dans la zone couverte mais absente de l'API : gardée" });
  }

  const shortCommunities = (["FR", "NL", "DE"] as const).filter((c) => {
    const covered = coveredThrough[c];
    return !covered || covered < horizon;
  });

  return {
    upserts: rows,
    removeManual,
    removeStale,
    coveredThrough,
    shortCommunities,
    orphanManual,
    skipped,
    gaps: shortCommunities.length + orphanManual.length,
  };
}

/** Moins de lignes que ça : réponse suspecte (panne, filtre vide) — on n'écrit rien. */
export const MIN_PLAUSIBLE_ROWS = 8;
