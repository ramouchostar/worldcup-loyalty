import { createAdminClient } from "../supabase";
import { listLiveRestaurants } from "../demo";
import { getPlan } from "../entitlements";
import { dispatch, getRestaurantLogoUrl } from "../email";
import { getRestaurantContactEmail } from "../missions-contact";
import { sendConsolePush } from "../console-push";
import { brusselsHour } from "../onboarding-reminder-rules";
import { brusselsDayStartIso } from "../ticket-limits";
import { proIdeasEmail, morningSubject } from "../email-templates/pro-ideas";
import { expireIdeas, listTodayIdeas, brusselsDay } from "./proposals";
import { runBrigade, type GeneratorReport } from "./run";

// Le passage du matin de la brigade (ADR 0089 §6, Brigade 05). SERVEUR UNIQUEMENT.
//
// Vers 9 h à Bruxelles, pour chaque établissement réel et actif :
//   1. les idées échues expirent ;
//   2. chaque assistant propose ses idées, la couche des idées choisit ce qui se
//      montre (forfait, doublon, refus appris, 3 par jour) ;
//   3. s'il y a au moins une idée à décider, UN message au gérant (e-mail via
//      `dispatch`, journalisé ; push de la console s'il l'a activé) — seulement
//      pour les établissements ouverts au message (`BRIGADE_EMAIL_RESTAURANTS`,
//      comme `PUB_RESTAURANTS`) : on n'écrit pas « Hugo a 2 idées pour toi » à un
//      gérant à qui personne n'a encore présenté Hugo.
// Le résultat dit tout : idées par assistant, erreurs, écarts, envois. Jamais silencieux.

export const MORNING_HOUR = 9;
export const MORNING_KEY = "brigade_morning";

/** L'établissement reçoit-il le message du matin ? Liste d'ids séparés par des virgules, ou « * ». */
export function morningEmailOpen(restaurantId: string, raw: string | undefined = process.env.BRIGADE_EMAIL_RESTAURANTS): boolean {
  const list = (raw ?? "").split(",").map((s) => s.trim()).filter(Boolean);
  return list.includes("*") || list.includes(restaurantId);
}

export type MorningMessage = "sent" | "failed" | "not_open" | "no_idea" | "already_sent" | "no_contact" | "unavailable";

export type MorningRestaurantResult = {
  restaurantId: string;
  plan: string;
  generators: GeneratorReport[];
  shown: number;
  discarded: Record<string, number>;
  toDecide: number;
  message: MorningMessage;
  push?: "sent" | "no_device" | "failed" | "no_owner";
  error?: string;
};

export type MorningResult = {
  ok: boolean;
  brusselsHour: number;
  skipped?: "hour";
  expired: number | "unavailable";
  restaurants: MorningRestaurantResult[];
};

async function alreadySentToday(restaurantId: string, now: Date): Promise<boolean | null> {
  const { data, error } = await createAdminClient()
    .from("message_sends")
    .select("id")
    .eq("message_key", MORNING_KEY)
    .eq("restaurant_id", restaurantId)
    .eq("status", "sent")
    .gte("created_at", brusselsDayStartIso(now))
    .limit(1);
  if (error) return null; // journal illisible : on n'envoie pas (fail-closed, ADR 0063)
  return (data ?? []).length > 0;
}

async function messageGerant(
  r: { id: string; name: string; owner_id: string | null },
  now: Date
): Promise<Pick<MorningRestaurantResult, "toDecide" | "message" | "push">> {
  const today = await listTodayIdeas(r.id, now.getTime());
  if (today.unavailable) return { toDecide: 0, message: "unavailable" };
  const ideas = today.toDecide.map((row) => ({ assistant: row.assistant, title: row.content.title, question: row.content.question }));
  if (ideas.length === 0) return { toDecide: 0, message: "no_idea" };
  if (!morningEmailOpen(r.id)) return { toDecide: ideas.length, message: "not_open" };
  const sent = await alreadySentToday(r.id, now);
  if (sent !== false) return { toDecide: ideas.length, message: sent === null ? "failed" : "already_sent" };

  const to = await getRestaurantContactEmail(r.id, null);
  let message: MorningMessage = "no_contact";
  if (to) {
    const email = proIdeasEmail({ restaurantName: r.name, restaurantId: r.id, logoUrl: await getRestaurantLogoUrl(r.id), ideas });
    message = (await dispatch(to, email, { key: MORNING_KEY, audience: "restaurant", restaurantId: r.id, restaurantName: r.name })) ? "sent" : "failed";
  }
  const push = r.owner_id
    ? await sendConsolePush(r.owner_id, r.id, { title: morningSubject(ideas), body: ideas[0].title, url: `/admin/${r.id}/idees` })
    : "no_owner";
  return { toDecide: ideas.length, message, push };
}

/**
 * `only` : un seul établissement (démo comprise), à n'importe quelle heure —
 * pour essayer depuis la plateforme. Sans `only`, le passage n'agit qu'à 9 h.
 */
export async function runMorningIdeas(now = new Date(), opts: { only?: string; force?: boolean } = {}): Promise<MorningResult> {
  const hour = brusselsHour(now);
  if (!opts.force && !opts.only && hour !== MORNING_HOUR) return { ok: true, brusselsHour: hour, skipped: "hour", expired: 0, restaurants: [] };

  const expired = await expireIdeas(now.getTime());
  const admin = createAdminClient();
  let restaurants: { id: string; name: string; owner_id: string | null }[];
  if (opts.only) {
    const { data } = await admin.from("restaurants").select("id, name, owner_id").eq("id", opts.only).maybeSingle();
    restaurants = data ? [data as { id: string; name: string; owner_id: string | null }] : [];
  } else {
    restaurants = await listLiveRestaurants<{ id: string; name: string; owner_id: string | null }>(admin, "id, name, owner_id");
  }

  const todayISO = brusselsDay(now);
  const results: MorningRestaurantResult[] = [];
  for (const r of restaurants) {
    const plan = await getPlan(r.id);
    try {
      const run = await runBrigade(r.id, plan, { todayISO, nowMs: now.getTime() });
      const discarded: Record<string, number> = {};
      if (!run.recorded.unavailable) for (const d of run.recorded.discarded) discarded[d.reason] = (discarded[d.reason] ?? 0) + 1;
      const msg = await messageGerant(r, now);
      results.push({
        restaurantId: r.id,
        plan,
        generators: run.generators,
        shown: run.recorded.unavailable ? 0 : run.recorded.shown.length,
        discarded,
        ...msg,
      });
    } catch (e) {
      results.push({ restaurantId: r.id, plan, generators: [], shown: 0, discarded: {}, toDecide: 0, message: "failed", error: (e as Error).message });
    }
  }
  const ok = typeof expired === "number" && !results.some((r) => r.error || r.message === "failed");
  return { ok, brusselsHour: hour, expired: typeof expired === "number" ? expired : "unavailable", restaurants: results };
}
