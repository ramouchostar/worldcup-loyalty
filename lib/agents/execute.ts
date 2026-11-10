import { createAdminClient } from "../supabase";
import { getPlan } from "../entitlements";
import { pubAvailability } from "../ads/requests";
import { executeHugoAction } from "./execute-hugo";
import { acceptEmmaIdea } from "./execute-emma";
import { promoAnnouncementIdea, type HugoAction } from "./hugo";
import type { HugoRelay } from "./chloe";
import { markExecuted, markExecutionFailed, recordIdeas, type ProposalRow } from "./proposals";

// Le « Oui » joué (ADR 0089 §2 et §5, Brigade 03). Un seul aiguillage pour tous
// les assistants : selon le geste de l'idée, on appelle le chemin QUI EXISTE
// DÉJÀ (Hugo : la relance et l'annonce programmée ; Emma : la demande de pub ;
// Léa : le catalogue ; un écran à ouvrir) — jamais un second chemin vers un
// envoi, une dépense ou une modification.
//
// Ce module est appelé APRÈS les gardes de la console et APRÈS `decideIdea`
// (l'idée est déjà « acceptée »). Il rend compte dans `agent_proposals` :
//   - réussi        → « exécutée », avec ce qui s'est passé (`result`) ;
//   - pour l'équipe → reste « acceptée » : l'équipe fait le travail et le note
//                     sur /platform (idées préparées à la main, fiche Google
//                     sans API, relais vers un assistant pas encore là) ;
//   - échoué        → reste « acceptée » avec son erreur, visible du gérant et
//                     de /platform. Jamais un « Oui » perdu en silence.

export type ExecContext = {
  userId: string;
  isSuperAdmin: boolean;
  todayISO: string;
  /** La case des conditions de la Pub, cochée par le gérant lui-même (ADR 0086 §4). */
  termsAccepted?: boolean;
};

export type ExecOutcome =
  | { kind: "done"; message: string; redirect?: string }
  | { kind: "team"; message: string }
  | { kind: "failed"; message: string };

/** Les appels de route qu'une idée peut demander, rejoués côté serveur. Toute autre route est refusée. */
async function runCall(row: ProposalRow, action: Extract<ProposalRow["content"]["action"], { kind: "call" }>): Promise<string | null> {
  if (action.method === "PATCH" && action.path === "/api/admin/menu/eligible") {
    const { restaurantId, menuItemId, rewardEligible } = action.body;
    if (restaurantId !== row.restaurant_id || typeof menuItemId !== "string" || typeof rewardEligible !== "boolean") {
      return "Cette idée ne correspond pas à ton établissement.";
    }
    const { data, error } = await createAdminClient()
      .from("menu_items")
      .update({ reward_eligible: rewardEligible })
      .eq("id", menuItemId)
      .eq("restaurant_id", row.restaurant_id)
      .select("id")
      .maybeSingle();
    if (error) return `Le catalogue n'a pas pu être mis à jour : ${error.message}`;
    if (!data) return "Ce plat n'existe plus sur ta carte.";
    return null;
  }
  return `Geste inconnu (${action.method} ${action.path}).`;
}

async function fail(row: ProposalRow, error: string): Promise<ExecOutcome> {
  await markExecutionFailed(row.id, error);
  return { kind: "failed", message: `Ça n'a pas marché : ${error} L'équipe Boosteats est prévenue.` };
}

export async function executeIdea(row: ProposalRow, ctx: ExecContext): Promise<ExecOutcome> {
  const action = row.content.action;
  try {
    switch (action.kind) {
      case "open": {
        await markExecuted(row.id, { opened: action.path });
        return { kind: "done", message: "C'est ouvert.", redirect: action.path };
      }
      case "call": {
        const error = await runCall(row, action);
        if (error) return fail(row, error);
        await markExecuted(row.id, { called: action.path, body: action.body });
        return { kind: "done", message: "C'est fait." };
      }
      case "send_to_members":
      case "schedule_broadcast": {
        const r = await executeHugoAction(action as HugoAction, { restaurantId: row.restaurant_id, createdBy: ctx.userId });
        if (!r.ok) return fail(row, r.error);
        await markExecuted(row.id, { detail: r.detail as unknown as Record<string, unknown> });
        return {
          kind: "done",
          message:
            action.kind === "send_to_members"
              ? "C'est parti : Hugo envoie le message. Tu verras dans quelques jours qui est revenu."
              : `C'est programmé : l'annonce part le ${action.sendOn}.`,
        };
      }
      case "create_ad_request": {
        const av = await pubAvailability(row.restaurant_id, ctx.isSuperAdmin);
        if (!av.open) return fail(row, "La Pub n'est pas encore ouverte pour ton établissement.");
        const r = await acceptEmmaIdea({
          restaurantId: row.restaurant_id,
          userId: ctx.userId,
          isSuperAdmin: ctx.isSuperAdmin,
          todayISO: ctx.todayISO,
          extras: { termsAccepted: ctx.termsAccepted === true },
        });
        if (!r.ok) return fail(row, r.error);
        await markExecuted(row.id, { adRequestId: r.requestId, ...(r.warning ? { warning: r.warning } : {}) });
        return {
          kind: "done",
          message: "Demande créée. Il te reste à payer par virement ; Boosteats valide ensuite la pub.",
          redirect: `/admin/${row.restaurant_id}/pub`,
        };
      }
      case "relay": {
        const relay = (row.content as { relay?: HugoRelay }).relay;
        if (action.to === "hugo" && relay) {
          const idea = promoAnnouncementIdea(relay, ctx.todayISO);
          if (!idea) return fail(row, "Le jour de l'annonce est passé : la promo n'a plus de sens.");
          const rec = await recordIdeas(row.restaurant_id, [idea], { plan: await getPlan(row.restaurant_id) });
          if (rec.unavailable) return fail(row, "Les idées sont indisponibles pour le moment.");
          await markExecuted(row.id, { relayedTo: "hugo", created: rec.shown.map((s) => s.id), discarded: rec.discarded.map((d) => d.reason) });
          return rec.shown.length > 0
            ? { kind: "done", message: "Hugo a préparé l'annonce : elle t'attend dans tes idées." }
            : { kind: "done", message: "Hugo préparera l'annonce dès demain matin." };
        }
        // Relais vers un assistant qui n'a pas de relais automatique : l'équipe prend le relais.
        return { kind: "team", message: "C'est noté : l'équipe Boosteats s'en occupe." };
      }
      case "team":
        // Louis (Brigade 13) : les réponses validées par le gérant sont déjà inscrites dans l'idée (`approvedReplies`,
        // execute-louis.ts) ; l'équipe les publie sur la fiche Google à la main, tant que l'API n'existe pas (Brigade 12).
        if (row.assistant === "louis") {
          return { kind: "team", message: "C'est noté : l'équipe Boosteats publie tes réponses sur ta fiche Google et te prévient quand c'est fait." };
        }
        return { kind: "team", message: "C'est noté : l'équipe Boosteats s'en occupe et te tient au courant." };
      case "update_fiche":
        // Fiche Google sans API (Brigade 12) et idées préparées à la main : le travail est humain.
        return { kind: "team", message: "C'est noté : l'équipe Boosteats s'en occupe et te tient au courant." };
    }
  } catch (e) {
    return fail(row, (e as Error).message);
  }
}
