import type { Plan } from "../entitlements";

// Le contrat de la brigade (ADR 0089). Édité par Mehdi seul : chaque assistant
// (lib/agents/<prénom>.ts) produit des `Idea`, la couche lib/agents/proposals.ts
// (Brigade 02) les enregistre dans `agent_proposals`, l'écran « Idées du jour »
// (Brigade 03) les montre au gérant, et un exécuteur joue le geste sur « Oui ».
//
// Aucun accès base ici : des types et des constantes, importables partout
// (composants client compris).

// ─── Les assistants ───────────────────────────────────────────────────────────

export type AssistantId = "nina" | "lea" | "hugo" | "emma" | "max" | "louis" | "chloe";

export type Assistant = {
  id: AssistantId;
  name: string; // le prénom affiché sur la carte
  post: string; // son poste, en quelques mots (glossaire CONTEXT.md)
  /** Forfait à partir duquel il travaille pour l'établissement (maquette du 2026-11-04, ADR 0070). */
  plan: Plan;
};

export const ASSISTANTS: Record<AssistantId, Assistant> = {
  lea: { id: "lea", name: "Léa", post: "Inscrit les clients et gère les cadeaux", plan: "gratuit" },
  hugo: { id: "hugo", name: "Hugo", post: "Relance les clients", plan: "gratuit" },
  chloe: { id: "chloe", name: "Chloé", post: "Suit les chiffres", plan: "gratuit" },
  emma: { id: "emma", name: "Emma", post: "S'occupe de la pub dans le quartier", plan: "gratuit" },
  louis: { id: "louis", name: "Louis", post: "Répond aux avis Google", plan: "croissance" },
  nina: { id: "nina", name: "Nina", post: "Crée le site qui fait commander", plan: "pro" },
  max: { id: "max", name: "Max", post: "Fait trouver l'établissement sur Google", plan: "pro" },
};

/**
 * Types d'idée qui demandent un forfait AU-DESSUS de celui de leur assistant.
 * Chloé suit le chiffre du jour en Gratuit, mais les ventes plat par plat sont
 * l'analytique de Croissance (ADR 0070 §2) ; la promo qu'elle passe à Hugo suit.
 */
export const IDEA_TYPE_PLAN: Partial<Record<string, Plan>> = {
  jour_creux_promo: "croissance",
  plat_a_mettre_en_avant: "croissance",
  promo_a_annoncer: "croissance",
};

// ─── L'idée ───────────────────────────────────────────────────────────────────

/** Les trois lignes de la carte : quoi, pour qui, combien. En euros côté gérant ; jamais côté membre (ADR 0007). */
export type IdeaLines = { what: string; who: string; cost: string };

/** Une fourchette, jamais un chiffre seul ; `basis` dit d'où elle vient. `null` sur l'idée = rien d'honnête à chiffrer. */
export type IdeaEstimate = { low: number; high: number; unit: string; basis: string };

/** Les chiffres qui ont produit l'idée (la trace, ADR 0065) : c'est ce qui permet de recalibrer les seuils. */
export type IdeaEvidence = Record<string, number | string | string[]>;

/**
 * Le geste joué sur « Oui ». Un exécuteur appelle TOUJOURS un chemin qui existe
 * déjà (route, action, écran) : la brigade ne crée pas de second chemin.
 */
export type IdeaAction =
  /** Ouvre un écran existant (le gérant finit le geste lui-même). */
  | { kind: "open"; path: string; label: string }
  /** Appelle une route existante de la console, avec la session du gérant. */
  | { kind: "call"; method: "POST" | "PATCH"; path: string; body: Record<string, string | number | boolean | null>; label: string }
  /** Passe le relais à un autre assistant, qui en fait sa propre idée (Chloé → Hugo, Max → Louis). */
  | { kind: "relay"; to: AssistantId; label: string }
  /** Hugo : message aux membres choisis, consentement et témoin de 10 % (ADR 0039, 0063). */
  | { kind: "send_to_members"; campaign: string; message: string; label: string }
  /** Hugo : annonce programmée (lib/broadcast.ts), la veille de la promo (ADR 0023). */
  | { kind: "schedule_broadcast"; message: string; sendOn: string; promoOn: string | null; label: string }
  /** Emma : crée la demande de pub existante ; le virement et la validation de Mehdi restent derrière (ADR 0086). */
  | { kind: "create_ad_request"; label: string }
  /** Max : une modification de la fiche Google, par l'API (fiche gérée, ADR 0082) ou par l'équipe. */
  | { kind: "update_fiche"; finding: string; via: "api" | "equipe"; needsInput: string; label: string }
  /** Préparée par l'équipe (Brigade 04) : sur « Oui », l'équipe fait le travail et le note sur /platform. */
  | { kind: "team"; note: string; label: string };

export type IdeaActionKind = IdeaAction["kind"];

/**
 * Ce que tout assistant renvoie. Un module peut porter d'autres champs (ex. la
 * `proposal` et la `creative` d'Emma, le `relay` de Chloé) : ils sont conservés
 * tels quels dans `agent_proposals.content` et relus par son exécuteur.
 */
export type Idea = {
  assistant: AssistantId;
  type: string; // snake_case, stable : il sert aux mesures et à l'anti-doublon
  title: string; // ce qui se passe (« Le jeudi est ton jour le plus calme »)
  question: string; // ce que l'assistant demande (« Je demande à Hugo une promo ? »)
  lines: IdeaLines;
  estimate: IdeaEstimate | null;
  decideBy: string; // ISO (jour ou instant) : au-delà, l'idée expire sans rien faire
  action: IdeaAction;
  evidence: IdeaEvidence;
};

// ─── Sa vie en base (agent_proposals, Brigade 02) ─────────────────────────────

/**
 * proposee → acceptee → executee
 *          ↘ refusee   ↘ (échec d'exécution : reste « acceptee » avec son erreur, visible)
 *          ↘ expiree
 * ecartee : produite mais jamais montrée (plafond du jour, doublon). Comptée sur /platform.
 */
export type IdeaStatus = "proposee" | "acceptee" | "refusee" | "expiree" | "executee" | "ecartee";

/** Qui a préparé l'idée : un générateur, ou l'équipe à la main depuis /platform (Brigade 04). */
export type IdeaOrigin = "systeme" | "equipe";

/** Le refus en un geste : une raison au choix, jamais un texte obligatoire. */
export type RefusalReason = "pas_le_moment" | "trop_cher" | "pas_pour_moi" | "deja_fait" | "autre";

export const REFUSAL_REASON_LABELS: Record<RefusalReason, string> = {
  pas_le_moment: "Pas le moment",
  trop_cher: "Trop cher",
  pas_pour_moi: "Pas pour mon établissement",
  deja_fait: "Déjà fait",
  autre: "Autre raison",
};

/** Pourquoi une idée produite n'a pas été montrée. */
export type DiscardReason = "plafond_du_jour" | "deja_proposee" | "refusee_recemment" | "forfait";

/** Au plus trois idées montrées par jour et par établissement : « 5 minutes par jour, pas plus ». */
export const DAILY_IDEA_CAP = 3;

/** Une idée refusée ne revient pas avant ce délai (même assistant, même type, même objet). */
export const REFUSAL_COOLDOWN_DAYS = 14;
