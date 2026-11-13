import { createAdminClient } from "../supabase";
import { addDays } from "../daily-revenue-model";
import { getAudit, isMissingTable, recentAuditFor } from "../audit/store";
import type { Criterion, FicheScore } from "../audit/fiche-score";
import type { IdeaLines } from "./chloe";

// Max — la place sur Google (Brigade 14, chantier « La brigade »).
//
// Les constats de l'analyse de la fiche Google (ADR 0069 / 0071) deviennent des idées que le gérant
// accepte ou refuse en un geste : « Ta fiche n'a pas de bouton pour commander : je m'en occupe ? ».
// Max lit le DERNIER audit enregistré de l'établissement ; il n'en lance pas (un audit coûte de l'argent
// chez DataForSEO), et il ne regarde que la fiche : la note, le volume d'avis et la place face aux
// voisins ne se règlent pas d'un geste, ils restent dans le rapport.
//
// Exécution (ADR 0082) : sur la fiche gérée par Boosteats quand l'API existera (Brigade 12), sinon par
// l'équipe, qui reçoit la demande. Cette PR ne fait AUCUNE écriture sur Google et n'en simule aucune :
// elle dit seulement quoi proposer, et par quelle voie ce serait fait.
//
// Ce que Max ne fait pas, volontairement :
//   - des idées sur des constats périmés : une fiche se corrige entre deux analyses, proposer d'ajouter
//     ce qui a été ajouté depuis serait pire que se taire. Au-delà de 30 jours, il ne dit rien et le
//     dit (`audit_ancien`) ;
//   - « tes horaires du dimanche manquent » : l'audit sait si la fiche a des horaires, pas si un jour
//     absent est un jour de fermeture. Affirmer un manque par jour, ce serait inventer ;
//   - le rapport mensuel de place sur Google Maps (ADR 0088) : il dépend de la grille DataForSEO et du
//     forfait Pro, pas encore livrés. Il aura sa propre PR.
//
// Un jour sans bonne idée vaut mieux qu'une idée de remplissage : dans tous les autres cas, Max ne dit rien.

// ─── Types provisoires ────────────────────────────────────────────────────────
// Le contrat commun des idées (lib/agents/types.ts) est écrit par Mehdi (Brigade 01). À son arrivée, on
// remplace ces types, pas la logique.

export type MaxFinding = "horaires" | "lien_commande" | "lien_menu" | "photos" | "telephone" | "site" | "description" | "attributs" | "reponses";

export type MaxAction = {
  kind: "update_fiche";
  finding: Exclude<MaxFinding, "reponses">;
  /** `api` : la fiche est gérée par Boosteats (ADR 0082) ; `equipe` : l'équipe le fait à la main. */
  via: "api" | "equipe";
  /** Ce que seul le gérant peut fournir ; la demande ne part pas sans. */
  needsInput: string;
  label: string;
};

export type MaxIdea = {
  assistant: "max";
  type: "fiche_a_completer";
  finding: MaxFinding;
  title: string;
  question: string;
  lines: IdeaLines;
  estimate: null; // un constat de fiche ne promet aucun gain : on ne chiffre pas (ADR 0068, bouclier ADR 0065)
  decideBy: string;
  action: MaxAction;
  evidence: Record<string, number | string>;
};

export type MaxBlock =
  | "pas_de_fiche" // l'établissement n'a pas d'identifiant Google (inscription, ADR 0075)
  | "pas_d_audit" // aucune analyse enregistrée pour cette fiche
  | "audit_illisible" // une analyse existe, mais son volet « fiche » est en échec ou absent
  | "audit_ancien" // la dernière analyse date de plus de 30 jours : ses constats ne sont plus sûrs
  | "rien_a_signaler"; // la fiche est complète sur tout ce qui se règle d'un geste

export type MaxDecision = { ideas: MaxIdea[]; reason: MaxBlock | null; ageDays: number | null };

export const MAX_BLOCK_TEXT: Record<MaxBlock, string> = {
  pas_de_fiche: "Pas de fiche Google reliée à cet établissement.",
  pas_d_audit: "Aucune analyse de la fiche n'a été faite.",
  audit_illisible: "La dernière analyse n'a pas pu lire la fiche.",
  audit_ancien: "La dernière analyse est trop ancienne pour s'y fier : il faut la refaire.",
  rien_a_signaler: "Rien à compléter sur la fiche.",
};

// ─── Réglages ─────────────────────────────────────────────────────────────────

/**
 * Âge maximal de l'analyse dont Max se sert. HYPOTHÈSE : un mois, le rythme du rapport mensuel de
 * l'ADR 0088. Les trois analyses des établissements réels ont six semaines : elles ne servent plus.
 */
export const MAX_AUDIT_AGE_DAYS = 30;
/** Une idée de fiche reste valable une semaine : la fiche ne change pas d'un jour à l'autre. */
export const MAX_DECIDE_DAYS = 7;
/** Idées rendues au plus (le plafond de 3 par jour pour tout le gérant est celui de la brigade). */
export const MAX_IDEAS_LIMIT = 3;

const DAY_MS = 86_400_000;

// ─── Les constats, un par critère de la grille ────────────────────────────────

type Rule = {
  /** Clé du critère dans `scoreFiche`. */
  criterion: string;
  /** Statuts qui déclenchent l'idée : un critère `non_verifie` ne déclenche jamais. */
  on: ReadonlyArray<"manquant" | "partiel">;
  finding: Exclude<MaxFinding, "reponses">;
  title: (c: Criterion) => string;
  what: (c: Criterion) => string;
  needsInput: string;
};

const photoCount = (c: Criterion) => /(\d+)/.exec(c.detail ?? "")?.[1] ?? null;

const RULES: readonly Rule[] = [
  {
    criterion: "horaires", on: ["manquant"], finding: "horaires",
    title: () => "Tes horaires ne sont pas sur ta fiche Google",
    what: () => "Ajouter tes jours et tes heures d'ouverture à ta fiche : sans eux, un client qui te cherche doit deviner si tu es ouvert.",
    needsInput: "tes jours et tes heures d'ouverture",
  },
  {
    criterion: "photos", on: ["manquant", "partiel"], finding: "photos",
    title: (c) => (photoCount(c) ? `Ta fiche Google a peu de photos (${photoCount(c)})` : "Ta fiche Google a peu de photos"),
    what: () => "Ajouter des photos récentes de tes plats et de ta salle à ta fiche : c'est ce que regarde un client avant de venir.",
    needsInput: "des photos récentes de tes plats et de ta salle",
  },
  {
    criterion: "attributs", on: ["manquant", "partiel"], finding: "attributs",
    title: () => "Des informations manquent sur ta fiche Google",
    what: () => "Renseigner ce que ton établissement propose (sur place, à emporter, livraison, accessibilité…) pour que ta fiche réponde aux questions des clients.",
    needsInput: "ce que ton établissement propose",
  },
  {
    criterion: "lien_commande", on: ["manquant"], finding: "lien_commande",
    title: () => "Ta fiche Google n'a pas de bouton pour commander",
    what: () => "Ajouter à ta fiche le lien vers ta page de commande, pour qu'un client puisse commander depuis Google.",
    needsInput: "l'adresse de ta page de commande",
  },
  {
    criterion: "telephone", on: ["manquant"], finding: "telephone",
    title: () => "Ta fiche Google n'a pas de numéro de téléphone",
    what: () => "Ajouter ton numéro à ta fiche, pour qu'un client puisse t'appeler d'un geste.",
    needsInput: "ton numéro de téléphone",
  },
  {
    criterion: "site", on: ["manquant"], finding: "site",
    title: () => "Ta fiche Google n'a pas de site web",
    what: () => "Ajouter l'adresse de ton site à ta fiche, pour que les clients puissent aller plus loin.",
    needsInput: "l'adresse de ton site",
  },
  {
    criterion: "lien_menu", on: ["manquant"], finding: "lien_menu",
    title: () => "Ta fiche Google n'a pas de carte",
    what: () => "Ajouter à ta fiche le lien vers ta carte, pour que les clients voient ce que tu proposes avant de venir.",
    needsInput: "l'adresse de ta carte en ligne",
  },
  {
    criterion: "description", on: ["manquant", "partiel"], finding: "description",
    title: () => "Ta fiche Google n'a pas de vraie description",
    what: () => "Rédiger une description de ton établissement pour ta fiche, que tu relis avant qu'elle soit publiée.",
    needsInput: "ta relecture de la description",
  },
];

// ─── Les idées (pur, déterministe) ────────────────────────────────────────────

export type MaxInput = {
  restaurantId: string;
  todayISO: string; // jour de Bruxelles
  hasPlace: boolean; // l'établissement a un identifiant Google
  auditAgeDays: number | null; // null : aucune analyse
  auditDate: string | null; // ISO jour de l'analyse
  fiche: FicheScore | null; // le volet « fiche » de l'analyse, s'il a pu être lu
  /** La fiche est gérée par Boosteats (ADR 0082, Brigade 12) : l'exécution passe par l'API. Faux tant qu'elle n'existe pas. */
  ficheManaged: boolean;
};

const statusOf = (fiche: FicheScore, key: string) => fiche.criteria.find((c) => c.key === key);

/** Les idées de Max pour un établissement, ou la raison pour laquelle il n'y en a pas. */
export function maxDecision(input: MaxInput, limit = MAX_IDEAS_LIMIT): MaxDecision {
  const none = (reason: MaxBlock): MaxDecision => ({ ideas: [], reason, ageDays: input.auditAgeDays });
  if (!input.hasPlace) return none("pas_de_fiche");
  if (input.auditAgeDays === null) return none("pas_d_audit");
  if (!input.fiche) return none("audit_illisible");
  if (input.auditAgeDays > MAX_AUDIT_AGE_DAYS) return none("audit_ancien");

  const via = input.ficheManaged ? "api" : "equipe";
  const decideBy = addDays(input.todayISO, MAX_DECIDE_DAYS);
  const trace = (c: Criterion) => ({
    criterion: c.key,
    status: c.status,
    points: c.points,
    ...(c.detail ? { detail: c.detail } : {}),
    auditDate: input.auditDate ?? "",
    auditAgeDays: input.auditAgeDays as number,
  });

  const ranked: { points: number; order: number; idea: MaxIdea }[] = [];
  RULES.forEach((rule, order) => {
    const c = statusOf(input.fiche as FicheScore, rule.criterion);
    if (!c || !(rule.on as readonly string[]).includes(c.status)) return;
    ranked.push({
      points: c.points,
      order,
      idea: {
        assistant: "max",
        type: "fiche_a_completer",
        finding: rule.finding,
        title: rule.title(c),
        question: "Je m'en occupe ?",
        lines: {
          what: rule.what(c),
          who: via === "api" ? `Toi, pour me donner ${rule.needsInput} ; je mets ta fiche à jour.` : `Toi, pour nous donner ${rule.needsInput} ; l'équipe Boosteats met ta fiche à jour.`,
          cost: "0 € : ta fiche reste la tienne, tu peux retirer l'accès de Boosteats à tout moment.",
        },
        estimate: null,
        decideBy,
        action: { kind: "update_fiche", finding: rule.finding, via, needsInput: rule.needsInput, label: "Oui, m'en occuper" },
        evidence: trace(c),
      },
    });
  });

  // Les avis sans réponse ne sont pas un geste de fiche : c'est l'affaire de Louis (Brigade 13), qui écrit les
  // brouillons à partir des avis eux-mêmes. Max ne le signale plus : sa propre carte « Des avis attendent ta réponse »
  // doublait celle de Louis le même matin, sans les brouillons.

  if (ranked.length === 0) return none("rien_a_signaler");
  // Le plus de points d'abord (ce que la grille pèse le plus), puis l'ordre de la grille : toujours le même classement.
  ranked.sort((a, b) => b.points - a.points || a.order - b.order);
  return { ideas: ranked.slice(0, limit).map((r) => r.idea), reason: null, ageDays: input.auditAgeDays };
}

// ─── Lecture en base ──────────────────────────────────────────────────────────

/**
 * Le dernier audit de la fiche de l'établissement et son volet « fiche ». Une table d'audits absente
 * (migration pas appliquée) se lit « pas d'audit » ; toute autre erreur remonte : elle ne se déguise
 * pas en « rien à signaler ».
 */
export async function loadMaxInput(restaurantId: string, todayISO: string, nowMs = Date.now()): Promise<MaxInput> {
  const base = { restaurantId, todayISO, hasPlace: false, auditAgeDays: null, auditDate: null, fiche: null, ficheManaged: false } satisfies MaxInput;

  const { data, error } = await createAdminClient().from("restaurants").select("google_place_id").eq("id", restaurantId).maybeSingle();
  if (error) throw new Error(`restaurants : ${error.message}`);
  const placeId = (data as { google_place_id: string | null } | null)?.google_place_id;
  if (!placeId) return base;

  let audit;
  try {
    audit = await recentAuditFor(placeId, 3650);
  } catch (e) {
    if (isMissingTable(e as { code?: string; message?: string })) return { ...base, hasPlace: true };
    throw e;
  }
  if (!audit) return { ...base, hasPlace: true };

  const ageDays = Math.floor((nowMs - Date.parse(audit.created_at)) / DAY_MS);
  const full = await getAudit(audit.id);
  const section = full?.sections.find((s) => s.section === "fiche");
  const fiche = section && section.status === "ok" && section.result ? (section.result as FicheScore) : null;
  return { ...base, hasPlace: true, auditAgeDays: Math.max(0, ageDays), auditDate: audit.created_at.slice(0, 10), fiche };
}

/** La décision de Max pour un établissement, depuis la base. */
export async function loadMaxDecision(restaurantId: string, todayISO: string, nowMs = Date.now()): Promise<MaxDecision> {
  return maxDecision(await loadMaxInput(restaurantId, todayISO, nowMs));
}
