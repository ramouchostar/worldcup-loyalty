import { createAdminClient } from "./supabase";
import { purgeUserReceiptImages } from "./receipt-scans";
import { CONSENT_PURPOSES, recordConsents } from "./consent";

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

  // ADR 0063 — journal des messages envoyés (sans adresse : il n'en stocke pas).
  const messageSends = await grab(admin, "message_sends", "user_id", userId);
  const messageOptouts = await grab(admin, "message_optouts", "user_id", userId);

  // Complément ADR 0038 — mesure d'installation de l'app (plateforme, dates,
  // nb d'ouvertures, user-agent tronqué) : données le concernant, exportées.
  const appInstalls = await grab(admin, "member_app_installs", "user_id", userId);

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
    member_app_installs: appInstalls,
    notification_log: notif,
    message_sends: messageSends,
    message_optouts: messageOptouts,
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

// Renvoie la liste des étapes en échec (vide = tout est passé). Avant, les
// erreurs étaient avalées : une adhésion non supprimée laissait un « Compte
// supprimé » dans « Mes clients » sans que personne le sache.
export async function deleteUserData(userId: string): Promise<string[]> {
  const admin = createAdminClient();
  const failures: string[] = [];
  const check = (step: string, error: { message?: string } | null) => {
    if (error) {
      failures.push(step);
      console.error(`[gdpr] effacement ${step}:`, error.message);
    }
  };

  // 1. Anonymisation du profil (row conservée → orders/compta préservés)
  const { error: profileError } = await admin
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
  check("profiles", profileError);

  // 2. Suppression des données purement personnelles (hors conservation légale).
  const tables: [string, string][] = [
    ["push_subscriptions", "user_id"],
    ["member_app_installs", "user_id"], // mesure d'installation (ADR 0038)
    ["memberships", "user_id"],
    ["pending_rewards", "user_id"],
    ["notification_log", "user_id"],
    ["message_sends", "user_id"], // journal des messages (ADR 0063)
    ["message_optouts", "user_id"],
    ["referral_links", "user_id"],
  ];
  const results = await Promise.all(tables.map(([t, c]) => admin.from(t).delete().eq(c, userId)));
  results.forEach((r, i) => check(tables[i][0], r.error));

  // 2 bis. Consentements RETIRÉS (journal append-only, la preuve reste) : sans
  //    ça, le consentement « programme » survivait à la suppression et une
  //    reconnexion rentrait tout droit, sans repasser par la case.
  try {
    await recordConsents(
      userId,
      Object.fromEntries(CONSENT_PURPOSES.map((p) => [p, false])),
      "deletion",
      admin
    );
  } catch (err) {
    check("consents", { message: String(err) });
  }

  // 2 ter. ADR 0036 — les photos de tickets partent tout de suite, sans
  //    attendre les 30 jours de rétention : une image de ticket est une
  //    donnée personnelle, pas une écriture comptable. Les lignes `orders`
  //    (montant, date, numéro) restent, désormais sans photo.
  await purgeUserReceiptImages(userId);
  const { error: scansError } = await admin.from("receipt_scans").delete().eq("user_id", userId);
  check("receipt_scans", scansError);

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

  return failures;
}

// Retour après suppression : le compte de connexion survit à l'effacement
// (anonymisation, pas suppression — la compta en dépend). Quelqu'un qui se
// reconnecte retrouvait un profil « Compte supprimé » sans e-mail : visible
// ainsi en console, exclu de tous les e-mails. On le réactive comme un compte
// neuf (prénom redemandé dans /compte, ADR 0047). Renvoie true s'il revenait.
export async function reactivateIfAnonymized(userId: string, email: string | null): Promise<boolean> {
  const admin = createAdminClient();
  const { data } = await admin.from("profiles").select("anonymized_at").eq("id", userId).maybeSingle();
  if (!(data as { anonymized_at: string | null } | null)?.anonymized_at) return false;
  const { error } = await admin
    .from("profiles")
    .update({ anonymized_at: null, display_name: null, email })
    .eq("id", userId);
  if (error) {
    console.error("[gdpr] réactivation échouée:", error.message);
    return false;
  }
  console.info("[gdpr] compte réactivé après suppression:", userId);
  return true;
}
