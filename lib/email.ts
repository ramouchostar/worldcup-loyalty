import { Resend } from "resend";
import { welcomeEmail } from "./email-templates/welcome";

// Emailing — chantier "landing pages / emailing / ads" (2026-07-28), volet
// 2/3. Fournisseur : Resend. Même philosophie que sendPush()/sendWhatsApp()
// dans lib/notifications.ts — no-op silencieux si non configuré, jamais une
// erreur qui casse le flux d'inscription. Email transactionnel uniquement
// pour l'instant (bienvenue) : reste gratuit, fait partie du programme
// membre (ADR 0029 §2), pas une fonction Croissance.

const EMAIL_FROM = process.env.EMAIL_FROM ?? "Boosteats <onboarding@resend.dev>";

let client: Resend | null = null;
function getClient(): Resend | null {
  if (!process.env.RESEND_API_KEY) return null;
  if (!client) client = new Resend(process.env.RESEND_API_KEY);
  return client;
}

export async function sendWelcomeEmail(to: string, displayName: string): Promise<boolean> {
  const resend = getClient();
  if (!resend) return false;

  const { subject, html, text } = welcomeEmail(displayName);

  try {
    const { error } = await resend.emails.send({ from: EMAIL_FROM, to, subject, html, text });
    if (error) {
      console.error("sendWelcomeEmail failed:", error);
      return false;
    }
    return true;
  } catch (err) {
    console.error("sendWelcomeEmail threw:", err);
    return false;
  }
}
