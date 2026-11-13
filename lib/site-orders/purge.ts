// ADR 0099 §7 — la purge du prénom et du téléphone des commandes du site. Le restaurant est responsable du traitement,
// Boosteats son sous-traitant : ces données ne servent qu'à appeler le client pour retirer sa commande, pas à le
// connaître. Au-delà de quelques semaines elles sont EFFACÉES ; la commande elle-même (plats, prix, numéro) reste, c'est
// une vente du restaurateur et non une donnée du client.
//
// Durée : 30 jours par défaut, réglable par SITE_ORDER_PURGE_DAYS entre 7 et 365. C'est un défaut de produit, pas une
// décision juridique : à faire confirmer avec les conditions (ADR 0099, Conséquences). Logique PURE et testée ; l'accès à
// la base est derrière une interface, comme `service.ts`.

export const PURGE_DAYS_DEFAULT = 30;
export const PURGE_DAYS_MIN = 7;
export const PURGE_DAYS_MAX = 365;
/** Ce qui remplace le prénom effacé (la colonne est obligatoire : 1 à 24 lettres). */
export const ERASED_NAME = "—";

/** La durée de conservation, en jours entiers. Une valeur absente ou illisible donne le défaut ; une valeur hors bornes est ramenée aux bornes. */
export function purgeDays(raw: string | undefined = process.env.SITE_ORDER_PURGE_DAYS): { days: number; fromEnv: boolean; invalid: boolean } {
  const t = (raw ?? "").trim();
  if (t === "") return { days: PURGE_DAYS_DEFAULT, fromEnv: false, invalid: false };
  const n = Number(t);
  if (!Number.isInteger(n)) return { days: PURGE_DAYS_DEFAULT, fromEnv: false, invalid: true };
  return { days: Math.min(PURGE_DAYS_MAX, Math.max(PURGE_DAYS_MIN, n)), fromEnv: true, invalid: false };
}

/** Les commandes créées avant cet instant n'ont plus droit à leur prénom ni à leur téléphone. */
export const purgeCutoff = (now: Date, days: number): string => new Date(now.getTime() - days * 24 * 3600 * 1000).toISOString();

export interface PurgeDb {
  /** Combien de commandes d'avant `cutoff` portent encore un prénom ou un téléphone. `null` = les tables n'existent pas encore. */
  count(cutoffIso: string): Promise<number | null>;
  /** Efface prénom et téléphone de ces commandes ; renvoie combien. `null` = les tables n'existent pas encore. */
  erase(cutoffIso: string): Promise<number | null>;
}

export type PurgeReport = {
  ok: true;
  dryRun: boolean;
  days: number;
  /** « SITE_ORDER_PURGE_DAYS » est présent mais illisible : on a pris le défaut, et on le dit. */
  invalidSetting: boolean;
  cutoff: string;
  /** Commandes concernées (comptées avant l'effacement). */
  candidates: number;
  /** Commandes effectivement effacées (0 en essai à blanc). */
  erased: number;
  /** Les tables n'existent pas encore : rien à purger, dit clairement. */
  unavailable: boolean;
};

/**
 * Efface les données de contact des commandes plus vieilles que la durée de conservation. `dryRun` compte sans rien effacer
 * (vérifier avant de croire). Une panne remonte : le cron échoue et Vercel le montre, jamais d'échec silencieux.
 */
export async function runPurge(db: PurgeDb, now: Date = new Date(), rawDays?: string, dryRun = false): Promise<PurgeReport> {
  const { days, invalid } = purgeDays(rawDays);
  const cutoff = purgeCutoff(now, days);
  const candidates = await db.count(cutoff);
  if (candidates === null) return { ok: true, dryRun, days, invalidSetting: invalid, cutoff, candidates: 0, erased: 0, unavailable: true };
  if (dryRun || candidates === 0) return { ok: true, dryRun, days, invalidSetting: invalid, cutoff, candidates, erased: 0, unavailable: false };
  const erased = await db.erase(cutoff);
  return { ok: true, dryRun, days, invalidSetting: invalid, cutoff, candidates, erased: erased ?? 0, unavailable: erased === null };
}
