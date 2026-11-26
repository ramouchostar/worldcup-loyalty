// ADR 0107 §1 et §5 — le ticket de cuisine tel qu'il sort sur le papier, SANS marque d'imprimante : des lignes avec leur
// taille, leur gras et leur alignement. Chaque adaptateur (Epson aujourd'hui) traduit ces lignes dans son langage. Logique PURE.
//
// Le contenu vient de `buildTickets` (ADR 0100 §9) : ici on ne décide que la mise en page.

import type { Ticket } from "../menu-options/tickets";

/** Colonnes de la police normale. 48 = rouleau de 80 mm, 35 = rouleau de 58 mm (guide Epson TM-m30II) : à vérifier sur place. */
export const COLUMNS_80MM = 48;
export const COLUMNS_58MM = 35;

export type PaperLine = {
  text: string;
  /** 1 = normal, 2 = deux fois plus large / plus haut. */
  width: 1 | 2;
  height: 1 | 2;
  bold: boolean;
  align: "left" | "center";
};

const REPLACEMENTS: readonly [RegExp, string][] = [
  [/œ/g, "oe"], [/Œ/g, "OE"], [/æ/g, "ae"], [/Æ/g, "AE"],
  [/[‘’‚′]/g, "'"], [/[“”„″«»]/g, '"'],
  [/[‐-―−]/g, "-"], [/…/g, "..."], [/[·•]/g, "-"],
  // Espaces insécables et fines, écrites en échappements : en clair, un éditeur les change en espaces ordinaires sans le dire.
  [/[\u00a0\u2007\u2009\u202f]/g, " "],
];

/**
 * Un texte qu'une imprimante thermique sait écrire (ADR 0107 §5) : les accents restent, les signes typographiques sont
 * remplacés, les emojis et les caractères de commande disparaissent. Tableau de repli à confirmer sur la première imprimante.
 */
export function printable(text: string): string {
  let t = text.normalize("NFC");
  for (const [from, to] of REPLACEMENTS) t = t.replace(from, to);
  return t.replace(/[\p{Extended_Pictographic}\u{FE0F}\u{200D}]/gu, "").replace(/[\u0000-\u001f\u007f-\u009f]/g, " ").replace(/ {2,}/g, " ").trim();
}

/** Coupe aux espaces ; un mot plus long que la ligne est coupé net plutôt que perdu. `indent` décale les lignes suivantes. */
export function wrap(text: string, columns: number, indent = 0): string[] {
  const out: string[] = [];
  const pad = " ".repeat(Math.min(indent, Math.max(0, columns - 1)));
  let line = "";
  for (const word of text.split(" ").filter(Boolean)) {
    const candidate = line === "" ? `${out.length > 0 ? pad : ""}${word}` : `${line} ${word}`;
    if (candidate.length <= columns) { line = candidate; continue; }
    if (line !== "") out.push(line);
    let rest = `${out.length > 0 ? pad : ""}${word}`;
    while (rest.length > columns) {
      out.push(rest.slice(0, columns));
      rest = `${pad}${rest.slice(columns)}`;
    }
    line = rest;
  }
  if (line !== "") out.push(line);
  return out;
}

const euros = (cents: number): string => `${(cents / 100).toFixed(2).replace(".", ",")} €`;

/** La mise en page d'un ticket. Le prénom en très grand, les plats en haut, « SANS X » en gras et en haut : lu de loin. */
export function paperLines(ticket: Ticket, columns: number = COLUMNS_80MM): PaperLine[] {
  const out: PaperLine[] = [];
  const add = (text: string, style: Partial<Omit<PaperLine, "text">> = {}, indent = 0) => {
    const full: Omit<PaperLine, "text"> = { width: 1, height: 1, bold: false, align: "left", ...style };
    // Un texte deux fois plus large tient sur deux fois moins de colonnes.
    for (const t of wrap(printable(text), Math.floor(columns / full.width), indent)) out.push({ text: t, ...full });
  };
  // Le retrait de début de ligne est voulu : `printable` rognerait les espaces, on les ajoute après le découpage.
  const addIndented = (text: string, style: Partial<Omit<PaperLine, "text">> = {}) => {
    const full: Omit<PaperLine, "text"> = { width: 1, height: 1, bold: false, align: "left", ...style };
    for (const t of wrap(printable(text), columns - 5, 2)) out.push({ text: `   ${t}`, ...full });
  };
  const rule = () => out.push({ text: "-".repeat(columns), width: 1, height: 1, bold: false, align: "left" });

  add(ticket.title, { bold: true, align: "center" });
  add(ticket.firstName, { width: 2, height: 2, bold: true, align: "center" });
  add(ticket.meta, { align: "center" });
  rule();
  ticket.lines.forEach((l, i) => {
    if (i > 0) out.push({ text: "", width: 1, height: 1, bold: false, align: "left" });
    add(`${l.qty}× ${l.name}`, { height: 2, bold: true }, 3);
    for (const d of l.details) addIndented(d);
    for (const w of l.without) addIndented(w, { height: 2, bold: true });
  });
  if (ticket.totalCents !== null) {
    rule();
    add("À PAYER AU COMPTOIR", { bold: true });
    add(euros(ticket.totalCents), { width: 2, height: 2, bold: true });
  }
  return out;
}

/** Le ticket en texte simple, pour le montrer avant d'avoir une imprimante (les grandes lignes sont écartées pour se voir). */
export function previewText(lines: readonly PaperLine[], columns: number = COLUMNS_80MM): string {
  return lines
    .map((l) => {
      const shown = l.width === 2 ? [...l.text].join(" ") : l.text;
      const left = l.align === "center" ? Math.max(0, Math.floor((columns - shown.length) / 2)) : 0;
      return `${" ".repeat(left)}${shown}`.trimEnd();
    })
    .join("\n");
}
