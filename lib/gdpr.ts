import { createAdminClient } from "./supabase";
import { purgeUserReceiptImages } from "./receipt-scans";

// ADR 0022 — Droits des personnes : portabilité (export) et effacement.
// Effacement = ANONYMISATION : on strippe les données personnelles du profil
// (conservé pour l'intégrité référentielle) et on supprime les données
// purement personnelles ; les pièces liées à la comptabilité (orders) restent,
// désormais non identifiantes. Un hard-delete du profil cascaderait sur orders
// (ON DELETE CASCADE) et détruirait la comptabilité — interdit.

type Admin = ReturnType<typeof createAdminClient>;
type Row = Record<string, unknown>;

async function grab(admin: Admin, table: string, col: string, val: string): Promise<Row[]> {
  const { data, error } = await admin.from(table).select("*").eq(col, val);
  return error ? [] : ((data ?? []) as Row[]);
}

export async function exportUserData(userId: string) {
  const admin = createAdminClient();

  const [
    profile, memberships, orders, pendingRewards, pointTx, push, notif,
    consents, claims, transfers, referralLinks, refAsReferrer, refAsReferee, dataRequests,
  ] = await Promise.all([
    grab(admin, "profiles", "id", userId),
    grab(admin, "memberships", "user_id", userId),
    grab(admin, "orders", "user_id", userId),
    grab(admin, "pending_rewards", "user_id", userId),
    grab(admin, "point_transactions", "user_id", userId),
    grab(admin, "push_subscriptions", "user_id", userId),
    grab(admin, "notification_log", "user_id", userId),
    grab(admin, "consents", "user_id", userId),
    grab(admin, "micro_reward_claims", "user_id", userId),
    grab(admin, "transfers", "user_id", userId),
    grab(admin, "referral_links", "user_id", userId),
    grab(admin, "referrals", "referrer_id", userId),
    grab(admin, "referrals", "referee_id", userId),
    grab(admin, "data_requests", "user_id", userId),
  ]);

  // order_items via les identifiants de commande
  const orderIds = orders.map((o) => o.id as string).filter(Boolean);
  let orderItems: Row[] = [];
  if (orderIds.length > 0) {
    const { data } = await admin.from("order_items").select("*").in("order_id", orderIds);
    orderItems = (data ?? []) as Row[];
  }

  // ADR 0036 — scans de tickets : ce que le modèle a lu de SES photos.
  // L'image elle-même n'est pas embarquée dans l'export (bucket privé), le
  // chemin non plus : seule la lecture, qui est la donnée le concernant.
  const receiptScans = (await grab(admin, "receipt_scans", "user_id", userId)).map((s) => {
    const safe = { ...s };
    delete safe.storage_path;
    return safe;
  });

  // ADR 0023 — retours qualité + fils médiés (via les identifiants de retour)
  const qualityFeedback = await grab(admin, "quality_feedback", "user_id", userId);
  const feedbackIds = qualityFeedback.map((f) => f.id as string).filter(Boolean);
  let feedbackMessages: Row[] = [];
  if (feedbackIds.length > 0) {
    const { data } = await admin.from("feedback_messages").select("*").in("feedback_id", feedbackIds);
    feedbackMessages = (data ?? []) as Row[];
  }

  return {
    exported_at: new Date().toISOString(),
    user_id: userId,
    profile: profile[0] ?? null,
    memberships,
    orders,
    order_items: orderItems,
    receipt_scans: receiptScans,
    pending_rewards: pendingRewards.map((r) => {
      // ADR 0007 — ne jamais exposer au membre les coûts de revient des cadeaux
      // (données business du restaurant). On les retire de l'export RGPD.
      const safe = { ...r };
      delete safe.solo_cost;
      delete safe.community_cost;
      delete safe.advancement_cost;
      return safe;
    }),
    point_transactions: pointTx,
    push_subscriptions: push,
    notification_log: notif,
    consents,
    micro_reward_claims: claims,
    transfers,
    referral_links: referralLinks,
    referrals: [...refAsReferrer, ...refAsReferee],
    quality_feedback: qualityFeedback,
    feedback_messages: feedbackMessages,
    data_requests: dataRequests,
  };
}

export async function deleteUserData(userId: string): Promise<void> {
  const admin = createAdminClient();

  // 1. Anonymisation du profil (row conservée → orders/compta préservés)
  await admin
    .from("profiles")
    .update({
      display_name: "Compte supprimé",
      phone: null,
      email: null,
      zones: [],
      birth_date: null,
      is_minor: null,
      parental_consent_status: "none",
      parental_email: null,
      anonymized_at: new Date().toISOString(),
    })
    .eq("id", userId);

  // 2. Suppression des données purement personnelles (hors conservation légale).
  //    Les deletes ne jettent pas : une table absente renvoie une erreur ignorée.
  await Promise.all([
    admin.from("push_subscriptions").delete().eq("user_id", userId),
    admin.from("memberships").delete().eq("user_id", userId),
    admin.from("pending_rewards").delete().eq("user_id", userId),
    admin.from("notification_log").delete().eq("user_id", userId),
    admin.from("referral_links").delete().eq("user_id", userId),
  ]);

  // 2 bis. ADR 0036 — les photos de tickets partent tout de suite, sans
  //    attendre les 30 jours de rétention : une image de ticket est une
  //    donnée personnelle, pas une écriture comptable. Les lignes `orders`
  //    (montant, date, numéro) restent, désormais sans photo.
  await purgeUserReceiptImages(userId);
  await admin.from("receipt_scans").delete().eq("user_id", userId);

  // 3. ADR 0023 — retours qualité : on ANONYMISE (on garde la statistique non
  //    nominative pour le baromètre), on efface le commentaire et les messages
  //    écrits par le membre. Les réponses de l'établissement restent.
  const { data: fbRows } = await admin.from("quality_feedback").select("id").eq("user_id", userId);
  const fbIds = ((fbRows ?? []) as { id: string }[]).map((r) => r.id);
  await admin
    .from("quality_feedback")
    .update({ comment: null, is_anonymous: true, contact_opt_in: false })
    .eq("user_id", userId);
  if (fbIds.length > 0) {
    await admin.from("feedback_messages").delete().in("feedback_id", fbIds).eq("sender", "member");
  }
}
