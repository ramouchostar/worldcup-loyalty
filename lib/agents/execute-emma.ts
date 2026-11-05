import { createAdminClient } from "../supabase";
import { createRequest, getBilling, type Billing, type CreateResult } from "../ads/requests";
import { REQUEST_ISSUE_TEXT } from "../ads/meta-spec";
import { EMMA_BLOCK_TEXT, loadEmmaDecision, type EmmaDecision, type EmmaIdea } from "./emma";

// Emma — l'exécuteur (Brigade 10). Appelé par la Server Action `acceptPubIdea`
// (`app/admin/[restaurantId]/pub/actions.ts`), APRÈS les gardes de la console (membre de CET
// établissement, Pub ouverte pour lui).
//
// Il ne fait rien de neuf : il recalcule l'idée du jour, la transforme en entrée du formulaire de la
// Pub et appelle `createRequest`, la création de demande qui existe déjà. Le virement, la
// communication structurée, l'e-mail de paiement attendu et la validation par Boosteats avant la mise en
// ligne sont donc exactement ceux d'une demande faite à la main (ADR 0086).
//
// Deux choses ne viennent JAMAIS de l'idée, parce qu'elles engagent le gérant lui-même :
//   - les conditions de la Pub (crédit non remboursable, ADR 0086 §4) : `termsAccepted` doit être
//     VRAI, coché par lui. Un « Oui » à une idée n'est pas une acceptation ;
//   - ses coordonnées de facturation : celles déjà enregistrées, ou celles qu'il saisit.

export type EmmaAcceptance = {
  /** Doit valoir exactement `true` : la case des conditions, cochée par le gérant. */
  termsAccepted: unknown;
  /** Facturation saisie à la première demande ; sinon celle déjà enregistrée. */
  billing?: Billing | null;
  /** Une autre création que celle proposée (publication ou fichier), choisie par le gérant. */
  creative?: Record<string, unknown> | null;
};

/** Ce que `createRequest` reçoit : la proposition d'Emma, plus ce que seul le gérant fournit. */
export function requestFromIdea(idea: EmmaIdea, billing: Billing | null, extras: EmmaAcceptance): Record<string, unknown> {
  const p = idea.proposal;
  return {
    objective: p.objective,
    budgetEuros: p.budgetEuros,
    startsOn: p.startsOn,
    endsOn: p.endsOn,
    radiusKm: p.radiusKm,
    adText: p.adText,
    creative: extras.creative ?? idea.creative,
    offer: p.offer,
    billing: billing ?? {},
    termsAccepted: extras.termsAccepted === true,
  };
}

export type EmmaAccepted = { ok: true; requestId: string; warning?: string } | { ok: false; error: string };

export type AcceptDeps = {
  decide: (restaurantId: string, isSuperAdmin: boolean, todayISO: string) => Promise<EmmaDecision>;
  billing: (restaurantId: string) => Promise<Billing | null>;
  create: (restaurantId: string, userId: string, raw: Record<string, unknown>) => Promise<CreateResult>;
  /** Note que la demande vient d'Emma, avec les chiffres qui l'ont produite. `null` = noté, sinon la raison. */
  markOrigin: (requestId: string, evidence: EmmaIdea["evidence"]) => Promise<string | null>;
};

export const defaultAcceptDeps: AcceptDeps = {
  decide: loadEmmaDecision,
  billing: getBilling,
  create: createRequest,
  async markOrigin(requestId, evidence) {
    const { error } = await createAdminClient().from("ad_requests").update({ origin: "emma", origin_evidence: evidence }).eq("id", requestId);
    if (!error) return null;
    console.error("[emma] origine non notée :", error.message);
    return error.message;
  },
};

export async function acceptEmmaIdea(
  args: { restaurantId: string; userId: string; isSuperAdmin: boolean; todayISO: string; extras: EmmaAcceptance },
  deps: AcceptDeps = defaultAcceptDeps
): Promise<EmmaAccepted> {
  // Les conditions d'abord : sans elles, on ne lit rien et on ne crée rien.
  if (args.extras.termsAccepted !== true) return { ok: false, error: REQUEST_ISSUE_TEXT.terms };

  // L'idée est recalculée au moment du « Oui » : ce qui est créé est ce qui est proposé AUJOURD'HUI,
  // pas une copie vieille d'un jour dont la date de départ serait passée.
  const decision = await deps.decide(args.restaurantId, args.isSuperAdmin, args.todayISO);
  if (!decision.idea) return { ok: false, error: `Cette proposition n'est plus d'actualité. ${EMMA_BLOCK_TEXT[decision.reason]}` };

  const billing = args.extras.billing ?? (await deps.billing(args.restaurantId));
  const created = await deps.create(args.restaurantId, args.userId, requestFromIdea(decision.idea, billing, args.extras));
  if (!created.ok) return { ok: false, error: created.error };

  // La demande existe et le virement est attendu : si l'origine ne se note pas, on le DIT, on ne
  // fait pas échouer une demande déjà créée (la page l'affiche, le journal serveur le garde).
  const failed = await deps.markOrigin(created.requestId, decision.idea.evidence);
  return failed === null
    ? { ok: true, requestId: created.requestId }
    : { ok: true, requestId: created.requestId, warning: "La demande est créée, mais son origine (proposée par Emma) n'a pas pu être notée." };
}
