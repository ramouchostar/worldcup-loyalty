import type { AssistantId, Idea } from "./types";

// La barre de la brigade (ADR 0105) : cinq conditions qu'une idée produite par un générateur doit
// passer avant d'être montrée au gérant. Le but est qu'on soit sûr à 80 % au moins qu'une idée
// montrée profite à l'établissement. Ce chiffre ne se décrète pas : on l'approche AVANT par des
// conditions vérifiables, puis on le MESURE après (condition 5).
//
//   1. fiche_de_jeu : le type a une fiche de jeu écrite ici (mécanisme, source, mesure), et elle
//      est active. Un type sans fiche, ou retiré, ne se montre pas. Une tâche (« note ton CA »,
//      « des tickets attendent ») n'est pas une idée : elle a sa place dans « À faire ».
//   2. caisse : un constat sur le restaurant entier se lit sur la caisse (Belpeople, CA du jour),
//      jamais sur les seuls tickets du programme (1,2 % des tickets de caisse au 2026-11-15).
//   3. audience : un message aux membres touche au moins `minAudience` clients joignables.
//   4. rentable : une idée qui coûte de l'argent rapporte plus que ce qu'elle coûte, dans le cas bas.
//   5. mesure : un type qui a réussi moins de 8 fois sur 10 sur le réseau (au moins 10 résultats)
//      se met en pause, pour tous les établissements.
//
// Tout est pur et testé. La raison d'un écart part dans `agent_proposals.content.barre` : rien ne
// disparaît en silence (ADR 0065), /platform/brigade et /platform/idees la montrent.
//
// La barre ne juge que les idées des générateurs (`origin = 'systeme'`). Une idée écrite à la main
// par l'équipe (/platform/idees) est jugée par l'équipe.

export type BarCondition = "fiche_de_jeu" | "tache" | "caisse" | "audience" | "rentable" | "mesure";

/** Par où l'idée atteint des clients. Seul « membres » demande une audience minimale. */
export type Channel = "membres" | "quartier" | "google" | "plateforme" | "comptoir" | "gerant";

export type Play = {
  assistant: AssistantId;
  type: string;
  /** `tache` : un geste de gestion, déjà dans « À faire » ; jamais montré comme idée. */
  status: "active" | "retiree" | "tache";
  channel: Channel;
  /** Ce qui produit le gain, en une phrase. */
  mechanism: string;
  /** Pourquoi on y croit : guide officiel, résultat mesuré chez nous, étude. */
  source: string;
  /** Le chiffre qui dira si ça a marché (condition 5). */
  measure: string;
  /** Condition 2 : le constat doit venir de la caisse (`evidence.source === "caisse"`). */
  needsTill: boolean;
  /** Condition 3 : clé de `evidence` qui donne le nombre de clients joignables, et le minimum. */
  audience?: { key: string; min: number };
  /** Condition 4 : l'idée coûte de l'argent ; `evidence.gainLowEur` doit couvrir `evidence.costEur`. */
  costsMoney: boolean;
  /** Pour une fiche retirée ou une tâche : pourquoi, en clair. */
  why?: string;
};

/** Au moins 50 clients joignables pour un message aux membres : en dessous, il ne bouge aucun chiffre. */
export const MIN_MEMBER_AUDIENCE = 50;
/** Condition 5 : réussites exigées sur le réseau… */
export const SUCCESS_RATE_MIN = 0.8;
/** … une fois ce nombre de résultats mesurés atteint. Avant, le type est « à l'essai ». */
export const MIN_OUTCOMES = 10;

const TASK_WHY = "C'est une tâche, pas une idée : elle est déjà dans « À faire » de l'accueil.";

/** Les fiches de jeu. Un nouveau type d'idée s'ajoute ICI, avec sa source, ou il ne se montre pas. */
export const PLAYS: Play[] = [
  {
    assistant: "chloe",
    type: "jour_creux_promo",
    status: "active",
    channel: "membres",
    mechanism: "Une remise sur le jour le plus calme remplit des tables vides sans toucher aux jours pleins.",
    source: "Pratique courante en restauration ; à confirmer par nos mesures (tickets du jour contre les 4 mêmes jours d'avant).",
    measure: "Tickets du jour de la promo contre la moyenne des 4 mêmes jours précédents.",
    needsTill: true,
    costsMoney: true,
  },
  {
    assistant: "chloe",
    type: "plat_a_mettre_en_avant",
    status: "retiree",
    channel: "membres",
    mechanism: "Une annonce aux membres sur un plat à forte marge.",
    source: "Aucune mesure maison.",
    measure: "Ventes du plat dans la semaine.",
    needsTill: true,
    costsMoney: false,
    why: "Retirée le 2026-11-15 : jugée sur les tickets du programme seulement, et annoncée à une dizaine de membres joignables.",
  },
  {
    assistant: "chloe",
    type: "ca_du_jour_a_noter",
    status: "tache",
    channel: "gerant",
    mechanism: "Rappel de saisie.",
    source: "ADR 0087.",
    measure: "Jours notés.",
    needsTill: false,
    costsMoney: false,
    why: TASK_WHY,
  },
  {
    assistant: "lea",
    type: "tickets_a_verifier",
    status: "tache",
    channel: "gerant",
    mechanism: "Rappel de validation.",
    source: "ADR 0052.",
    measure: "Délai de validation.",
    needsTill: false,
    costsMoney: false,
    why: TASK_WHY,
  },
  {
    assistant: "lea",
    type: "cadeau_a_ajouter",
    status: "tache",
    channel: "gerant",
    mechanism: "Étoffer le catalogue « Mes points ».",
    source: "ADR 0061, 0068.",
    measure: "Articles au catalogue.",
    needsTill: false,
    costsMoney: false,
    why: "C'est un réglage du programme, pas une idée qui rapporte : il reste à faire depuis la page Menu.",
  },
  {
    assistant: "hugo",
    type: "clients_a_relancer",
    status: "active",
    channel: "membres",
    mechanism: "Un client qui avait l'habitude de venir revient plus souvent quand on le lui rappelle.",
    source: "Mesuré chez nous contre un groupe témoin de 10 % (ADR 0063, `campaignEffect`).",
    measure: "Part des relancés revenus en 14 jours contre les témoins.",
    needsTill: false,
    audience: { key: "reachable", min: MIN_MEMBER_AUDIENCE },
    costsMoney: false,
  },
  {
    assistant: "hugo",
    type: "promo_a_annoncer",
    status: "active",
    channel: "membres",
    mechanism: "Annoncer la promo la veille aux membres qui ont accepté les offres.",
    source: "ADR 0023 ; effet à mesurer avec la promo de Chloé.",
    measure: "Tickets du jour de la promo.",
    needsTill: false,
    audience: { key: "audience", min: MIN_MEMBER_AUDIENCE },
    costsMoney: false,
  },
  {
    assistant: "emma",
    type: "pub_pour_la_promo",
    status: "active",
    channel: "quartier",
    mechanism: "Une pub Visites avec une offre fait venir des gens du quartier le jour calme.",
    source: "Nos campagnes Meta mesurées (`/platform/pub`) et les bons de pub utilisés (ADR 0104).",
    measure: "Bons utilisés et coût de pub par client venu.",
    needsTill: true,
    costsMoney: true,
  },
  {
    assistant: "max",
    type: "fiche_a_completer",
    status: "active",
    channel: "google",
    mechanism: "Une fiche Google complète (horaires, lien de commande, photos) est montrée plus souvent et convertit mieux.",
    source: "Guide officiel Google Business Profile : les fiches complètes sont plus pertinentes pour le classement local.",
    measure: "Appels, itinéraires et clics sur la fiche le mois suivant.",
    needsTill: false,
    costsMoney: false,
  },
  {
    assistant: "max",
    type: "horaires_jours_speciaux",
    status: "active",
    channel: "google",
    mechanism: "Des horaires exceptionnels justes un jour férié évitent le client qui trouve porte close ou croit l'établissement fermé.",
    source: "Guide officiel Google Business Profile : définir des horaires exceptionnels pour les jours fériés et les fêtes.",
    measure: "Horaires posés avant la date (relus par Places dans les 7 jours) ; appels et itinéraires de la fiche ces jours-là.",
    needsTill: false,
    costsMoney: false,
  },
  {
    assistant: "louis",
    type: "reponses_aux_avis",
    status: "active",
    channel: "google",
    mechanism: "Répondre aux avis montre un établissement présent et rassure ceux qui hésitent.",
    source: "Guide officiel Google Business Profile : répondre aux avis est recommandé.",
    measure: "Taux de réponse et note moyenne sur 90 jours.",
    needsTill: false,
    costsMoney: false,
  },
];

const playKey = (assistant: string, type: string) => `${assistant}:${type}`;
const PLAY_INDEX = new Map(PLAYS.map((p) => [playKey(p.assistant, p.type), p]));

export function playFor(idea: Pick<Idea, "assistant" | "type">): Play | null {
  return PLAY_INDEX.get(playKey(idea.assistant, idea.type)) ?? null;
}

/** Le bilan d'un type sur le réseau : résultats mesurés et réussites (condition 5). */
export type TrackRecord = { outcomes: number; successes: number };

export function isPausedByResults(record: TrackRecord | undefined): boolean {
  if (!record || record.outcomes < MIN_OUTCOMES) return false;
  return record.successes / record.outcomes < SUCCESS_RATE_MIN;
}

/** Le résultat d'une idée exécutée, tel qu'une mesure l'écrit dans `agent_proposals.result.outcome`. */
export type Outcome = "reussi" | "rate";

/** Bilan par type (`assistant:type`) à partir des résultats mesurés ; ce qui n'a pas d'issue est ignoré. */
export function trackRecords(rows: { assistant: string; type: string; outcome: string | null }[]): Map<string, TrackRecord> {
  const out = new Map<string, TrackRecord>();
  for (const r of rows) {
    if (r.outcome !== "reussi" && r.outcome !== "rate") continue;
    const k = playKey(r.assistant, r.type);
    const cur = out.get(k) ?? { outcomes: 0, successes: 0 };
    cur.outcomes++;
    if (r.outcome === "reussi") cur.successes++;
    out.set(k, cur);
  }
  return out;
}

export type BarResult = { ok: true } | { ok: false; condition: BarCondition; detail: string };

const num = (v: unknown): number | null => {
  const n = typeof v === "number" ? v : typeof v === "string" && v.trim() !== "" ? Number(v) : NaN;
  return Number.isFinite(n) ? n : null;
};

/**
 * L'idée passe-t-elle la barre ? La première condition ratée est rendue, avec une phrase pour
 * /platform. Sans preuve, pas de passage : une idée qui ne dit pas d'où vient son constat, à qui
 * elle parle ou combien elle rapporte échoue (la barre est fermée par défaut).
 */
export function checkBar(idea: Idea, records: Map<string, TrackRecord> = new Map()): BarResult {
  const play = playFor(idea);
  if (!play) return { ok: false, condition: "fiche_de_jeu", detail: `Aucune fiche de jeu pour « ${idea.type} ».` };
  if (play.status === "tache") return { ok: false, condition: "tache", detail: play.why ?? TASK_WHY };
  if (play.status === "retiree") return { ok: false, condition: "fiche_de_jeu", detail: play.why ?? "Fiche de jeu retirée." };

  const ev = idea.evidence ?? {};
  if (play.needsTill && ev.source !== "caisse") {
    return { ok: false, condition: "caisse", detail: "Constat lu sur les tickets du programme, pas sur la caisse." };
  }
  if (play.audience) {
    const n = num(ev[play.audience.key]);
    if (n === null || n < play.audience.min) {
      return {
        ok: false,
        condition: "audience",
        detail: `${n ?? 0} client${(n ?? 0) > 1 ? "s" : ""} joignable${(n ?? 0) > 1 ? "s" : ""}, il en faut ${play.audience.min}.`,
      };
    }
  }
  if (play.costsMoney) {
    const gain = num(ev.gainLowEur);
    const cost = num(ev.costEur);
    if (gain === null || cost === null) return { ok: false, condition: "rentable", detail: "Gain bas ou coût non chiffré." };
    if (gain < cost) return { ok: false, condition: "rentable", detail: `Gain bas ${Math.round(gain)} € sous le coût ${Math.round(cost)} €.` };
  }
  const record = records.get(playKey(idea.assistant, idea.type));
  if (isPausedByResults(record)) {
    return {
      ok: false,
      condition: "mesure",
      detail: `${record!.successes} réussite${record!.successes > 1 ? "s" : ""} sur ${record!.outcomes} mesurées, il en faut ${Math.round(SUCCESS_RATE_MIN * 100)} %.`,
    };
  }
  return { ok: true };
}

export const BAR_CONDITION_LABELS: Record<BarCondition, string> = {
  fiche_de_jeu: "Pas de fiche de jeu active",
  tache: "Tâche, pas une idée",
  caisse: "Constat pas lu sur la caisse",
  audience: "Trop peu de clients joignables",
  rentable: "Pas rentable dans le cas bas",
  mesure: "Mise en pause par ses résultats",
};
