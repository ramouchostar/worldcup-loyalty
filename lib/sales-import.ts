// ============================================================
// Import des ventes de caisse (ADR 0027 §2). Parsing CSV NATIF, zéro
// dépendance : robuste aux exports belges (délimiteur ; ou , ; virgule
// décimale ; dates JJ/MM/AAAA ou ISO). Le .xlsx est un suivi documenté
// (première dépendance de parsing à valider — cf. ADR 0027, points à
// l'implémentation). Fonctions PURES → testables et réutilisables côté
// client (aperçu/mapping) comme côté serveur (parse complet).
//
// On n'extrait QUE date + heure + montant — jamais d'identifiant client
// (garde-fou RGPD, ADR 0027).
// ============================================================

/** Indices de colonnes choisis par le restaurateur dans l'écran de mapping. */
export type ColumnMapping = { date: number; amount: number; time: number | null };

/** Une vente normalisée, prête pour le RPC import_restaurant_sales. */
export type ParsedSale = { d: string; t: string | null; a: number };

export type ParseResult = {
  rows: ParsedSale[];
  dropped: number; // lignes ignorées (date/montant illisibles)
  errors: string[]; // premiers exemples d'erreurs, pour l'aperçu
  dateMin: string | null;
  dateMax: string | null;
};

const p2 = (n: number): string => String(n).padStart(2, "0");

// ── CSV brut → table ────────────────────────────────────────────────────────

/** Devine le délimiteur d'après la ligne d'en-tête (tab > ; > ,). */
export function detectDelimiter(headerLine: string): string {
  const comma = (headerLine.match(/,/g) ?? []).length;
  const semi = (headerLine.match(/;/g) ?? []).length;
  const tab = (headerLine.match(/\t/g) ?? []).length;
  if (tab >= comma && tab >= semi && tab > 0) return "\t";
  if (semi > comma) return ";";
  return ",";
}

/** Découpe une ligne CSV en respectant les guillemets et les "" échappés. */
export function splitCsvLine(line: string, delim: string): string[] {
  const out: string[] = [];
  let cur = "";
  let quoted = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (quoted) {
      if (ch === '"') {
        if (line[i + 1] === '"') {
          cur += '"';
          i++;
        } else {
          quoted = false;
        }
      } else {
        cur += ch;
      }
    } else if (ch === '"') {
      quoted = true;
    } else if (ch === delim) {
      out.push(cur);
      cur = "";
    } else {
      cur += ch;
    }
  }
  out.push(cur);
  return out.map((s) => s.trim());
}

export function parseCsvTable(text: string): { headers: string[]; rows: string[][] } {
  const lines = text
    .replace(/\r\n?/g, "\n")
    .split("\n")
    .filter((l) => l.trim().length > 0);
  if (lines.length === 0) return { headers: [], rows: [] };
  const delim = detectDelimiter(lines[0]);
  const headers = splitCsvLine(lines[0], delim);
  const rows = lines.slice(1).map((l) => splitCsvLine(l, delim));
  return { headers, rows };
}

// ── Normalisation des champs ────────────────────────────────────────────────

/** "12,50 €" | "1.234,56" | "12.50" → nombre (gère la virgule décimale). */
export function normalizeAmount(raw: string | undefined): number | null {
  if (!raw) return null;
  let s = raw.replace(/[^\d,.-]/g, "").trim(); // retire €, espaces, texte
  if (!s) return null;
  const hasComma = s.includes(",");
  const hasDot = s.includes(".");
  if (hasComma && hasDot) {
    // Le dernier séparateur rencontré est le décimal ; l'autre = milliers.
    if (s.lastIndexOf(",") > s.lastIndexOf(".")) s = s.replace(/\./g, "").replace(",", ".");
    else s = s.replace(/,/g, "");
  } else if (hasComma) {
    s = s.replace(",", ".");
  }
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

function isoDate(y: number, mo: number, da: number): string | null {
  if (mo < 1 || mo > 12 || da < 1 || da > 31) return null;
  return `${y}-${p2(mo)}-${p2(da)}`;
}

/** ISO (AAAA-MM-JJ) ou belge (JJ/MM/AAAA, JJ-MM-AAAA, JJ.MM.AA) → AAAA-MM-JJ. */
export function normalizeDate(raw: string | undefined): string | null {
  if (!raw) return null;
  const s = raw.trim();
  const iso = /^(\d{4})-(\d{1,2})-(\d{1,2})/.exec(s);
  if (iso) return isoDate(Number(iso[1]), Number(iso[2]), Number(iso[3]));
  const eu = /^(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{2,4})/.exec(s);
  if (eu) {
    const yy = eu[3].length === 2 ? Number(`20${eu[3]}`) : Number(eu[3]);
    return isoDate(yy, Number(eu[2]), Number(eu[1])); // JJ/MM → mois=eu[2]
  }
  return null;
}

/** "12:30", "12:30:45", "12h30" → HH:MM(:SS) ; sinon null (heure optionnelle). */
export function normalizeTime(raw: string | undefined): string | null {
  if (!raw) return null;
  const m = /(\d{1,2})[:h](\d{2})(?::(\d{2}))?/.exec(raw.trim());
  if (!m) return null;
  const h = Number(m[1]);
  if (h > 23) return null;
  return `${p2(h)}:${m[2]}${m[3] ? `:${m[3]}` : ""}`;
}

// ── Aide au mapping : pré-sélection des colonnes d'après leurs noms ──────────

const DATE_KEYS = ["date", "jour", "datum", "day", "semaine", "week", "mois", "month", "période", "periode", "period"];
const AMOUNT_KEYS = ["montant", "total", "ttc", "amount", "bedrag", "prix", "ca ", "chiffre", "recette", "revenu", "revenue", "vente", "sales", "omzet", "turnover", "net", "brut", "encaiss"];
const TIME_KEYS = ["heure", "time", "tijd", "hour", "uur"];

export function guessMapping(headers: string[]): {
  date: number | null;
  amount: number | null;
  time: number | null;
} {
  const norm = headers.map((h) => h.toLowerCase());
  const find = (keys: string[], exclude: number[] = []): number | null => {
    for (let i = 0; i < norm.length; i++) {
      if (exclude.includes(i)) continue;
      if (keys.some((k) => norm[i].includes(k))) return i;
    }
    return null;
  };
  const date = find(DATE_KEYS);
  const time = find(TIME_KEYS, date === null ? [] : [date]);
  const amount = find(AMOUNT_KEYS, [date, time].filter((x): x is number => x !== null));
  return { date, amount, time };
}

// « Sans contrainte » (2026-08-22) : chaque logiciel de caisse nomme ses
// colonnes à sa façon (« Semaine du », « Omzet », « Encaissé TTC »…). On devine
// d'abord par les EN-TÊTES, puis on COMPLÈTE par le CONTENU : la colonne dont
// les valeurs sont des dates devient la date ; parmi les autres colonnes
// numériques, la plus « totale » (la mieux remplie, puis la plus grosse en
// moyenne) devient le montant ; une colonne d'heures, l'heure. Le restaurateur
// n'a plus à désigner quoi que ce soit dans l'immense majorité des cas.
export function guessMappingSmart(headers: string[], rows: string[][]): {
  date: number | null;
  amount: number | null;
  time: number | null;
} {
  const byHeader = guessMapping(headers);
  const sample = rows.slice(0, 200);
  const nCols = Math.max(headers.length, ...sample.map((r) => r.length));
  if (sample.length === 0 || nCols === 0) return byHeader;

  const col = (i: number) => sample.map((r) => String(r[i] ?? "")).filter((v) => v.trim() !== "");
  const ratio = (vals: string[], ok: (v: string) => boolean) => (vals.length ? vals.filter(ok).length / vals.length : 0);

  const stats = Array.from({ length: nCols }, (_, i) => {
    const vals = col(i);
    const dateR = ratio(vals, (v) => normalizeDate(v) !== null);
    // une cellule « 12/06/2026 14:30 » est une date, pas un montant
    const amountR = ratio(vals, (v) => normalizeDate(v) === null && normalizeTime(v) === null && normalizeAmount(v) !== null);
    const timeR = ratio(vals, (v) => normalizeDate(v) === null && normalizeTime(v) !== null);
    const nums = vals.map((v) => normalizeAmount(v)).filter((n): n is number => n !== null);
    const mean = nums.length ? nums.reduce((s, n) => s + n, 0) / nums.length : 0;
    // Indices « c'est un montant » / « ce n'en est pas un » :
    const decR = ratio(vals, (v) => /[.,]\d{1,2}\s*€?$/.test(v.trim()));      // des centimes
    const allInt = nums.length > 0 && nums.every((n) => Number.isInteger(n));
    const idLike = allInt && nums.length >= 3 && nums.every((n, k) => k === 0 || n === nums[k - 1] + 1); // 101, 102, 103…
    const qtyLike = allInt && nums.length > 0 && Math.max(...nums) <= 30;       // 1, 2, 3 (quantités)
    const headerHint = AMOUNT_KEYS.some((k) => (headers[i] ?? "").toLowerCase().includes(k));
    const amountScore = amountR + 0.6 * decR + (headerHint ? 0.3 : 0) - (idLike ? 0.8 : 0) - (qtyLike ? 0.4 : 0);
    return { i, filled: vals.length, dateR, amountR, timeR, mean, amountScore };
  });

  let date = byHeader.date;
  if (date === null || stats[date]?.dateR < 0.5) {
    const best = [...stats].filter((s) => s.dateR >= 0.6).sort((a, b) => b.dateR - a.dateR || b.filled - a.filled)[0];
    date = best ? best.i : date;
  }

  let time = byHeader.time;
  if (time === null || time === date) {
    const best = [...stats].filter((s) => s.i !== date && s.timeR >= 0.6).sort((a, b) => b.timeR - a.timeR)[0];
    time = best ? best.i : null;
  }

  let amount = byHeader.amount;
  const amountOk = amount !== null && amount !== date && amount !== time && (stats[amount]?.amountR ?? 0) >= 0.5;
  if (!amountOk) {
    const candidates = stats.filter((s) => s.i !== date && s.i !== time && s.amountR >= 0.6);
    // meilleur score « montant » (centimes, en-tête, pas un n° ni une quantité),
    // puis la plus grosse en moyenne (un total > un prix unitaire)
    candidates.sort((a, b) => b.amountScore - a.amountScore || b.mean - a.mean);
    amount = candidates[0] ? candidates[0].i : amount;
  }
  return { date, amount, time };
}

// ── Parse complet (serveur) ─────────────────────────────────────────────────

// Cœur de la normalisation, indépendant du format source. Prend une grille de
// cellules (issue du CSV OU du .xlsx) → ventes normalisées. Les cellules sont
// coercées en chaîne par sécurité (un client pourrait envoyer des nombres).
export function parseRowsFromGrid(rows: string[][], mapping: ColumnMapping): ParseResult {
  const out: ParsedSale[] = [];
  let dropped = 0;
  const errors: string[] = [];
  for (const cols of rows) {
    const dRaw = String(cols[mapping.date] ?? "");
    const aRaw = String(cols[mapping.amount] ?? "");
    const tRaw = mapping.time != null ? String(cols[mapping.time] ?? "") : undefined;
    const d = normalizeDate(dRaw);
    const a = normalizeAmount(aRaw);
    if (d === null || a === null || a < 0) {
      dropped++;
      if (errors.length < 5) errors.push(`Ligne ignorée — date : "${dRaw}", montant : "${aRaw}"`);
      continue;
    }
    out.push({ d, t: normalizeTime(tRaw), a });
  }
  const sortedDates = out.map((r) => r.d).sort();
  return {
    rows: out,
    dropped,
    errors,
    dateMin: sortedDates[0] ?? null,
    dateMax: sortedDates[sortedDates.length - 1] ?? null,
  };
}

/** Parse un CSV brut (délègue à parseRowsFromGrid après découpage). */
export function parseSalesRows(text: string, mapping: ColumnMapping): ParseResult {
  return parseRowsFromGrid(parseCsvTable(text).rows, mapping);
}
