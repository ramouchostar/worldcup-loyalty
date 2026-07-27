// ============================================================
// Lecteur .xlsx MINIMAL (ADR 0027). Décompresse le ZIP OOXML avec fflate
// (zéro-dépendance, audité) et extrait une grille de cellules. PAS de moteur
// de formules, PAS de macros, PAS d'écriture — on lit une grille, point.
// La grille repart ensuite dans le pipeline CSV (mapping + normalisation
// date/heure/montant) de lib/sales-import.
//
// Sécurité : la décompression se fait CÔTÉ CLIENT (navigateur du restaurateur,
// son propre fichier). Le serveur ne reçoit qu'une grille JSON bornée — aucun
// binaire non fiable n'est dézippé sur notre infra (pas de zip-bomb serveur).
// ============================================================

import { unzipSync, strFromU8 } from "fflate";

const XML_ENTITIES: Record<string, string> = {
  "&amp;": "&",
  "&lt;": "<",
  "&gt;": ">",
  "&quot;": '"',
  "&apos;": "'",
};

function decodeXml(s: string): string {
  return s
    .replace(/&#x([0-9a-fA-F]+);/g, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(parseInt(d, 10)))
    .replace(/&(amp|lt|gt|quot|apos);/g, (m) => XML_ENTITIES[m] ?? m);
}

/** "A" → 0, "B" → 1, "AA" → 26, à partir d'une réf de cellule "AB12". */
function colIndexFromRef(ref: string): number {
  let n = 0;
  for (let i = 0; i < ref.length; i++) {
    const c = ref.charCodeAt(i);
    if (c < 65 || c > 90) break; // stop au premier chiffre
    n = n * 26 + (c - 64);
  }
  return n - 1;
}

function parseSharedStrings(xml: string): string[] {
  if (!xml) return [];
  const out: string[] = [];
  const siRe = /<si\b[^>]*>([\s\S]*?)<\/si>/g;
  let m: RegExpExecArray | null;
  while ((m = siRe.exec(xml))) {
    const inner = m[1];
    let text = "";
    const tRe = /<t\b[^>]*>([\s\S]*?)<\/t>/g;
    let t: RegExpExecArray | null;
    while ((t = tRe.exec(inner))) text += t[1];
    out.push(decodeXml(text));
  }
  return out;
}

// Index de styles (cellXfs) représentant une date, et ceux représentant une
// heure seule — pour convertir les numéros de série Excel dans le bon format.
function parseStyles(xml: string): { date: Set<number>; time: Set<number> } {
  const date = new Set<number>();
  const time = new Set<number>();
  if (!xml) return { date, time };

  const customFmt = new Map<number, string>();
  const nfRe = /<numFmt\b[^>]*?numFmtId="(\d+)"[^>]*?formatCode="([^"]*)"[^>]*?\/?>/g;
  let nf: RegExpExecArray | null;
  while ((nf = nfRe.exec(xml))) customFmt.set(Number(nf[1]), decodeXml(nf[2]));

  const BUILTIN_DATE = new Set([14, 15, 16, 17, 22]); // dates + date/heure (22)
  const BUILTIN_TIME = new Set([18, 19, 20, 21, 45, 46, 47]); // heures / durées

  const isDateCode = (code: string) => /[dyDY]/.test(code) || /m{3,}/.test(code);
  const isTimeCode = (code: string) => /[hHsS]/.test(code) && !/[dyDY]/.test(code);

  const cellXfs = /<cellXfs\b[^>]*>([\s\S]*?)<\/cellXfs>/.exec(xml);
  if (!cellXfs) return { date, time };
  const xfRe = /<xf\b[^>]*?>/g; // chaque balise ouvrante xf, dans l'ordre
  let xf: RegExpExecArray | null;
  let i = 0;
  while ((xf = xfRe.exec(cellXfs[1]))) {
    const idM = /numFmtId="(\d+)"/.exec(xf[0]);
    const id = idM ? Number(idM[1]) : 0;
    const code = customFmt.get(id);
    if (BUILTIN_DATE.has(id) || (code != null && isDateCode(code))) date.add(i);
    else if (BUILTIN_TIME.has(id) || (code != null && isTimeCode(code))) time.add(i);
    i++;
  }
  return { date, time };
}

// 25569 = jours entre l'époque Excel (1899-12-30) et 1970-01-01. Gère le bug
// historique de l'année 1900 pour toute date moderne (série > 60).
function excelSerialToISO(serial: number): string {
  const d = new Date(Math.round((serial - 25569) * 86_400_000));
  const y = d.getUTCFullYear();
  const mo = String(d.getUTCMonth() + 1).padStart(2, "0");
  const da = String(d.getUTCDate()).padStart(2, "0");
  return `${y}-${mo}-${da}`;
}
function excelSerialToTime(serial: number): string {
  const mins = Math.round((serial - Math.floor(serial)) * 24 * 60);
  const hh = String(Math.floor(mins / 60) % 24).padStart(2, "0");
  const mm = String(mins % 60).padStart(2, "0");
  return `${hh}:${mm}`;
}

function pickFirstSheetName(files: Record<string, Uint8Array>): string | null {
  const names = Object.keys(files).filter((n) => /^xl\/worksheets\/sheet\d+\.xml$/.test(n));
  if (names.length === 0) return null;
  names.sort((a, b) => Number(a.match(/sheet(\d+)/)![1]) - Number(b.match(/sheet(\d+)/)![1]));
  return names[0];
}

function parseSheet(
  xml: string,
  shared: string[],
  styles: { date: Set<number>; time: Set<number> }
): string[][] {
  const grid: string[][] = [];
  const rowRe = /<row\b[^>]*>([\s\S]*?)<\/row>/g;
  let rm: RegExpExecArray | null;
  while ((rm = rowRe.exec(xml))) {
    const cells: string[] = [];
    // Self-closing d'abord pour ne pas avaler les cellules suivantes.
    const cRe = /<c\b([^>]*?)\/>|<c\b([^>]*?)>([\s\S]*?)<\/c>/g;
    let cm: RegExpExecArray | null;
    while ((cm = cRe.exec(rm[1]))) {
      const attrs = cm[1] ?? cm[2] ?? "";
      const inner = cm[3] ?? "";
      const refM = /r="([A-Z]+)\d+"/.exec(attrs);
      const col = refM ? colIndexFromRef(refM[1]) : cells.length;
      const t = /t="([^"]+)"/.exec(attrs)?.[1] ?? "n";
      const sM = /s="(\d+)"/.exec(attrs);
      const sIdx = sM ? Number(sM[1]) : -1;

      let value = "";
      if (t === "s") {
        const vm = /<v>([\s\S]*?)<\/v>/.exec(inner);
        value = vm ? shared[Number(vm[1])] ?? "" : "";
      } else if (t === "inlineStr") {
        let txt = "";
        const tRe = /<t\b[^>]*>([\s\S]*?)<\/t>/g;
        let tt: RegExpExecArray | null;
        while ((tt = tRe.exec(inner))) txt += tt[1];
        value = decodeXml(txt);
      } else if (t === "str") {
        const vm = /<v>([\s\S]*?)<\/v>/.exec(inner);
        value = vm ? decodeXml(vm[1]) : "";
      } else if (t === "b") {
        const vm = /<v>([\s\S]*?)<\/v>/.exec(inner);
        value = vm && vm[1] === "1" ? "TRUE" : "FALSE";
      } else {
        // Nombre (t="n" ou absent) : date/heure si le style le dit.
        const vm = /<v>([\s\S]*?)<\/v>/.exec(inner);
        if (vm) {
          const num = Number(vm[1]);
          if (Number.isFinite(num) && sIdx >= 0 && styles.date.has(sIdx)) value = excelSerialToISO(num);
          else if (Number.isFinite(num) && sIdx >= 0 && styles.time.has(sIdx)) value = excelSerialToTime(num);
          else value = vm[1];
        }
      }

      while (cells.length < col) cells.push("");
      cells[col] = value;
    }
    grid.push(cells);
  }
  return grid;
}

/** Décompresse un .xlsx et renvoie sa première feuille sous forme de grille. */
export function parseXlsxToGrid(bytes: Uint8Array): { headers: string[]; rows: string[][] } {
  const files = unzipSync(bytes);
  const text = (name: string) => (files[name] ? strFromU8(files[name]) : "");
  const shared = parseSharedStrings(text("xl/sharedStrings.xml"));
  const styles = parseStyles(text("xl/styles.xml"));
  const sheet = pickFirstSheetName(files);
  if (!sheet) return { headers: [], rows: [] };
  const grid = parseSheet(text(sheet), shared, styles);
  const headers = (grid[0] ?? []).map((h) => h.trim());
  const rows = grid.slice(1).filter((r) => r.some((c) => c && c.trim() !== ""));
  return { headers, rows };
}
