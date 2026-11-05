import { createAdminClient } from "../supabase";
import { scheduleBroadcast, sendBroadcast, todayInBrussels, type BroadcastResult } from "../broadcast";
import { recordSend, type SendRecord } from "../message-log";
import { HUGO_WINBACK_KEY, MIN_AUDIENCE, loadHugoInput, messageProblem, selectLapsed, type HugoAction, type HugoLapsedInput } from "./hugo";

// Hugo — l'exécuteur (Brigade 08). Appelé APRÈS le « Oui » du gérant, jamais avant, et par une
// couche qui a déjà vérifié ses droits (`requireAdmin`, comme `decideDuplicate`). Cette PR ne le
// branche à aucun écran : l'écran « Idées du jour » et la persistance des idées viennent avec les
// autres Brigades.
//
// Règles qu'il tient, toutes vérifiées par des tests :
//   - ce qui part est exactement ce que la règle de l'idée sélectionne (`selectLapsed`, recalculée
//     ici depuis la base : on ne fait pas confiance à une liste de membres venue de l'appelant) ;
//   - les témoins (10 %) sont inscrits au journal AVANT le premier envoi : sans eux, l'effet ne se
//     mesurerait pas. Pas de journal, pas d'envoi (fail-closed, comme les séquences, ADR 0063) ;
//   - une relance par établissement et par jour : rejouer le « Oui » ne renvoie rien ;
//   - consentement, plafond de 2 par semaine et journal d'envoi sont ceux de `sendBroadcast`
//     (ADR 0014 / 0039), pas une copie.

export type Executed<T> = ({ ok: true } & T) | { ok: false; error: string };

export type LapsedOutcome = {
  campaignId: string;
  treated: number; // membres visés par l'envoi
  holdout: number; // témoins, sans message
  sent: number; // messages réellement partis
  skipped: number; // retenus par le plafond de 2 par semaine
  unrecorded: number; // envois partis mais non inscrits au journal : à regarder, jamais caché
};

/** Les accès extérieurs de la relance, injectables pour que les tests n'aient besoin d'aucune base. */
export type LapsedDeps = {
  load: (restaurantId: string, nowMs: number) => Promise<HugoLapsedInput>;
  /** Une ligne de cette relance existe-t-elle déjà ? `unavailable` : le journal n'est pas lisible. */
  campaignState: (restaurantId: string, campaignId: string) => Promise<"none" | "exists" | "unavailable">;
  record: (r: SendRecord) => Promise<string | null>;
  /** Retire les lignes d'une relance abandonnée en cours de route. */
  discard: (campaignId: string) => Promise<void>;
  send: (message: string, userIds: string[], restaurantId: string) => Promise<BroadcastResult>;
};

export const defaultLapsedDeps: LapsedDeps = {
  load: loadHugoInput,
  async campaignState(restaurantId, campaignId) {
    const { data, error } = await createAdminClient()
      .from("message_sends")
      .select("id")
      .eq("restaurant_id", restaurantId)
      .eq("campaign_id", campaignId)
      .limit(1);
    if (error) return "unavailable"; // journal absent ou illisible : même réponse, fail-closed
    return (data ?? []).length > 0 ? "exists" : "none";
  },
  record: recordSend,
  async discard(campaignId) {
    await createAdminClient().from("message_sends").delete().eq("campaign_id", campaignId);
  },
  send: (message, userIds, restaurantId) => sendBroadcast(message, { kind: "users", userIds }, restaurantId, "promo"),
};

/** Exécute par lots : des milliers de lignes de journal, sans milliers de requêtes simultanées. */
async function inBatches<T>(items: T[], size: number, fn: (item: T) => Promise<unknown>): Promise<void> {
  for (let i = 0; i < items.length; i += size) await Promise.all(items.slice(i, i + size).map(fn));
}

/**
 * La relance des clients qui ne reviennent plus. `message` est le brouillon, éventuellement
 * modifié par le gérant : il est revérifié ici (pas d'euro, pas de message vide).
 */
export async function executeLapsedCampaign(
  args: { restaurantId: string; message: string; nowMs?: number },
  deps: LapsedDeps = defaultLapsedDeps
): Promise<Executed<LapsedOutcome>> {
  const { restaurantId } = args;
  const nowMs = args.nowMs ?? Date.now();
  const message = args.message.trim();

  const problem = messageProblem(message);
  if (problem) return { ok: false, error: problem };

  const input = await deps.load(restaurantId, nowMs);
  const sel = selectLapsed(input);
  // Même porte que l'idée : la cohorte que le gérant a validée est celle qu'on retrouve ici. Si elle a
  // fondu depuis (plusieurs gérants, une relance entre-temps), on ne relance pas une poignée de clients.
  if (sel.reachable.length < MIN_AUDIENCE) {
    return { ok: false, error: "Il n'y a plus assez de clients à relancer : la liste a changé depuis la proposition." };
  }

  // Une relance par établissement et par jour : le « Oui » rejoué ne renvoie rien.
  const campaignId = `${HUGO_WINBACK_KEY}:${restaurantId}:${input.todayISO}`;
  const state = await deps.campaignState(restaurantId, campaignId);
  if (state === "unavailable") {
    return { ok: false, error: "Le journal des messages est illisible : envoi refusé, sans lui l'effet de la relance ne se mesure pas." };
  }
  if (state === "exists") return { ok: false, error: "Cette relance a déjà été lancée aujourd'hui." };

  // Les témoins d'abord. Une ligne qui ne s'écrit pas annule tout : mieux vaut ne rien envoyer que
  // envoyer sans pouvoir comparer.
  const base = { restaurantId, audience: "member", messageKey: HUGO_WINBACK_KEY, campaignId } as const;
  let failedHoldout = 0;
  await inBatches(sel.holdout, 25, async (userId) => {
    const id = await deps.record({ ...base, userId, channel: "none", status: "holdout" });
    if (id === null) failedHoldout++;
  });
  if (failedHoldout > 0) {
    await deps.discard(campaignId);
    return { ok: false, error: "Les témoins n'ont pas pu être inscrits au journal : rien n'a été envoyé." };
  }

  const result = await deps.send(message, sel.treated, restaurantId);

  let unrecorded = 0;
  await inBatches(result.sentTo ?? [], 25, async ({ userId, channel }) => {
    const id = await deps.record({ ...base, userId, channel, status: "sent", subject: message.slice(0, 200) });
    if (id === null) unrecorded++;
  });

  return {
    ok: true,
    campaignId,
    treated: sel.treated.length,
    holdout: sel.holdout.length,
    sent: result.sent,
    skipped: result.skipped,
    unrecorded,
  };
}

/**
 * L'annonce du relais de Chloé : une annonce programmée pour tous les membres, en promo, qui part
 * le jour calculé (ADR 0023) par le cron quotidien, avec le même consentement et la même enveloppe.
 */
export async function executeScheduledAnnouncement(args: {
  restaurantId: string;
  message: string;
  sendOn: string;
  promoOn: string | null;
  createdBy: string | null;
}): Promise<Executed<{ id: string }>> {
  const message = args.message.trim();
  const problem = messageProblem(message);
  if (problem) return { ok: false, error: problem };
  if (args.sendOn < todayInBrussels()) return { ok: false, error: "Le jour d'envoi est passé : l'annonce n'a plus de sens." };
  try {
    const row = await scheduleBroadcast(message, { kind: "all" }, args.restaurantId, args.sendOn, args.promoOn, args.createdBy, "promo");
    return { ok: true, id: row.id };
  } catch (e) {
    return { ok: false, error: `L'annonce n'a pas pu être programmée : ${(e as Error).message}` };
  }
}

/** Le « Oui » du gérant sur une idée de Hugo : la bonne exécution selon le geste de l'idée. */
export async function executeHugoAction(
  action: HugoAction,
  ctx: { restaurantId: string; createdBy: string | null }
): Promise<Executed<{ detail: LapsedOutcome | { id: string } }>> {
  if (action.kind === "send_to_members") {
    const r = await executeLapsedCampaign({ restaurantId: ctx.restaurantId, message: action.message });
    return r.ok ? { ok: true, detail: r } : r;
  }
  const r = await executeScheduledAnnouncement({
    restaurantId: ctx.restaurantId,
    message: action.message,
    sendOn: action.sendOn,
    promoOn: action.promoOn,
    createdBy: ctx.createdBy,
  });
  return r.ok ? { ok: true, detail: { id: r.id } } : r;
}
