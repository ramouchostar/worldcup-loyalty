import { createHash } from "node:crypto";
import { normalizeItemName } from "./menu-match";

// ============================================================
// Empreinte de ticket — phase C du chantier d'activation.
//
// Le seul verrou anti-doublon jusqu'ici était `orders.duplicate_key`, dérivé
// du numéro de commande lu par l'OCR (ADR 0008/0019). Un chiffre mal lu
// (`…/08228` lu `…/08223`) produit une clé différente, donc DEUX commandes
// validées pour un seul ticket physique — le défaut constaté à Kraainem.
//
// Ce module construit une empreinte du CONTENU du ticket : établissement,
// montant, lignes d'articles normalisées. Elle ne dépend d'aucune lecture de
// numéro, et sert de clé de rapprochement là où le numéro échoue.
//
// L'HEURE N'EST PAS DANS L'EMPREINTE, volontairement : la cible demande une
// tolérance de ±2 minutes, et une tolérance ne se met pas dans un hachage
// (deux valeurs à une minute d'écart donnent deux hachages sans rapport).
// L'heure est donc comparée séparément, par lib/duplicate-detection.ts.
//
// Fonctions pures, sans I/O : testables (lib/receipt-fingerprint.test.ts).
// ============================================================

export type FingerprintLine = {
  name: string;
  quantity: number;
  unit_price: number | null;
};

export type FingerprintInput = {
  restaurantId: string;
  /** Montant retenu pour le ticket, en euros. */
  amount: number;
  /** Lignes lues sur le ticket (ADR 0020). Peut être vide. */
  items: FingerprintLine[];
};

export type Fingerprint = {
  /** SHA-256 tronqué à 32 caractères — assez pour une table de commandes. */
  hash: string;
  /** La chaîne canonique hachée, gardée lisible pour le rapport d'audit. */
  source: string;
  /** Nombre de lignes retenues après normalisation. */
  lineCount: number;
  /**
   * Une empreinte SANS ligne d'article ne vaut que « ce resto, ce montant » —
   * deux clients qui commandent le même menu la partagent. Elle ne doit jamais
   * suffire à déclarer un doublon entre deux membres différents.
   */
  weak: boolean;
};

/** Montant canonique : 2 décimales, point décimal, jamais de -0. */
export function canonicalAmount(amount: number): string {
  const n = Math.round((Number(amount) || 0) * 100) / 100;
  return (n === 0 ? 0 : n).toFixed(2);
}

/** Quantité canonique : entier si entière, sinon 2 décimales (NUMERIC(5,2) en base). */
function canonicalQuantity(quantity: number): string {
  const n = Number(quantity);
  if (!Number.isFinite(n) || n <= 0) return "1";
  return Number.isInteger(n) ? String(n) : n.toFixed(2);
}

/** Prix unitaire canonique, ou `-` s'il n'a pas été lu. */
function canonicalUnitPrice(price: number | null | undefined): string {
  if (price === null || price === undefined) return "-";
  const n = Number(price);
  return Number.isFinite(n) ? canonicalAmount(n) : "-";
}

/**
 * Une ligne d'article, réduite à ce qui identifie le ticket.
 *
 * Le libellé passe par `normalizeItemName` (ADR 0020/0046) — minuscules, sans
 * accents, ponctuation aplatie — pour que « Finest (Burger) » et
 * « FINEST  BURGER » se rapprochent. On ne canonise PAS plus loin
 * (`canonicalizeTicketLabel` tronque au premier « + ») : ici on cherche à
 * distinguer deux tickets, pas à retrouver un article au catalogue — perdre
 * les options d'un menu rendrait deux commandes différentes identiques.
 */
export function normalizeFingerprintLine(line: FingerprintLine): string | null {
  const name = normalizeItemName(String(line?.name ?? ""));
  if (name === "") return null;
  return `${name}#${canonicalQuantity(line.quantity)}@${canonicalUnitPrice(line.unit_price)}`;
}

/**
 * Empreinte de contenu d'un ticket.
 *
 * Les lignes sont TRIÉES avant hachage : deux lectures OCR du même ticket
 * peuvent restituer les lignes dans un ordre différent, et l'ordre d'affichage
 * n'identifie pas le ticket — son contenu, oui.
 */
export function contentFingerprint(input: FingerprintInput): Fingerprint {
  const lines = (input.items ?? [])
    .map(normalizeFingerprintLine)
    .filter((l): l is string => l !== null)
    .sort();

  const source = [
    `r=${input.restaurantId}`,
    `t=${canonicalAmount(input.amount)}`,
    `l=${lines.join("|")}`,
  ].join(";");

  return {
    hash: createHash("sha256").update(source).digest("hex").slice(0, 32),
    source,
    lineCount: lines.length,
    weak: lines.length === 0,
  };
}

// ── Confusions OCR sur le numéro de commande ────────────────────────────────
//
// Le numéro reste un signal SECONDAIRE (la cible le dit) : quand l'empreinte
// de contenu correspond déjà, un numéro qui ne diffère que par des confusions
// de lecture courantes transforme un soupçon en certitude.

/** Paires de chiffres que l'OCR confond régulièrement sur un ticket thermique. */
export const OCR_CONFUSABLE_PAIRS: ReadonlyArray<readonly [string, string]> = [
  ["0", "8"],
  ["1", "7"],
  ["3", "8"],
  ["5", "6"],
  ["6", "8"],
  ["2", "7"],
];

const CONFUSABLE_SET: ReadonlySet<string> = new Set(
  OCR_CONFUSABLE_PAIRS.flatMap(([a, b]) => [`${a}${b}`, `${b}${a}`])
);

/** Ces deux chiffres se confondent-ils à la lecture ? */
export function areConfusableDigits(a: string, b: string): boolean {
  return CONFUSABLE_SET.has(`${a}${b}`);
}

/**
 * Nombre de substitutions confusables entre deux numéros de commande.
 *
 * Retourne `null` dès que l'écart n'est PAS explicable par la seule lecture :
 * longueurs différentes, caractère non numérique différent, ou chiffres
 * différents hors des paires connues. `0` signifie « numéros identiques ».
 *
 * Volontairement strict sur la longueur : un numéro plus court est un numéro
 * tronqué, pas un numéro mal lu — et un tronquage peut désigner un autre
 * ticket.
 */
export function ocrConfusionDistance(a: string | null, b: string | null): number | null {
  if (!a || !b) return null;
  const x = a.trim();
  const y = b.trim();
  if (x.length !== y.length) return null;

  let substitutions = 0;
  for (let i = 0; i < x.length; i++) {
    if (x[i] === y[i]) continue;
    if (!/\d/.test(x[i]) || !/\d/.test(y[i])) return null;
    if (!areConfusableDigits(x[i], y[i])) return null;
    substitutions++;
  }
  return substitutions;
}

/**
 * Deux numéros désignent-ils vraisemblablement le même ticket ?
 *
 * `maxSubstitutions` borne le nombre de chiffres mal lus admis : au-delà, on
 * n'a plus une erreur de lecture mais deux numéros distincts qui se ressemblent
 * (les numéros séquentiels d'une même journée sont proches par construction —
 * `…/08228` et `…/08229` ne diffèrent que d'un chiffre, mais 8 et 9 ne sont pas
 * une paire confusable, donc ce cas retourne déjà `null` ci-dessus).
 */
export function looksLikeSameOrderNumber(
  a: string | null,
  b: string | null,
  maxSubstitutions = 2
): boolean {
  const d = ocrConfusionDistance(a, b);
  return d !== null && d <= maxSubstitutions;
}
