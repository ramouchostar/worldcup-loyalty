import { Resend } from "resend";
import { createAdminClient } from "./supabase";
import { getRestaurantBranding, logoPublicUrl } from "./restaurant";
import { BRAND_DEFAULTS } from "./branding";
import { foodIconUrl } from "./food-icon";
import { replyToAddress, senderAddress, senderConfigFromEnv, type SenderKind } from "./email-sender";
import type { MemberTheme, RenderedEmail } from "./email-templates/kit";
import { welcomeEmail } from "./email-templates/welcome";
import { partnerApplicationReceivedEmail } from "./email-templates/partner-application-received";
import { restaurantActivatedEmail } from "./email-templates/restaurant-activated";
import { onboardingReminderEmail } from "./email-templates/onboarding-reminder";
import { pendingRequestsReminderEmail } from "./email-templates/pending-requests-reminder";
import { catalogGapsReminderEmail } from "./email-templates/catalog-gaps-reminder";
import { rewardReadyEmail } from "./email-templates/reward-ready";
import { tierUnlockedEmail } from "./email-templates/tier-unlocked";
import { referralSuccessEmail } from "./email-templates/referral-success";
import { ownerInviteEmail } from "./email-templates/owner-invite";

// Emailing — chantier "landing pages / emailing / ads" (2026-07-28), volet
// 2/3. Fournisseur : Resend. Même philosophie que sendPush()/sendWhatsApp()
// dans lib/notifications.ts — no-op silencieux si non configuré, jamais une
// erreur qui casse le flux appelant. Anti-spam par cooldown, journalisé dans
// email_log (docs/m50-email-log.sql), séparé de notification_log (m10) car
// domaine différent (transactionnel restaurateur + client, pas uniquement
// les triggers communautaires push/WhatsApp).

// Expéditeur : lib/email-sender.ts (ADR 0063 §5) — nom de l'établissement
// pour un membre, Boosteats pour un restaurateur, réponses vers la
// plateforme. Sans EMAIL_DOMAIN, repli sur EMAIL_FROM comme avant.

export type EmailRecipientType = "member" | "restaurant";
export type EmailType =
  | "welcome"
  | "partner_application_received"
  | "restaurant_activated"
  | "onboarding_reminder"
  | "pending_requests_reminder"
  | "catalog_gaps_reminder"
  | "reward_ready"
  | "tier_unlocked"
  | "referral_success"
  | "owner_invite";

let client: Resend | null = null;
function getClient(): Resend | null {
  if (!process.env.RESEND_API_KEY) return null;
  if (!client) client = new Resend(process.env.RESEND_API_KEY);
  return client;
}

async function dispatch(
  to: string,
  content: RenderedEmail,
  sender: { kind: SenderKind; restaurantName?: string | null }
): Promise<boolean> {
  const resend = getClient();
  if (!resend) return false;

  const config = senderConfigFromEnv();
  const replyTo = replyToAddress(config);
  try {
    const { error } = await resend.emails.send({
      from: senderAddress(sender.kind, sender.restaurantName ?? null, config),
      to,
      subject: content.subject,
      html: content.html,
      text: content.text,
      ...(replyTo ? { replyTo } : {}),
    });
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

// Logo de l'établissement pour l'en-tête des e-mails. `restaurants.logo_url`
// est un CHEMIN dans le bucket (« kraainem/logo-….png ») : il faut l'URL
// publique, sinon l'image est cassée dans toutes les boîtes de réception.
async function getRestaurantLogoUrl(restaurantId: string): Promise<string | null> {
  try {
    const branding = await getRestaurantBranding(restaurantId);
    return logoPublicUrl(branding.logo_url);
  } catch (err) {
    console.error("getRestaurantLogoUrl threw:", err);
    return null;
  }
}

// Habillage d'un e-mail membre : nom, logo et couleurs de l'établissement
// (ADR 0015), défauts Boosteats sinon. Jamais `brand_accent` : il résout en
// rouge chez Belchicken (ADR 0048 §7).
async function getMemberTheme(restaurantId: string, restaurantName?: string): Promise<MemberTheme> {
  const branding = await getRestaurantBranding(restaurantId);
  let name = restaurantName ?? null;
  if (!name) {
    try {
      const { data } = await createAdminClient().from("restaurants").select("name").eq("id", restaurantId).maybeSingle();
      name = (data?.name as string | undefined) ?? null;
    } catch {
      name = null;
    }
  }
  return {
    restaurantName: name ?? "Boosteats",
    logoUrl: logoPublicUrl(branding.logo_url),
    primary: branding.brand_primary ?? BRAND_DEFAULTS.primary,
    dark: branding.brand_dark ?? BRAND_DEFAULTS.dark,
  };
}

// Les appelants historiques passent « toi » faute de prénom.
function realFirstName(firstName: string | null | undefined): string | null {
  const f = firstName?.trim();
  return f && f !== "toi" ? f : null;
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
  const sent = await dispatch(to, welcomeEmail(displayName), { kind: "member", restaurantName: "Boosteats" });
  if (sent) await logEmailSent("member", to, "welcome");
  return sent;
}

export async function sendPartnerApplicationReceivedEmail(
  to: string,
  restaurantName: string,
  restaurantId: string
): Promise<boolean> {
  const logoUrl = await getRestaurantLogoUrl(restaurantId);
  const sent = await dispatch(to, partnerApplicationReceivedEmail(restaurantName, restaurantId, logoUrl), { kind: "restaurant" });
  if (sent) await logEmailSent("restaurant", restaurantId, "partner_application_received", restaurantId);
  return sent;
}

export async function sendRestaurantActivatedEmail(
  to: string,
  restaurantName: string,
  restaurantId: string
): Promise<boolean> {
  const logoUrl = await getRestaurantLogoUrl(restaurantId);
  const sent = await dispatch(to, restaurantActivatedEmail(restaurantName, restaurantId, logoUrl), { kind: "restaurant" });
  if (sent) await logEmailSent("restaurant", restaurantId, "restaurant_activated", restaurantId);
  return sent;
}

// ADR 0032 — lien d'invitation restaurateur généré depuis /platform. Best-effort
// comme tout le reste du module : sans RESEND_API_KEY, l'envoi est un no-op
// et le super-admin partage le lien à la main (WhatsApp, SMS, de vive voix).
export async function sendOwnerInviteEmail(
  to: string,
  restaurantName: string,
  restaurantId: string,
  inviteUrl: string,
  expiresAt: string
): Promise<boolean> {
  const logoUrl = await getRestaurantLogoUrl(restaurantId);
  const sent = await dispatch(to, ownerInviteEmail(restaurantName, inviteUrl, expiresAt, logoUrl), { kind: "restaurant" });
  if (sent) await logEmailSent("restaurant", restaurantId, "owner_invite", restaurantId);
  return sent;
}

export async function sendOnboardingReminderEmail(
  to: string,
  restaurantName: string,
  restaurantId: string,
  stuckAtStep: 2 | 3
): Promise<boolean> {
  const logoUrl = await getRestaurantLogoUrl(restaurantId);
  const sent = await dispatch(to, onboardingReminderEmail(restaurantName, restaurantId, stuckAtStep, logoUrl), { kind: "restaurant" });
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
    pendingRequestsReminderEmail(restaurantName, restaurantId, totalPending, oldestPendingHours, logoUrl),
    { kind: "restaurant" }
  );
  if (sent) await logEmailSent("restaurant", restaurantId, "pending_requests_reminder", restaurantId);
  return sent;
}

// ADR 0046 — rappel « articles de tickets absents du catalogue ».
export async function sendCatalogGapsReminderEmail(
  to: string,
  restaurantName: string,
  restaurantId: string,
  gapCount: number
): Promise<boolean> {
  const logoUrl = await getRestaurantLogoUrl(restaurantId);
  const sent = await dispatch(to, catalogGapsReminderEmail(restaurantName, restaurantId, gapCount, logoUrl), { kind: "restaurant" });
  if (sent) await logEmailSent("restaurant", restaurantId, "catalog_gaps_reminder", restaurantId);
  return sent;
}

// Cadeau qui attend, rappelé avant son échéance. `gift` : nom de l'article
// et origine — un cadeau payé en points rend ses points s'il expire.
export async function sendRewardReadyEmail(
  to: string,
  userId: string,
  firstName: string,
  restaurantId: string,
  restaurantName: string,
  hoursRemaining: number,
  gift?: { name: string | null; source: string | null }
): Promise<boolean> {
  const theme = await getMemberTheme(restaurantId, restaurantName);
  const giftName = gift?.name?.trim() || null;
  const sent = await dispatch(
    to,
    rewardReadyEmail({
      theme,
      restaurantId,
      firstName: realFirstName(firstName),
      gift: giftName ? { name: giftName, imageUrl: foodIconUrl(giftName) } : null,
      hoursRemaining,
      paidWithPoints: gift?.source === "catalog",
    }),
    { kind: "member", restaurantName: theme.restaurantName }
  );
  if (sent) await logEmailSent("member", userId, "reward_ready", restaurantId);
  return sent;
}

// Cadeau d'équipe (ADR 0061 §7) — le cadeau existe déjà, on l'annonce.
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
  const theme = await getMemberTheme(restaurantId, restaurantName);
  const sent = await dispatch(
    to,
    tierUnlockedEmail({
      theme,
      restaurantId,
      firstName: realFirstName(firstName),
      teamName,
      teamFlag: teamFlag || null,
      gift: { name: newReward, imageUrl: foodIconUrl(newReward) },
    }),
    { kind: "member", restaurantName: theme.restaurantName }
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
  const theme = await getMemberTheme(restaurantId);
  const sent = await dispatch(
    to,
    referralSuccessEmail({ theme, restaurantId, firstName: realFirstName(firstName), conversionsCount }),
    { kind: "member", restaurantName: theme.restaurantName }
  );
  if (sent) await logEmailSent("member", userId, "referral_success", restaurantId);
  return sent;
}
