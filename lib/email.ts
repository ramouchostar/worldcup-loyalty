import { Resend } from "resend";
import { createAdminClient } from "./supabase";
import { welcomeEmail } from "./email-templates/welcome";
import { partnerApplicationReceivedEmail } from "./email-templates/partner-application-received";
import { restaurantActivatedEmail } from "./email-templates/restaurant-activated";
import { onboardingReminderEmail } from "./email-templates/onboarding-reminder";
import { pendingRequestsReminderEmail } from "./email-templates/pending-requests-reminder";
import { rewardReadyEmail } from "./email-templates/reward-ready";
import { tierUnlockedEmail } from "./email-templates/tier-unlocked";
import { referralSuccessEmail } from "./email-templates/referral-success";

// Emailing — chantier "landing pages / emailing / ads" (2026-07-28), volet
// 2/3. Fournisseur : Resend. Même philosophie que sendPush()/sendWhatsApp()
// dans lib/notifications.ts — no-op silencieux si non configuré, jamais une
// erreur qui casse le flux appelant. Anti-spam par cooldown, journalisé dans
// email_log (docs/m50-email-log.sql), séparé de notification_log (m10) car
// domaine différent (transactionnel restaurateur + client, pas uniquement
// les triggers communautaires push/WhatsApp).

const EMAIL_FROM = process.env.EMAIL_FROM ?? "Boosteats <onboarding@resend.dev>";

export type EmailRecipientType = "member" | "restaurant";
export type EmailType =
  | "welcome"
  | "partner_application_received"
  | "restaurant_activated"
  | "onboarding_reminder"
  | "pending_requests_reminder"
  | "reward_ready"
  | "tier_unlocked"
  | "referral_success";

let client: Resend | null = null;
function getClient(): Resend | null {
  if (!process.env.RESEND_API_KEY) return null;
  if (!client) client = new Resend(process.env.RESEND_API_KEY);
  return client;
}

async function dispatch(
  to: string,
  content: { subject: string; html: string; text: string }
): Promise<boolean> {
  const resend = getClient();
  if (!resend) return false;

  try {
    const { error } = await resend.emails.send({ from: EMAIL_FROM, to, ...content });
    if (error) {
      console.error("email dispatch failed:", error);
      return false;
    }
    return true;
  } catch (err) {
    console.error("email dispatch threw:", err);
    return false;
  }
}

// Anti-spam : a-t-on déjà envoyé ce type d'email à ce destinataire dans les
// `cooldownHours` dernières heures ? Utilisé par le cron avant tout envoi
// répétable (relance onboarding, demandes en attente, cadeau à récupérer).
export async function wasEmailSentRecently(
  recipientType: EmailRecipientType,
  recipientId: string,
  emailType: EmailType,
  cooldownHours: number
): Promise<boolean> {
  try {
    const admin = createAdminClient();
    const since = new Date(Date.now() - cooldownHours * 60 * 60 * 1000).toISOString();
    const { count } = await admin
      .from("email_log")
      .select("id", { count: "exact", head: true })
      .eq("recipient_type", recipientType)
      .eq("recipient_id", recipientId)
      .eq("email_type", emailType)
      .gte("sent_at", since);
    return (count ?? 0) > 0;
  } catch (err) {
    console.error("wasEmailSentRecently threw:", err);
    return false;
  }
}

// Logo de l'établissement (lib/branding.ts, restaurants.logo_url) pour
// l'en-tête des emails scopés à un resto — remplace le wordmark Boosteats
// générique quand il est configuré (app/admin/[restaurantId]/settings).
async function getRestaurantLogoUrl(restaurantId: string): Promise<string | null> {
  try {
    const admin = createAdminClient();
    const { data } = await admin
      .from("restaurants")
      .select("logo_url")
      .eq("id", restaurantId)
      .maybeSingle();
    return data?.logo_url ?? null;
  } catch (err) {
    console.error("getRestaurantLogoUrl threw:", err);
    return null;
  }
}

async function logEmailSent(
  recipientType: EmailRecipientType,
  recipientId: string,
  emailType: EmailType,
  restaurantId?: string
): Promise<void> {
  try {
    const admin = createAdminClient();
    await admin.from("email_log").insert({
      recipient_type: recipientType,
      recipient_id: recipientId,
      email_type: emailType,
      restaurant_id: restaurantId ?? null,
    });
  } catch (err) {
    console.error("logEmailSent threw:", err);
  }
}

export async function sendWelcomeEmail(to: string, displayName: string): Promise<boolean> {
  const sent = await dispatch(to, welcomeEmail(displayName));
  if (sent) await logEmailSent("member", to, "welcome");
  return sent;
}

export async function sendPartnerApplicationReceivedEmail(
  to: string,
  restaurantName: string,
  restaurantId: string
): Promise<boolean> {
  const logoUrl = await getRestaurantLogoUrl(restaurantId);
  const sent = await dispatch(to, partnerApplicationReceivedEmail(restaurantName, restaurantId, logoUrl));
  if (sent) await logEmailSent("restaurant", restaurantId, "partner_application_received", restaurantId);
  return sent;
}

export async function sendRestaurantActivatedEmail(
  to: string,
  restaurantName: string,
  restaurantId: string
): Promise<boolean> {
  const logoUrl = await getRestaurantLogoUrl(restaurantId);
  const sent = await dispatch(to, restaurantActivatedEmail(restaurantName, restaurantId, logoUrl));
  if (sent) await logEmailSent("restaurant", restaurantId, "restaurant_activated", restaurantId);
  return sent;
}

export async function sendOnboardingReminderEmail(
  to: string,
  restaurantName: string,
  restaurantId: string,
  stuckAtStep: 2 | 3
): Promise<boolean> {
  const logoUrl = await getRestaurantLogoUrl(restaurantId);
  const sent = await dispatch(to, onboardingReminderEmail(restaurantName, restaurantId, stuckAtStep, logoUrl));
  if (sent) await logEmailSent("restaurant", restaurantId, "onboarding_reminder", restaurantId);
  return sent;
}

export async function sendPendingRequestsReminderEmail(
  to: string,
  restaurantName: string,
  restaurantId: string,
  totalPending: number,
  oldestPendingHours: number
): Promise<boolean> {
  const logoUrl = await getRestaurantLogoUrl(restaurantId);
  const sent = await dispatch(
    to,
    pendingRequestsReminderEmail(restaurantName, restaurantId, totalPending, oldestPendingHours, logoUrl)
  );
  if (sent) await logEmailSent("restaurant", restaurantId, "pending_requests_reminder", restaurantId);
  return sent;
}

export async function sendRewardReadyEmail(
  to: string,
  userId: string,
  firstName: string,
  restaurantId: string,
  restaurantName: string,
  hoursRemaining: number
): Promise<boolean> {
  const logoUrl = await getRestaurantLogoUrl(restaurantId);
  const sent = await dispatch(to, rewardReadyEmail(firstName, restaurantId, restaurantName, hoursRemaining, logoUrl));
  if (sent) await logEmailSent("member", userId, "reward_ready", restaurantId);
  return sent;
}

export async function sendTierUnlockedEmail(
  to: string,
  userId: string,
  firstName: string,
  restaurantId: string,
  restaurantName: string,
  teamName: string,
  teamFlag: string,
  newReward: string
): Promise<boolean> {
  const logoUrl = await getRestaurantLogoUrl(restaurantId);
  const sent = await dispatch(
    to,
    tierUnlockedEmail(firstName, restaurantId, restaurantName, teamName, teamFlag, newReward, logoUrl)
  );
  if (sent) await logEmailSent("member", userId, "tier_unlocked", restaurantId);
  return sent;
}

export async function sendReferralSuccessEmail(
  to: string,
  userId: string,
  firstName: string,
  restaurantId: string,
  conversionsCount: number
): Promise<boolean> {
  const logoUrl = await getRestaurantLogoUrl(restaurantId);
  const sent = await dispatch(to, referralSuccessEmail(firstName, restaurantId, conversionsCount, logoUrl));
  if (sent) await logEmailSent("member", userId, "referral_success", restaurantId);
  return sent;
}
