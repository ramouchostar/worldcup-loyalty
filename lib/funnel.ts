import { createAdminClient } from "./supabase";
import { todayInBrussels } from "./qr-funnel";

// ADR 0037 — les dix étages du parcours ticket, comptés côté serveur.
//
// L'ADR 0037 a réglé le premier étage (`qr_landings`, m60) : un compteur par
// jour, sans IP, sans cookie, sans identifiant — donc mesurable sans
// consentement, là où GA4 ne voit presque rien (Consent Mode v2 refuse tout
// par défaut, ADR 0025). Les neuf étages suivants n'étaient mesurés nulle
// part. Cette table étend le même mécanisme
// (`funnel_events`, migration 20260909-2340).
//
// CE QU'ON NE MESURE PAS, SCIEMMENT : le parcours individuel. Un identifiant
// de session — même en `sessionStorage`, même sans cookie — ferait basculer la
// mesure dans le champ du consentement ePrivacy, soit l'angle mort exact que
// l'ADR 0037 a choisi de sortir. On garde les **taux de passage**, seule chose
// nécessaire pour répondre à « où décroche-t-on ? ». Les parcours individuels
// restent lisibles sur la partie authentifiée (`receipt_scans`, `orders`), où
// la base légale existe.
//
// Comme `qr_landings` : on compte des ÉVÉNEMENTS, pas des personnes. Un
// rechargement compte deux fois, un bot aussi. La vue l'écrit à côté du
// tableau plutôt que de laisser croire à une mesure de personnes.

/** Les étapes, dans l'ordre du parcours réel (ADR 0048/0049). */
export const FUNNEL_STEPS = [
  "qr_landing",
  "ticket_capture_opened",
  "signup_started",
  "signup_completed",
  "ticket_submitted",
  "ticket_validated",
  "ticket_rejected",
  "install_prompt_shown",
  "install_completed",
  "home_viewed",
] as const;

export type FunnelStep = (typeof FUNNEL_STEPS)[number];

/** Motifs de refus d'un ticket — le `reason` de `ticket_rejected`. */
export const REJECTION_REASONS = ["qr_detected", "unreadable", "duplicate", "header_rejected"] as const;
export type RejectionReason = (typeof REJECTION_REASONS)[number];

export const REJECTION_LABELS: Record<RejectionReason, string> = {
  // Émis par le futur verrou « photo de QR / d'affiche » (chantier séparé) :
  // le motif est défini ici pour que la vue le sache lire dès qu'il arrivera.
  qr_detected: "Photo du QR ou de l'affiche",
  unreadable: "Ni clé ni montant lisibles",
  duplicate: "Ticket déjà envoyé",
  header_rejected: "Ticket non reconnu",
};

/**
 * Ce que chaque étage montre, et de quoi son taux de passage est le rapport.
 *
 * `rateFrom` est explicite plutôt que « l'étage du dessus » : le parcours
 * n'est pas une file unique. Un membre déjà inscrit saute les deux étages de
 * compte ; « ticket refusé » et « ticket validé » sont deux sorties du même
 * étage, pas deux étapes successives. Un rapport entre deux étages qui ne se
 * suivent pas serait un chiffre faux mais crédible — le pire des deux.
 */
export const STEP_VIEW: Record<FunnelStep, { label: string; hint: string; rateFrom: FunnelStep | null }> = {
  qr_landing: {
    label: "Arrivée sur la vitrine",
    hint: "Chargements de la page de l'établissement (qr_landings, ADR 0037)",
    rateFrom: null,
  },
  ticket_capture_opened: {
    label: "Photo du ticket prise",
    hint: "Une image a été acceptée et préparée sur l'appareil",
    rateFrom: "qr_landing",
  },
  signup_started: {
    label: "Départ vers l'inscription",
    hint: "Le visiteur quitte l'écran ticket pour Google ou l'e-mail",
    rateFrom: "ticket_capture_opened",
  },
  signup_completed: {
    label: "Compte créé",
    hint: "Adhésion à l'établissement (memberships.joined_at) — fait serveur, pas une déclaration",
    rateFrom: "signup_started",
  },
  ticket_submitted: {
    label: "Ticket envoyé",
    hint: "Le serveur a le ticket (POST /api/orders accepté)",
    rateFrom: "ticket_capture_opened",
  },
  ticket_validated: {
    label: "Ticket validé",
    hint: "Validé à l'envoi ou depuis la file d'arbitrage",
    rateFrom: "ticket_submitted",
  },
  ticket_rejected: {
    label: "Ticket refusé",
    hint: "Refusé, avec son motif — détail sous le tableau",
    rateFrom: "ticket_submitted",
  },
  install_prompt_shown: {
    label: "App proposée",
    hint: "La feuille post-ticket s'est ouverte (ADR 0049)",
    rateFrom: "ticket_submitted",
  },
  install_completed: {
    label: "App installée",
    hint: "L'app s'est ouverte en mode installé (balise ADR 0038)",
    rateFrom: "install_prompt_shown",
  },
  home_viewed: {
    label: "Accueil ouvert",
    hint: "Le dashboard membre a été rendu — pas une sortie d'entonnoir",
    rateFrom: null,
  },
};

/**
 * Les étapes que le NAVIGATEUR peut déclarer (`POST /api/funnel`). Liste
 * close : tout le reste est constaté côté serveur, là où c'est un fait et non
 * une déclaration. Un POST forgé ne peut donc gonfler que des compteurs qui
 * sont déjà, par nature, du même ordre de fiabilité qu'un chargement de page
 * (ADR 0037 §2 : « il compte des chargements de page, pas des personnes »).
 */
export const CLIENT_REPORTABLE_STEPS = [
  "ticket_capture_opened",
  "signup_started",
  "install_prompt_shown",
] as const satisfies readonly FunnelStep[];

export function isClientReportableStep(value: unknown): value is FunnelStep {
  return typeof value === "string" && (CLIENT_REPORTABLE_STEPS as readonly string[]).includes(value);
}

/**
 * Compte un franchissement d'étape.
 *
 * Best-effort, jamais propagé : ni la migration manquante ni une panne
 * Supabase ne doivent casser un parcours client — même règle que
 * `recordLanding` (ADR 0037 §4) et le métering (ADR 0029 §6).
 */
export async function recordFunnelStep(
  restaurantId: string,
  step: FunnelStep,
  reason: RejectionReason | "" = "",
  /** Incrément — une validation en lot franchit l'étage N fois, en un appel. */
  times = 1
): Promise<void> {
  if (times < 1) return;
  try {
    const admin = createAdminClient();
    const { error } = await admin.rpc("record_funnel_event", {
      p_restaurant_id: restaurantId,
      p_day: todayInBrussels(),
      p_step: step,
      p_reason: reason,
      p_times: times,
    });
    if (error) throw error;
  } catch (e) {
    // Migration 20260909-2340 pas encore appliquée / panne : le parcours
    // continue, seul le compteur manque.
    console.error(`[funnel] recordFunnelStep(${step}) failed:`, (e as Error).message);
  }
}

export type StepTotal = {
  step: FunnelStep;
  count: number;
  /** Taux de passage depuis `STEP_VIEW[step].rateFrom`, null si sans objet. */
  rate: number | null;
};

/**
 * Les dix étages et leurs taux de passage, à partir des totaux bruts. Pur et
 * testé : c'est la partie qui peut être fausse sans que rien ne casse — un
 * taux calculé sur le mauvais dénominateur reste un pourcentage crédible.
 *
 * Un étage absent des totaux vaut 0, jamais « pas de données » : il n'y a pas
 * de différence observable entre « personne n'a franchi cette étape » et
 * « l'étape n'a rien écrit », et prétendre le contraire serait une fiction.
 */
export function computeStepTotals(totals: Map<string, number>): StepTotal[] {
  return FUNNEL_STEPS.map((step) => {
    const count = totals.get(step) ?? 0;
    const from = STEP_VIEW[step].rateFrom;
    const base = from ? totals.get(from) ?? 0 : 0;
    // Dénominateur nul → pas de taux du tout. Afficher 0 % laisserait croire
    // à un décrochage total là où il n'y a simplement rien à comparer.
    return { step, count, rate: from && base > 0 ? (count / base) * 100 : null };
  });
}

export type FunnelReport = {
  days: number;
  steps: StepTotal[];
  /** Motifs de refus sur la période, du plus fréquent au moins fréquent. */
  rejections: { reason: string; label: string; count: number }[];
  /** Vrai si la migration manque (ou si rien n'a encore été compté). */
  empty: boolean;
};

/**
 * L'entonnoir agrégé sur `days` jours, pour UN établissement — additionner
 * les étages de plusieurs restaurants ne veut rien dire (ADR 0037 §3).
 *
 * DEUX étages ne sont pas comptés dans `funnel_events`, et c'est voulu : ils
 * sont déjà des faits serveur en base, avec leur historique.
 *   - `qr_landing`      ← `qr_landings` (m60, ADR 0037)
 *   - `signup_completed`← `memberships.joined_at`
 * Les recompter ailleurs perdrait l'antériorité et risquerait un double
 * comptage — et pour `signup_completed`, un compteur déclaré par le
 * navigateur serait justement le plus tentant à gonfler.
 */
export async function getFunnelReport(restaurantId: string, days = 14): Promise<FunnelReport> {
  const admin = createAdminClient();
  const since = new Date(Date.now() - days * 86400_000);
  const sinceDay = since.toISOString().slice(0, 10);

  const [landings, events, memberships] = await Promise.all([
    admin.from("qr_landings").select("count").eq("restaurant_id", restaurantId).gte("day", sinceDay),
    admin.from("funnel_events").select("step, reason, count").eq("restaurant_id", restaurantId).gte("day", sinceDay),
    admin
      .from("memberships")
      .select("user_id", { count: "exact", head: true })
      .eq("restaurant_id", restaurantId)
      .gte("joined_at", since.toISOString()),
  ]);

  const totals = new Map<string, number>();
  const rejections = new Map<string, number>();

  const landingRows = (landings.data as { count: number }[] | null) ?? [];
  if (landingRows.length > 0) {
    totals.set(
      "qr_landing",
      landingRows.reduce((sum, r) => sum + r.count, 0)
    );
  }
  if (memberships.count) totals.set("signup_completed", memberships.count);

  const eventRows = (events.data as { step: string; reason: string; count: number }[] | null) ?? [];
  for (const row of eventRows) {
    totals.set(row.step, (totals.get(row.step) ?? 0) + row.count);
    if (row.step === "ticket_rejected" && row.reason) {
      rejections.set(row.reason, (rejections.get(row.reason) ?? 0) + row.count);
    }
  }

  return {
    days,
    steps: computeStepTotals(totals),
    rejections: [...rejections.entries()]
      .map(([reason, count]) => ({
        reason,
        label: REJECTION_LABELS[reason as RejectionReason] ?? reason,
        count,
      }))
      .sort((a, b) => b.count - a.count),
    // `qr_landing` seul ne suffit pas à dire que l'entonnoir vit : il était
    // déjà compté avant ce chantier.
    empty: eventRows.length === 0,
  };
}
