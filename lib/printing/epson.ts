// ADR 0107 — l'adaptateur Epson : les lignes de papier traduites en « ePOS-Print XML », et l'échange « Server Direct Print »
// (l'imprimante interroge notre serveur, reçoit le ticket, puis dit si elle l'a imprimé). Logique PURE : aucune route, aucune base.
//
// D'après les manuels Epson « ePOS-Print XML » (rév. AF) et « Server Direct Print » (rév. K), lus le 2026-11-26. JAMAIS ESSAYÉ
// sur une imprimante. Le format du ticket est accepté par les TM-m30, m30II et m30III d'après le premier ; l'échange SDP n'existe
// que sur les modèles listés par Epson (ni la TM-m30 ni la TM-m30II sans suffixe).

import type { PaperLine } from "./paper";

const NS = "http://www.epson-pos.com/schemas/2011/03/epos-print";
/** L'identifiant de l'imprimante elle-même dans ses propres réglages (valeur d'usine des exemples Epson). */
export const DEFAULT_DEVICE_ID = "local_printer";
export const PRINT_TIMEOUT_MS = 10_000;
/** Notre règle, plus stricte que nécessaire (les manuels lus ne donnent pas la leur) : lettres et chiffres, 30 au plus. */
const JOB_ID = /^[A-Za-z0-9]{1,30}$/;

const escapeXml = (s: string): string => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&apos;");

/** Un ticket : la langue d'abord (« mul » = UTF-8), chaque ligne avec TOUT son style (rien ne déborde sur la suivante), la coupe à la fin. */
export function eposDocument(lines: readonly PaperLine[]): string {
  const body = lines.map((l) => `<text align="${l.align}" width="${l.width}" height="${l.height}" em="${l.bold}"/><text>${escapeXml(l.text)}&#10;</text>`);
  return [`<epos-print xmlns="${NS}">`, `<text lang="mul"/>`, ...body, `<feed line="3"/>`, `<cut type="feed"/>`, `</epos-print>`].join("");
}

/** Un tirage à remettre à l'imprimante : son numéro (pour la confirmation) et le document `eposDocument`. */
export type EpsonJob = { id: string; document: string };

/**
 * La réponse à une demande d'impression (`ConnectionType=GetRequest`). Version 2.00 : elle porte le numéro du tirage, que
 * l'imprimante renvoie avec le résultat. `null` = rien à imprimer : la route répondra 200 avec un corps VIDE.
 */
export function sdpPrintResponse(jobs: readonly EpsonJob[], deviceId: string = DEFAULT_DEVICE_ID): string | null {
  if (jobs.length === 0) return null;
  const prints = jobs.map((j) => {
    if (!JOB_ID.test(j.id)) throw new Error(`Numéro de tirage invalide : ${j.id}`);
    return `<ePOSPrint><Parameter><devid>${escapeXml(deviceId)}</devid><timeout>${PRINT_TIMEOUT_MS}</timeout><printjobid>${j.id}</printjobid></Parameter><PrintData>${j.document}</PrintData></ePOSPrint>`;
  });
  return `<?xml version="1.0" encoding="utf-8"?><PrintRequestInfo Version="2.00">${prints.join("")}</PrintRequestInfo>`;
}

export type EpsonResult = { jobId: string; printed: boolean; code: string };

const attr = (tag: string, name: string): string | null => new RegExp(`\\s${name}\\s*=\\s*"([^"]*)"`).exec(tag)?.[1] ?? null;

/**
 * Le résultat d'impression (`ConnectionType=SetResponse`, champ `ResponseFile`). Seul `success="true"` vaut « imprimé » :
 * une réponse absente ou illisible n'est JAMAIS lue comme un succès (ADR 0107 §8). Un bloc sans numéro de tirage est ignoré ;
 * la liste vide dit à la route que rien n'a pu être rattaché.
 */
export function parseSdpResult(responseFile: string): EpsonResult[] {
  const out: EpsonResult[] = [];
  for (const [, block] of responseFile.matchAll(/<ePOSPrint>([\s\S]*?)<\/ePOSPrint>/g)) {
    const jobId = /<printjobid>\s*([^<\s]*)\s*<\/printjobid>/.exec(block)?.[1] ?? "";
    if (!JOB_ID.test(jobId)) continue;
    const response = /<response\b[^>]*>/.exec(block)?.[0] ?? "";
    out.push({ jobId, printed: attr(response, "success") === "true", code: (attr(response, "code") ?? "").slice(0, 60) });
  }
  return out;
}

/** Les causes qu'une personne sait régler, dites en clair à la console (codes du manuel ePOS-Print XML). */
const CAUSES: Record<string, string> = {
  EPTR_REC_EMPTY: "Plus de papier",
  EPTR_COVER_OPEN: "Capot ouvert",
  EPTR_CUTTER: "Le couteau est bloqué",
  EPTR_AUTOMATICAL: "L'imprimante se remet d'une erreur",
  EPTR_MECHANICAL: "Erreur mécanique : éteins puis rallume l'imprimante",
  EPTR_UNRECOVERABLE: "L'imprimante est en panne : éteins puis rallume-la",
  EX_TIMEOUT: "L'imprimante a mis trop de temps",
};

/** Un code inconnu est montré tel quel : mieux vaut un code lisible par nous qu'un « tout va bien » inventé. */
export const causeOf = (code: string): string => CAUSES[code] ?? (code ? `Impression refusée (${code})` : "Impression refusée");
