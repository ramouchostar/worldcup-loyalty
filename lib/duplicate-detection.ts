import {
  contentFingerprint,
  looksLikeSameOrderNumber,
  normalizeFingerprintLine,
  canonicalAmount,
  type Fingerprint,
  type FingerprintLine,
} from "./receipt-fingerprint";
import { hammingDistanceHex } from "./image-phash";

// ============================================================
// Décision de doublon — phase C du chantier d'activation.
//
// Objectif : un même ticket physique ne peut être crédité qu'UNE fois, même
// si l'OCR lit mal son numéro, SANS rejeter deux commandes légitimes qui se
// ressemblent (deux clients qui commandent la même chose le même midi).
//
// Quatre signaux, du plus fort au plus faible :
//   1. empreinte de contenu (resto + montant + lignes) + heure à ±2 min ;
//   2. numéro de commande, en signal SECONDAIRE, tolérant aux confusions OCR ;
//   3. hachage perceptuel de la photo, pour un même membre en moins de 24 h ;
//   4. même membre, même heure, même montant en moins de 24 h.
//
// Ce qui n'est pas certain n'est jamais rejeté : ça part en file « à vérifier »
// (`review`), où un humain voit les deux tickets côte à côte. C'est la
// différence entre protéger le budget et punir un client.
//
// Fonction pure, sans I/O : l'appelant fournit les commandes à comparer.
// Testable — lib/duplicate-detection.test.ts.
// ============================================================

/** Tolérance sur l'heure imprimée du ticket, en minutes (cible : ±2). */
export const TIME_TOLERANCE_MINUTES = 2;

/** Fenêtre des règles « même membre » (signaux 3 et 4), en heures. */
export const SAME_USER_WINDOW_HOURS = 24;

/**
 * Distance de Hamming (sur 64 bits) en dessous de laquelle deux photos sont
 * tenues pour la même prise de vue. 8/64 est conservateur : deux photos d'un
 * même ticket sous des angles différents restent typiquement sous 12, deux
 * tickets différents dépassent largement 20.
 */
export const PHASH_DUPLICATE_MAX = 8;
/** Au-delà de `PHASH_DUPLICATE_MAX` et jusqu'ici : suspect, pas certain. */
export const PHASH_REVIEW_MAX = 14;

/** Part de lignes communes au-dessus de laquelle deux tickets sont « proches ». */
export const NEAR_LINE_OVERLAP = 0.5;

export type DuplicateRule =
  | "same_order_number"
  | "fingerprint_time"
  | "fingerprint_same_day"
  | "fingerprint_number_confusion"
  | "same_user_time_amount"
  | "image_phash"
  | "cross_user_fingerprint"
  | "near_fingerprint"
  | "image_phash_far";

export type DuplicateDecision = "ok" | "duplicate" | "review";

export type DuplicateVerdict = {
  decision: DuplicateDecision;
  /** Règle qui a tranché — `null` seulement pour `ok`. */
  rule: DuplicateRule | null;
  /** Commande déjà en base à laquelle la soumission se rapporte. */
  matchedOrderId: string | null;
  /** Phrase interne (file admin, rapport d'audit) — jamais montrée au membre. */
  detail: string;
};

/** Une commande déjà en base, candidate au rapprochement. */
export type CandidateOrder = {
  id: string;
  user_id: string;
  /** YYYY-MM-DD */
  order_date: string;
  /** HH:MM ou HH:MM:SS, `null` si l'OCR ne l'a pas lue. */
  order_time: string | null;
  amount: number;
  order_number: string | null;
  /** Empreinte de contenu stockée à la soumission, `null` pour l'historique. */
  content_fingerprint: string | null;
  /** Hachage perceptuel de la photo, `null` si absent. */
  image_phash: string | null;
  /** ISO — sert les fenêtres « moins de 24 h ». */
  submitted_at: string;
  /**
   * Lignes du ticket, si l'appelant les a chargées. Sans elles, la règle
   * « empreinte proche » ne peut pas se prononcer (elle est alors sautée,
   * jamais devinée).
   */
  items?: FingerprintLine[];
};

/** Le ticket en cours de soumission. */
export type SubmissionUnderTest = {
  userId: string;
  orderDate: string;
  orderTime: string | null;
  amount: number;
  orderNumber: string | null;
  fingerprint: Fingerprint;
  imagePhash: string | null;
  /** ISO. Par défaut : maintenant. */
  submittedAt: string;
  items?: FingerprintLine[];
};

// ── Outils de temps ─────────────────────────────────────────────────────────

/**
 * Instant d'un ticket à partir de sa date et de son heure imprimées.
 * `null` si l'une des deux manque ou n'est pas lisible — auquel cas les règles
 * qui dépendent de l'heure se taisent au lieu de deviner.
 */
export function ticketMoment(date: string | null, time: string | null): Date | null {
  if (!date || !time) return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return null;
  const m = /^([01]\d|2[0-3]):([0-5]\d)(?::([0-5]\d))?$/.exec(time.trim());
  if (!m) return null;
  const d = new Date(`${date}T${m[1]}:${m[2]}:${m[3] ?? "00"}Z`);
  return Number.isNaN(d.getTime()) ? null : d;
}

/**
 * Minutes entre deux tickets, `null` si l'un des deux instants est inconnu.
 * Passe par des instants complets (date + heure) : un ticket à 23:59 et un à
 * 00:01 le lendemain sont bien à 2 minutes l'un de l'autre.
 */
export function minutesApart(
  aDate: string | null,
  aTime: string | null,
  bDate: string | null,
  bTime: string | null
): number | null {
  const a = ticketMoment(aDate, aTime);
  const b = ticketMoment(bDate, bTime);
  if (!a || !b) return null;
  return Math.abs(a.getTime() - b.getTime()) / 60_000;
}

function hoursBetweenIso(a: string, b: string): number | null {
  const ta = new Date(a).getTime();
  const tb = new Date(b).getTime();
  if (Number.isNaN(ta) || Number.isNaN(tb)) return null;
  return Math.abs(ta - tb) / 3_600_000;
}

// ── Proximité de contenu ────────────────────────────────────────────────────

function normalizedLineSet(items: FingerprintLine[] | undefined): Set<string> | null {
  if (!items || items.length === 0) return null;
  const set = new Set<string>();
  for (const line of items) {
    const n = normalizeFingerprintLine(line);
    if (n) set.add(n);
  }
  return set.size > 0 ? set : null;
}

/** Indice de Jaccard entre deux jeux de lignes, `null` si l'un manque. */
export function lineOverlap(
  a: FingerprintLine[] | undefined,
  b: FingerprintLine[] | undefined
): number | null {
  const sa = normalizedLineSet(a);
  const sb = normalizedLineSet(b);
  if (!sa || !sb) return null;
  let common = 0;
  for (const v of sa) if (sb.has(v)) common++;
  const union = sa.size + sb.size - common;
  return union === 0 ? null : common / union;
}

// ── Le moteur ───────────────────────────────────────────────────────────────

const RANK: Record<DuplicateDecision, number> = { ok: 0, review: 1, duplicate: 2 };

/**
 * Confronte une soumission aux commandes déjà en base.
 *
 * `candidates` doit contenir les commandes du même établissement susceptibles
 * de matcher — en pratique celles de la même journée et des 24 dernières
 * heures. Le verdict le plus sévère l'emporte : un `duplicate` prime sur un
 * `review`, qui prime sur `ok`.
 */
export function detectDuplicate(
  submission: SubmissionUnderTest,
  candidates: CandidateOrder[]
): DuplicateVerdict {
  let best: DuplicateVerdict = { decision: "ok", rule: null, matchedOrderId: null, detail: "" };

  for (const candidate of candidates) {
    const verdict = compareOne(submission, candidate);
    if (RANK[verdict.decision] > RANK[best.decision]) best = verdict;
    // Rien de plus sévère qu'un doublon certain : inutile de continuer.
    if (best.decision === "duplicate") break;
  }
  return best;
}

function compareOne(s: SubmissionUnderTest, c: CandidateOrder): DuplicateVerdict {
  const none: DuplicateVerdict = { decision: "ok", rule: null, matchedOrderId: null, detail: "" };
  const hit = (
    decision: Exclude<DuplicateDecision, "ok">,
    rule: DuplicateRule,
    detail: string
  ): DuplicateVerdict => ({ decision, rule, matchedOrderId: c.id, detail });

  const sameUser = s.userId === c.user_id;
  const deltaMin = minutesApart(s.orderDate, s.orderTime, c.order_date, c.order_time);
  const withinTolerance = deltaMin !== null && deltaMin <= TIME_TOLERANCE_MINUTES;
  const hoursSince = hoursBetweenIso(s.submittedAt, c.submitted_at);
  const withinDay = hoursSince !== null && hoursSince <= SAME_USER_WINDOW_HOURS;
  const sameAmount = canonicalAmount(s.amount) === canonicalAmount(c.amount);
  const sameFingerprint =
    !!c.content_fingerprint && c.content_fingerprint === s.fingerprint.hash;

  // ── 1. Numéro de commande identique ───────────────────────────────────────
  // Le filet historique (index UNIQUE sur duplicate_key, ADR 0008/0019). Repris
  // ici pour que la pré-vérification et le rapport d'audit parlent d'une seule
  // voix avec la contrainte de base.
  if (s.orderNumber && c.order_number && s.orderNumber.trim() === c.order_number.trim()) {
    return hit("duplicate", "same_order_number", `numéro identique (${c.order_number})`);
  }

  // ── 2. Empreinte de contenu + heure à ±2 min ──────────────────────────────
  if (sameFingerprint && !s.fingerprint.weak) {
    if (sameUser && withinTolerance) {
      return hit(
        "duplicate",
        "fingerprint_time",
        `même contenu et même heure à ${deltaMin!.toFixed(0)} min près, même membre`
      );
    }

    // 2b. Numéro qui ne diffère QUE par des confusions de lecture : l'empreinte
    // correspond déjà, le numéro lève le dernier doute (cible §2).
    if (sameUser && looksLikeSameOrderNumber(s.orderNumber, c.order_number)) {
      return hit(
        "duplicate",
        "fingerprint_number_confusion",
        `même contenu ; n° ${s.orderNumber} vs ${c.order_number} — écart explicable par une confusion OCR`
      );
    }

    // 2c. Heure absente des deux côtés (l'OCR ne l'a pas lue) : même membre,
    // même jour, même contenu, moins de 24 h — c'est le même ticket.
    if (sameUser && deltaMin === null && s.orderDate === c.order_date && withinDay) {
      return hit(
        "duplicate",
        "fingerprint_same_day",
        "même contenu, même jour, même membre — heure non lue sur le ticket"
      );
    }

    // 2d. Membres différents : deux clients PEUVENT commander la même chose à
    // la même minute. Jamais un rejet automatique — un humain tranche (cible §5).
    if (!sameUser && withinTolerance) {
      return hit(
        "review",
        "cross_user_fingerprint",
        `contenu identique à ${deltaMin!.toFixed(0)} min près, mais deux membres différents`
      );
    }
  }

  // ── 4. Même membre, même heure, même montant, moins de 24 h ───────────────
  // Vaut « quel que soit le reste » (cible §4) : c'est le filet qui attrape les
  // tickets dont l'OCR n'a lu aucune ligne d'article.
  if (sameUser && sameAmount && withinTolerance && withinDay) {
    return hit(
      "duplicate",
      "same_user_time_amount",
      `même membre, même montant (${canonicalAmount(s.amount)} €), même heure à ${deltaMin!.toFixed(0)} min près`
    );
  }

  // ── 3. Signal image ───────────────────────────────────────────────────────
  if (sameUser && withinDay && s.imagePhash && c.image_phash) {
    const distance = hammingDistanceHex(s.imagePhash, c.image_phash);
    if (distance !== null && distance <= PHASH_DUPLICATE_MAX) {
      return hit("duplicate", "image_phash", `photos quasi identiques (distance ${distance}/64), même membre`);
    }
    if (distance !== null && distance <= PHASH_REVIEW_MAX) {
      return hit("review", "image_phash_far", `photos ressemblantes (distance ${distance}/64), même membre`);
    }
  }

  // ── 5. Empreinte proche mais non identique ────────────────────────────────
  // Une ligne lue d'un côté et pas de l'autre suffit à casser le hachage. Si le
  // montant et l'heure coïncident et que la moitié des lignes se recoupent,
  // c'est trop suspect pour créditer et trop incertain pour rejeter.
  if (!sameFingerprint && sameAmount && withinTolerance) {
    const overlap = lineOverlap(s.items, c.items);
    if (overlap !== null && overlap >= NEAR_LINE_OVERLAP) {
      return hit(
        "review",
        "near_fingerprint",
        `même montant et même heure, ${Math.round(overlap * 100)} % de lignes communes — lecture partielle probable`
      );
    }
  }

  return none;
}

/**
 * Le message rendu au membre. Volontairement unique et sans détail technique
 * (cible §6) : la mécanique anti-fraude ne s'explique pas (ADR 0008/0019).
 */
export const DUPLICATE_MEMBER_MESSAGE = "Ce ticket a déjà été utilisé.";

/** Raccourci de construction depuis une lecture OCR. */
export function fingerprintFromReading(
  restaurantId: string,
  amount: number,
  items: FingerprintLine[]
): Fingerprint {
  return contentFingerprint({ restaurantId, amount, items });
}
