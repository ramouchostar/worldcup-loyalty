// ============================================================
// Signal « transports et grèves » — avis iRail (SNCB) et STIB (backlog
// plateforme, décidé le 2026-10-01 ; ADR 0074 §8).
//
// Module PUR : aucun réseau, aucune base, aucune horloge (la date du jour est
// injectée). Il normalise les avis des deux sources, retrouve les dates
// écrites dans le texte (les deux API n'en donnent pas de structurées) et
// dit, pour UN établissement, quels avis le concernent.
//
// SANS géolocalisation : les établissements n'ont pas encore de coordonnées
// (backlog « Signaux : coordonnées de chaque établissement »). Le
// rapprochement se fait donc par MOTS-CLÉS de quartier (« Bockstael »,
// « Simonis »…) cherchés dans le texte de l'avis. Quand les coordonnées
// existeront, un rapprochement par distance s'ajoutera, sans changer ce module.
//
// Il ne choisit PAS l'action (« toujours ouverts, voici l'accès ») : c'est le
// rôle du moteur du copilote. Rien ici n'atteint un membre (ADR 0007).
// ============================================================

export type TransportSource = "irail" | "stib";
export type TransportKind = "travaux" | "perturbation" | "evenement" | "greve" | "information";
/** coupure : arrêt/gare/ligne supprimé ou remplacé · adaptation : dévié, déplacé, horaire adapté · information : le reste. */
export type TransportSeverity = "coupure" | "adaptation" | "information";

/** Période trouvée dans le texte. `from`/`to` nuls = début ou fin non écrit(e) (« Dès le 6/6 », « Jsq 2028 »). */
export type DateHint = {
  from: string | null; // AAAA-MM-JJ
  to: string | null;
  /** « Les week-ends, du 17/10 au 15/11 » : seuls les samedis et dimanches de la période. */
  weekendsOnly: boolean;
  /** Fin déduite (« +/- 2 semaines », « Jsq 2028 ») : indicative, pas écrite en toutes lettres. */
  approximate: boolean;
};

export type TransportNotice = {
  id: string; // « irail:3 » · « stib:30616323 »
  source: TransportSource;
  kind: TransportKind;
  severity: TransportSeverity;
  /** iRail : tronçon concerné (« Jette - Bruxelles-Midi »). */
  title: string | null;
  text: string;
  /** STIB : identifiants de lignes et d'arrêts touchés. */
  lines: string[];
  stopIds: string[];
  priority: number | null;
  /** iRail : date de publication de l'avis (ISO UTC). */
  publishedAt: string | null;
  link: string | null;
  dates: DateHint[];
};

// ── Lecture des réponses ────────────────────────────────────────────────────

function str(x: unknown): string | null {
  return typeof x === "string" && x.trim() ? x : null;
}

const STRIKE = /gr[eè]ve|staking|strike|actions?\s+syndicale/i;
const COUPURE =
  /ne s.arr[eê]te|arr[eê]t supprim|non desservi|remplac[eé]s? par|ferm[eé]e?s?\b|fermeture|suspendu|interrompu|aucun (?:train|m[eé]tro|tram|bus)|pas de (?:train|m[eé]tro|tram|bus)/i;
const ADAPTATION = /d[eé]vi[eé]|d[eé]vo[iy]|adapt[eé]|d[eé]plac[eé]|reprend l/i;

export function severityOf(text: string, kind: TransportKind): TransportSeverity {
  if (kind === "greve" || COUPURE.test(text)) return "coupure";
  if (ADAPTATION.test(text)) return "adaptation";
  return "information";
}

/** iRail : `{ disturbance: [{ id, title, description, type, link, timestamp }] }`. */
export function parseIrailDisturbances(raw: unknown, today: string): TransportNotice[] {
  const list = raw && typeof raw === "object" ? (raw as { disturbance?: unknown }).disturbance : null;
  if (!Array.isArray(list)) return [];
  const out: TransportNotice[] = [];
  for (const x of list) {
    if (!x || typeof x !== "object") continue;
    const e = x as Record<string, unknown>;
    const text = str(e.description);
    const id = e.id != null ? String(e.id) : null;
    if (!text || !id) continue;
    const ts = Number(e.timestamp);
    const kind: TransportKind = STRIKE.test(`${e.title ?? ""} ${text}`)
      ? "greve"
      : e.type === "planned"
        ? "travaux"
        : "perturbation";
    out.push({
      id: `irail:${id}`,
      source: "irail",
      kind,
      severity: severityOf(text, kind),
      title: str(e.title),
      text: text.replace(/\s*\n+\s*/g, " ").trim(),
      lines: [],
      stopIds: [],
      priority: null,
      publishedAt: Number.isFinite(ts) && ts > 0 ? new Date(ts * 1000).toISOString() : null,
      link: str(e.link),
      dates: parseDateHints(text, today),
    });
  }
  return out;
}

function jsonArray(s: unknown): unknown[] {
  if (typeof s !== "string") return [];
  try {
    const v = JSON.parse(s);
    return Array.isArray(v) ? v : [];
  } catch {
    return [];
  }
}

function idsOf(s: unknown): string[] {
  return jsonArray(s).flatMap((x) => {
    const id = x && typeof x === "object" ? (x as { id?: unknown }).id : null;
    return typeof id === "string" || typeof id === "number" ? [String(id)] : [];
  });
}

/** STIB « Travellers Information » : `content`, `lines` et `points` sont des chaînes JSON. */
export function parseStibMessages(raw: unknown, today: string): TransportNotice[] {
  const list = raw && typeof raw === "object" ? (raw as { results?: unknown }).results : null;
  if (!Array.isArray(list)) return [];
  const out: TransportNotice[] = [];
  for (const x of list) {
    if (!x || typeof x !== "object") continue;
    const e = x as Record<string, unknown>;
    const id = e.id != null ? String(e.id) : null;
    const text = jsonArray(e.content)
      .flatMap((c) => {
        const t = c && typeof c === "object" ? (c as { text?: unknown }).text : null;
        const first = Array.isArray(t) ? (t[0] as Record<string, unknown> | undefined) : undefined;
        const s = str(first?.fr) ?? str(first?.en) ?? str(first?.nl);
        return s ? [s] : [];
      })
      .join(" ")
      .trim();
    if (!id || !text) continue;
    const kind: TransportKind = STRIKE.test(text)
      ? "greve"
      : /^(?:jsq|jusqu)[^.]*travaux|^travaux/i.test(text)
        ? "travaux"
        : /^[ée]v[ée]nement/i.test(text)
          ? "evenement"
          : "information";
    out.push({
      id: `stib:${id}`,
      source: "stib",
      kind,
      severity: severityOf(text, kind),
      title: null,
      text,
      lines: idsOf(e.lines),
      stopIds: idsOf(e.points),
      priority: typeof e.priority === "number" ? e.priority : null,
      publishedAt: null,
      link: null,
      dates: parseDateHints(text, today),
    });
  }
  return out;
}

// ── Dates écrites dans le texte ─────────────────────────────────────────────

const DAY_MS = 86_400_000;
function dayNumber(iso: string): number {
  return Math.floor(Date.parse(`${iso}T00:00:00Z`) / DAY_MS);
}
function fromDayNumber(n: number): string {
  return new Date(n * DAY_MS).toISOString().slice(0, 10);
}
export function addDays(iso: string, n: number): string {
  return fromDayNumber(dayNumber(iso) + n);
}
function pad(n: number): string {
  return String(n).padStart(2, "0");
}
function validDay(y: number, m: number, d: number): boolean {
  const t = new Date(Date.UTC(y, m - 1, d));
  return t.getUTCFullYear() === y && t.getUTCMonth() === m - 1 && t.getUTCDate() === d;
}
function addMonths(iso: string, n: number): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCMonth(d.getUTCMonth() + n);
  return d.toISOString().slice(0, 10);
}
function endOfMonth(y: number, m: number): string {
  return `${y}-${pad(m)}-${pad(new Date(Date.UTC(y, m, 0)).getUTCDate())}`;
}

const MONTHS: Record<string, number> = {
  janvier: 1, fevrier: 2, mars: 3, avril: 4, mai: 5, juin: 6,
  juillet: 7, aout: 8, septembre: 9, octobre: 10, novembre: 11, decembre: 12,
};

/**
 * Jour/mois sans année : l'occurrence la plus proche d'aujourd'hui (« 6/6 » lu
 * en octobre 2026 = juin 2026, « 15/1 » = janvier 2027). Avec année : telle quelle.
 */
function resolve(d: number, m: number, y: number | undefined, today: string): string | null {
  if (y !== undefined) {
    const yy = y < 100 ? 2000 + y : y;
    return validDay(yy, m, d) ? `${yy}-${pad(m)}-${pad(d)}` : null;
  }
  const ty = Number(today.slice(0, 4));
  let best: string | null = null;
  for (const yy of [ty - 1, ty, ty + 1]) {
    if (!validDay(yy, m, d)) continue;
    const iso = `${yy}-${pad(m)}-${pad(d)}`;
    if (best === null || Math.abs(dayNumber(iso) - dayNumber(today)) < Math.abs(dayNumber(best) - dayNumber(today))) best = iso;
  }
  return best;
}

const D = String.raw`(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?`;
const RANGE = new RegExp(String.raw`du\s+${D}\s+(?:au|à|jusqu['’]au)\s+${D}`, "gi");
// « 5/10-16/10/26 » : deux dates complètes reliées par un tiret. L'année écrite
// à la fin vaut pour les deux. Le « (?<![\d/]) » évite de lire « 10-16/10 » à
// l'intérieur de « 5/10-16/10 » ; le « (?![\d/h:]) » écarte « 11/10-17h30 ».
// Une heure peut séparer la première date du tiret (« 24/8 5h- 9/10/26 »).
const TIME = String.raw`(?:\s*\d{1,2}h(?:\d{2})?)?`;
const DATE_DASH_DATE = new RegExp(String.raw`(?<![\d/])${D}${TIME}\s*-\s*${D}(?![\d/h:])`, "g");
const DAY_SPAN = /(?<![\d/])(\d{1,2})\s*-\s*(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?\b/g;
// Début écrit, fin donnée en mois ou en année : « du 27/4/26 à fin avril 2027 »,
// « 27/4/26-fin 2027 », « du 19/1 à fin 2026 », « du 22/7 à +/- fin octobre 2026 »,
// « du 11/5/26 à avril 2027 ». Il faut « fin » ou un nom de mois : « dès le 7/10 à 2027 » n'en est pas un.
const FROM_UNTIL_END = new RegExp(
  String.raw`${D}${TIME}\s*(?:-|,|à|jusqu['’]à)\s*(?:\+\/-\s*)?(fin\s+)?(?:([a-zéû]+)\s+)?(\d{4})`,
  "gi"
);
const SINGLE = new RegExp(String.raw`\b${D}`, "g");
const DURATION = /(?:pour|pendant)\s*(?:\+\/-|environ)\s*(\d+)\s*(semaines?|mois|jours?)/i;
// « Jsq 2028 », « Jusqu’en 2028 », « Jsq fin 2026 », « Jsq décembre 2026 ».
const UNTIL_YEAR = /(?:jsq|jusqu['’e]?\s*(?:en|à|au)?)\s*(?:\+\/-\s*)?(fin\s+)?(?:([a-zéû]+)\s+)?(\d{4})/i;

function normalizeAccents(s: string): string {
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
}

// « 20 avril », « 1er mai », « 5 octobre 2026 » → « 20/4 », « 1/5 », « 5/10/2026 » :
// les avis écrivent les dates des deux façons, la suite ne lit que la première.
const WRITTEN_DATE = /\b(\d{1,2})(?:er)?\s+(janvier|f[ée]vrier|mars|avril|mai|juin|juillet|ao[uû]t|septembre|octobre|novembre|d[ée]cembre)\b(?:\s+(\d{4}))?/gi;
function writtenDatesToNumeric(s: string): string {
  return s.replace(WRITTEN_DATE, (_m, d: string, month: string, y?: string) => {
    return `${d}/${MONTHS[normalizeAccents(month)]}${y ? `/${y}` : ""}`;
  });
}

/**
 * Périodes écrites dans un avis. Reconnaît : « du 17/10 au 15/11 », « 10-11/10 »,
 * « le jeudi 08/10 », « du 29/9 pour +/- 2 semaines », « du 27/4/26 à fin avril
 * 2027 », « 27/4/26-fin 2027 », « dès le 6/6 », « Jsq 2028 ». Les heures
 * (« 04:26 », « 17h30 ») ne sont jamais prises pour des dates.
 */
export function parseDateHints(raw: string, today: string): DateHint[] {
  const text = writtenDatesToNumeric(raw);
  let rest = text;
  const hints: DateHint[] = [];
  // « Les week-ends, du 17/10 au 15/11 » : le mot précède la période. Cherché
  // juste avant elle, pas dans tout l'avis (« Tous les jours, du 31/10 au 8/11 »
  // peut cohabiter avec une phrase sur un week-end).
  const weekendBefore = (index: number) => /week-?ends?/i.test(text.slice(Math.max(0, index - 30), index));
  const take =(re: RegExp, fn: (m: RegExpExecArray) => DateHint | null) => {
    re.lastIndex = 0;
    let m: RegExpExecArray | null;
    const spans: [number, number][] = [];
    while ((m = re.exec(rest)) !== null) {
      const h = fn(m);
      if (h) {
        hints.push(h);
        spans.push([m.index, m.index + m[0].length]);
      }
      if (m[0].length === 0) re.lastIndex++;
    }
    // Les passages lus sont blanchis pour ne pas être relus comme dates seules.
    for (const [a, b] of spans.reverse()) rest = rest.slice(0, a) + " ".repeat(b - a) + rest.slice(b);
  };

  take(RANGE, (m) => {
    const from = resolve(+m[1], +m[2], m[3] ? +m[3] : undefined, today);
    let to = resolve(+m[4], +m[5], m[6] ? +m[6] : undefined, today);
    if (!from || !to) return null;
    if (to < from) to = addDays(to, 365); // période à cheval sur le nouvel an
    return { from, to, weekendsOnly: weekendBefore(m.index), approximate: false };
  });

  take(FROM_UNTIL_END, (m) => {
    const month = m[5] ? MONTHS[normalizeAccents(m[5])] : undefined;
    if (m[5] && !month) return null; // un mot qui n'est pas un mois
    if (!m[4] && !month) return null; // ni « fin » ni mois : pas une fin de période
    const endYear = +m[6];
    const to = month ? endOfMonth(endYear, month) : `${endYear}-12-31`;
    // Début sans année : la dernière occurrence qui ne dépasse pas la fin.
    const from =
      m[3] !== undefined
        ? resolve(+m[1], +m[2], +m[3], today)
        : [endYear, endYear - 1].map((y) => resolve(+m[1], +m[2], y, today)).find((d) => d !== null && d <= to) ?? null;
    return from && from <= to ? { from, to, weekendsOnly: false, approximate: true } : null;
  });

  take(DATE_DASH_DATE, (m) => {
    const endYear = m[6] ? +m[6] : undefined;
    const to = resolve(+m[4], +m[5], endYear, today);
    if (!to) return null;
    let from = resolve(+m[1], +m[2], m[3] ? +m[3] : endYear, today);
    if (!from) return null;
    // Début sans année qui tomberait après la fin : il est de l'année d'avant (« 28/12-3/1/27 »).
    if (!m[3] && from > to) from = resolve(+m[1], +m[2], Number(to.slice(0, 4)) - 1, today);
    return from && from <= to ? { from, to, weekendsOnly: false, approximate: false } : null;
  });

  take(DAY_SPAN, (m) => {
    const a = resolve(+m[1], +m[3], m[4] ? +m[4] : undefined, today);
    const b = resolve(+m[2], +m[3], m[4] ? +m[4] : undefined, today);
    return a && b && a <= b ? { from: a, to: b, weekendsOnly: false, approximate: false } : null;
  });

  // Dates seules : « le jeudi 08/10 » (un jour), « dès le 6/6 » (début sans fin),
  // « du 29/9 pour +/- 2 semaines » (début + durée écrite).
  const duration = DURATION.exec(text);
  const open = /(?:d[eè]s|[àa] partir d[ue]|^du|\bdu)\s+(?:le\s+)?(?:\w+\s+)?\d{1,2}\/\d{1,2}/i.test(rest);
  take(SINGLE, (m) => {
    const day = resolve(+m[1], +m[2], m[3] ? +m[3] : undefined, today);
    if (!day) return null;
    if (duration) {
      const n = Number(duration[1]);
      const unit = duration[2].toLowerCase();
      const to = unit.startsWith("mois") ? addMonths(day, n) : addDays(day, n * (unit.startsWith("semaine") ? 7 : 1));
      return { from: day, to, weekendsOnly: false, approximate: true };
    }
    return open
      ? { from: day, to: null, weekendsOnly: false, approximate: false }
      : { from: day, to: day, weekendsOnly: false, approximate: false };
  });

  // « Jsq 2028 » : donne la fin d'une période qui n'en avait pas (« dès le 6/6 »),
  // ou, seul, une période qui finit en 2028 sans début écrit.
  const until = UNTIL_YEAR.exec(text);
  const untilMonth = until?.[2] ? MONTHS[normalizeAccents(until[2])] : undefined;
  if (until && !(until[2] && !untilMonth) && !hints.some((h) => h.to)) {
    const end = untilMonth ? endOfMonth(+until[3], untilMonth) : `${until[3]}-12-31`;
    const open = hints.find((h) => h.to === null);
    if (open) {
      open.to = end;
      open.approximate = true;
    } else {
      hints.push({ from: null, to: end, weekendsOnly: false, approximate: true });
    }
  }
  return hints;
}

/** Le jour `day` (AAAA-MM-JJ) tombe-t-il dans la période ? Tient compte des « week-ends seulement ». */
export function hintCovers(h: DateHint, day: string): boolean {
  if (h.from && day < h.from) return false;
  if (h.to && day > h.to) return false;
  if (h.weekendsOnly) {
    const wd = new Date(`${day}T00:00:00Z`).getUTCDay(); // 0 = dimanche, 6 = samedi
    if (wd !== 0 && wd !== 6) return false;
  }
  return true;
}

// ── Sélection pour un établissement ─────────────────────────────────────────

export function normalizeText(s: string): string {
  return normalizeAccents(s).replace(/[^a-z0-9]+/g, " ").trim();
}

function containsPhrase(haystack: string, phrase: string): boolean {
  return phrase.length > 0 && ` ${haystack} `.includes(` ${phrase} `);
}

export type TransportSelectionInput = {
  notices: TransportNotice[];
  /** Jour d'aujourd'hui à Bruxelles, AAAA-MM-JJ (injecté). */
  today: string;
  /**
   * Mots-clés du quartier de l'établissement, cherchés dans le texte et le
   * titre des avis (« Bockstael », « Simonis », « Gare du Midi »…).
   */
  keywords: string[];
  /** Jours d'anticipation (défaut 7). */
  horizonDays?: number;
};

export type SelectedNotice = {
  notice: TransportNotice;
  matchedKeywords: string[];
  /** Période retenue dans la fenêtre ; nulle si l'avis n'a pas de date lisible. */
  window: { from: string; to: string } | null;
  datesKnown: boolean;
  activeToday: boolean;
  /** Jours avant le premier jour concerné dans la fenêtre (0 = aujourd'hui). */
  startsInDays: number;
  /** Période de plus de 60 jours : un chantier de fond, pas un événement. */
  longRunning: boolean;
};

export const DEFAULT_HORIZON_DAYS = 7;
const RECENT_DISTURBANCE_DAYS = 2;
const LONG_RUNNING_DAYS = 60;

/**
 * Avis qui concernent l'établissement dans la fenêtre [aujourd'hui, +horizon].
 * Un avis sans date lisible n'est gardé que s'il s'agit d'une grève, ou d'une
 * perturbation iRail publiée depuis moins de 2 jours. Triés : coupures
 * d'abord, puis par proximité.
 */
export function selectTransportNotices(input: TransportSelectionInput): SelectedNotice[] {
  const horizon = input.horizonDays ?? DEFAULT_HORIZON_DAYS;
  const end = addDays(input.today, horizon);
  const keywords = input.keywords.map((k) => ({ label: k, norm: normalizeText(k) })).filter((k) => k.norm);
  const out: SelectedNotice[] = [];

  for (const n of input.notices) {
    const hay = normalizeText(`${n.title ?? ""} ${n.text}`);
    const matched = keywords.filter((k) => containsPhrase(hay, k.norm)).map((k) => k.label);
    if (matched.length === 0) continue;

    // Jours de la fenêtre couverts par une période de l'avis.
    let firstDay: string | null = null;
    let lastDay: string | null = null;
    for (let d = input.today; d <= end; d = addDays(d, 1)) {
      if (n.dates.some((h) => hintCovers(h, d))) {
        firstDay ??= d;
        lastDay = d;
      }
    }

    let datesKnown = n.dates.length > 0;
    if (!firstDay) {
      if (datesKnown) continue; // des dates lisibles, mais aucune dans la fenêtre
      const recent =
        n.source === "irail" &&
        n.kind === "perturbation" &&
        n.publishedAt !== null &&
        dayNumber(input.today) - dayNumber(n.publishedAt.slice(0, 10)) <= RECENT_DISTURBANCE_DAYS;
      if (!recent && n.kind !== "greve") continue;
      datesKnown = false;
    }

    const spanDays = n.dates.reduce((max, h) => {
      if (!h.from || !h.to) return Math.max(max, Infinity);
      return Math.max(max, dayNumber(h.to) - dayNumber(h.from));
    }, 0);

    out.push({
      notice: n,
      matchedKeywords: matched,
      window: firstDay && lastDay ? { from: firstDay, to: lastDay } : null,
      datesKnown,
      activeToday: n.dates.some((h) => hintCovers(h, input.today)),
      startsInDays: firstDay ? dayNumber(firstDay) - dayNumber(input.today) : 0,
      longRunning: spanDays > LONG_RUNNING_DAYS,
    });
  }

  const rank: Record<TransportSeverity, number> = { coupure: 0, adaptation: 1, information: 2 };
  return out.sort(
    (a, b) =>
      rank[a.notice.severity] - rank[b.notice.severity] ||
      Number(a.longRunning) - Number(b.longRunning) ||
      a.startsInDays - b.startsInDays ||
      a.notice.id.localeCompare(b.notice.id)
  );
}
