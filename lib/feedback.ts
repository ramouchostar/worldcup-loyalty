import { createAdminClient } from "./supabase";
import type {
  AdminFeedbackItem,
  FeedbackDimension,
  FeedbackMessage,
  FeedbackSentiment,
  FeedbackStatus,
  QualityFeedback,
} from "@/types";

// ADR 0023 — Canal qualité privé (« note inversée »). Cette lib tourne côté
// serveur : écritures via service role, le membre ne lit que ses retours
// (RLS own-read), le resto y accède borné à son établissement — JAMAIS le
// contact brut du membre (fil médié par la plateforme).

type Admin = ReturnType<typeof createAdminClient>;

// Constantes client-safe (partagées avec l'UI) — voir lib/feedback-constants.ts.
import { FEEDBACK_ELIGIBILITY_MIN, FEEDBACK_DIMENSIONS, DIMENSION_LABELS } from "./feedback-constants";
export { FEEDBACK_ELIGIBILITY_MIN, FEEDBACK_DIMENSIONS, DIMENSION_LABELS };

// ─── Contexte grossi (ADR 0023 §5 — jamais l'heure à la minute) ───────────────
// occurred_at est construit en UTC à partir de order_date + order_time (voir
// orderOccurredAt) → les accès UTC redonnent l'heure imprimée sur le ticket,
// indépendamment du fuseau du serveur.

const WEEKDAYS = ["Dimanche", "Lundi", "Mardi", "Mercredi", "Jeudi", "Vendredi", "Samedi"];

export function weekdayLabel(occurredAt: string | null): string {
  if (!occurredAt) return "Jour inconnu";
  const d = new Date(occurredAt);
  return Number.isNaN(d.getTime()) ? "Jour inconnu" : WEEKDAYS[d.getUTCDay()];
}

export function timeSlot(occurredAt: string | null): string {
  if (!occurredAt) return "Heure inconnue";
  const d = new Date(occurredAt);
  if (Number.isNaN(d.getTime())) return "Heure inconnue";
  const h = d.getUTCHours();
  if (h >= 6 && h < 11) return "Matin (6 h–11 h)";
  if (h >= 11 && h < 14) return "Midi (11 h–14 h)";
  if (h >= 14 && h < 18) return "Après-midi (14 h–18 h)";
  if (h >= 18 && h < 22) return "Soir (18 h–22 h)";
  return "Nuit (22 h–6 h)";
}

// ─── Commandes validées & éligibilité ────────────────────────────────────────

type OrderLite = { id: string; order_date: string; order_time: string | null };

async function validatedOrders(userId: string, restaurantId: string, client: Admin): Promise<OrderLite[]> {
  const { data } = await client
    .from("orders")
    .select("id, order_date, order_time")
    .eq("user_id", userId)
    .eq("restaurant_id", restaurantId)
    .eq("status", "validated")
    .order("order_date", { ascending: false })
    .order("order_time", { ascending: false, nullsFirst: false });
  return (data ?? []) as OrderLite[];
}

// occurred_at déterministe (UTC) à partir de la commande — voir note ci-dessus.
function orderOccurredAt(o: OrderLite): string {
  const t = o.order_time && /^\d{2}:\d{2}/.test(o.order_time) ? o.order_time.slice(0, 5) : "12:00";
  return `${o.order_date}T${t}:00Z`;
}

export async function isEligibleForFeedback(userId: string, restaurantId: string, admin?: Admin): Promise<boolean> {
  const client = admin ?? createAdminClient();
  const { count } = await client
    .from("orders")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId)
    .eq("restaurant_id", restaurantId)
    .eq("status", "validated");
  return (count ?? 0) >= FEEDBACK_ELIGIBILITY_MIN;
}

// Faut-il proposer l'invite in-app ? Éligible ET pas encore de retour pour la
// dernière commande validée (un retour par commande — anti-spam).
export async function shouldPromptFeedback(userId: string, restaurantId: string, admin?: Admin): Promise<boolean> {
  const client = admin ?? createAdminClient();
  const orders = await validatedOrders(userId, restaurantId, client);
  if (orders.length < FEEDBACK_ELIGIBILITY_MIN) return false;
  const { data } = await client
    .from("quality_feedback")
    .select("id")
    .eq("user_id", userId)
    .eq("order_id", orders[0].id)
    .maybeSingle();
  return !data;
}

// ─── Enregistrement d'un retour ──────────────────────────────────────────────

export type RecordFeedbackInput = {
  userId: string;
  restaurantId: string;
  sentiment: FeedbackSentiment;
  dimensions?: FeedbackDimension[];
  comment?: string | null;
  contactOptIn?: boolean;   // incident : le membre accepte d'être recontacté
  forceAnonymous?: boolean; // encouragement : le membre choisit de rester anonyme
};

export type RecordFeedbackResult = { ok: true; id: string } | { ok: false; reason: string };

export async function recordFeedback(input: RecordFeedbackInput, admin?: Admin): Promise<RecordFeedbackResult> {
  const client = admin ?? createAdminClient();

  const orders = await validatedOrders(input.userId, input.restaurantId, client);
  if (orders.length < FEEDBACK_ELIGIBILITY_MIN) return { ok: false, reason: "not_eligible" };

  const latest = orders[0];

  // Anti-spam : un seul retour par commande.
  const { data: existing } = await client
    .from("quality_feedback")
    .select("id")
    .eq("user_id", input.userId)
    .eq("order_id", latest.id)
    .maybeSingle();
  if (existing) return { ok: false, reason: "already_submitted" };

  // Identité pilotée par le sentiment (ADR 0023 §4) :
  //   incident      → anonyme (toujours)
  //   encouragement → nominatif, sauf si le membre force l'anonymat
  const isAnonymous = input.sentiment === "incident" ? true : !!input.forceAnonymous;
  const dimensions =
    input.sentiment === "incident"
      ? (input.dimensions ?? []).filter((d) => FEEDBACK_DIMENSIONS.includes(d))
      : [];
  const comment = (input.comment ?? "").trim().slice(0, 1000) || null;

  const { data, error } = await client
    .from("quality_feedback")
    .insert({
      user_id: input.userId,
      restaurant_id: input.restaurantId,
      order_id: latest.id,
      sentiment: input.sentiment,
      dimensions,
      comment,
      is_anonymous: isAnonymous,
      contact_opt_in: input.sentiment === "incident" ? !!input.contactOptIn : false,
      occurred_at: orderOccurredAt(latest),
    })
    .select("id")
    .single();

  if (error) return { ok: false, reason: error.message };
  return { ok: true, id: (data as { id: string }).id };
}

// ─── Vue membre : mes retours + mes fils ─────────────────────────────────────

export async function getMyFeedback(
  userId: string,
  admin?: Admin
): Promise<{ feedback: QualityFeedback[]; messages: FeedbackMessage[] }> {
  const client = admin ?? createAdminClient();
  const { data: fb } = await client
    .from("quality_feedback")
    .select("*")
    .eq("user_id", userId)
    .order("created_at", { ascending: false });
  const feedback = (fb ?? []) as QualityFeedback[];

  const ids = feedback.map((f) => f.id);
  let messages: FeedbackMessage[] = [];
  if (ids.length > 0) {
    const { data: msg } = await client
      .from("feedback_messages")
      .select("*")
      .in("feedback_id", ids)
      .order("created_at", { ascending: true });
    messages = (msg ?? []) as FeedbackMessage[];
  }
  return { feedback, messages };
}

// ─── Fil médié : ajout d'un message (membre ou établissement) ─────────────────

export async function addFeedbackMessage(
  params: { feedbackId: string; restaurantId: string; sender: "member" | "establishment"; body: string },
  admin?: Admin
): Promise<{ ok: boolean; reason?: string }> {
  const client = admin ?? createAdminClient();
  const body = params.body.trim().slice(0, 2000);
  if (!body) return { ok: false, reason: "empty" };

  const { error } = await client.from("feedback_messages").insert({
    feedback_id: params.feedbackId,
    restaurant_id: params.restaurantId,
    sender: params.sender,
    body,
  });
  if (error) return { ok: false, reason: error.message };

  // La réponse de l'établissement fait passer le retour à 'acknowledged'.
  if (params.sender === "establishment") {
    await client
      .from("quality_feedback")
      .update({ status: "acknowledged" })
      .eq("id", params.feedbackId)
      .eq("restaurant_id", params.restaurantId) // borne tenant (F-B) — ceinture + bretelles
      .eq("status", "new");
  }
  return { ok: true };
}

// ─── Vue resto (owner) : contexte GROSSI, jamais de contact ni de commande ────
// N'expose ni user_id, ni order_id, ni Bestelnummer, ni l'heure à la minute :
// seulement jour + créneau. Prénom visible uniquement sur un encouragement non
// anonyme ; les incidents restent anonymes (ADR 0023 §4-§5).

// AdminFeedbackItem : voir @/types (contexte grossi, jamais d'identifiant ni de contact).

type AdminFeedbackRow = {
  id: string;
  user_id: string;
  sentiment: FeedbackSentiment;
  dimensions: FeedbackDimension[] | null;
  comment: string | null;
  is_anonymous: boolean;
  contact_opt_in: boolean;
  status: FeedbackStatus;
  occurred_at: string | null;
  created_at: string;
};

function firstName(displayName: string | null): string {
  return (displayName ?? "").trim().split(/\s+/)[0] || "Un membre";
}

export async function getEstablishmentFeedback(restaurantId: string, admin?: Admin): Promise<AdminFeedbackItem[]> {
  const client = admin ?? createAdminClient();
  const { data: fb } = await client
    .from("quality_feedback")
    .select("id, user_id, sentiment, dimensions, comment, is_anonymous, contact_opt_in, status, occurred_at, created_at")
    .eq("restaurant_id", restaurantId)
    .neq("moderation_status", "hidden")
    .order("created_at", { ascending: false });
  const rows = (fb ?? []) as AdminFeedbackRow[];

  // Prénoms : uniquement pour les encouragements non anonymes.
  const namedIds = Array.from(
    new Set(rows.filter((r) => r.sentiment === "encouragement" && !r.is_anonymous).map((r) => r.user_id))
  );
  const names = new Map<string, string>();
  if (namedIds.length > 0) {
    const { data: profs } = await client.from("profiles").select("id, display_name").in("id", namedIds);
    for (const p of (profs ?? []) as { id: string; display_name: string | null }[]) {
      names.set(p.id, firstName(p.display_name));
    }
  }

  // Fils médiés, groupés par retour.
  const ids = rows.map((r) => r.id);
  const byFeedback = new Map<string, FeedbackMessage[]>();
  if (ids.length > 0) {
    const { data: msg } = await client
      .from("feedback_messages")
      .select("*")
      .in("feedback_id", ids)
      .order("created_at", { ascending: true });
    for (const m of (msg ?? []) as FeedbackMessage[]) {
      const arr = byFeedback.get(m.feedback_id) ?? [];
      arr.push(m);
      byFeedback.set(m.feedback_id, arr);
    }
  }

  return rows.map((r) => ({
    id: r.id,
    sentiment: r.sentiment,
    dimensions: r.dimensions ?? [],
    comment: r.comment,
    status: r.status,
    contactOptIn: r.contact_opt_in,
    createdAt: r.created_at,
    weekday: weekdayLabel(r.occurred_at),
    slot: timeSlot(r.occurred_at),
    authorName: r.sentiment === "encouragement" && !r.is_anonymous ? names.get(r.user_id) ?? null : null,
    messages: byFeedback.get(r.id) ?? [],
  }));
}
