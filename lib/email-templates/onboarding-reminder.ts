import { appLink, button, esc, eyebrow, heading, paragraph, proShell, small, strong, type RenderedEmail } from "./kit";

// Restaurateur — inscription self-service arrêtée à l'étape 2 (carte) ou 3
// (ticket exemple, ADR 0019), relancée après 48 h au plus une fois tous les
// deux jours (cron de notifications).

export function onboardingReminderEmail(
  restaurantName: string,
  restaurantId: string,
  stuckAtStep: 2 | 3,
  logoUrl?: string | null
): RenderedEmail {
  const url = appLink(stuckAtStep === 2 ? `/become-a-partner/${restaurantId}/menu` : `/become-a-partner/${restaurantId}/receipt`);
  const stepLabel = stuckAtStep === 2 ? "ta carte" : "un ticket exemple";
  const remaining = stuckAtStep === 2 ? "2 minutes" : "1 minute";
  const subject = `${restaurantName} — il te reste une étape pour être en ligne`;
  const preheader = `Il ne manque plus que ${stepLabel} : environ ${remaining}.`;

  const body = [
    eyebrow(`Étape ${stuckAtStep} sur 3`),
    heading("Encore une étape !"),
    paragraph(`${strong(restaurantName)} est presque prêt : il ne manque plus que ${esc(stepLabel)}. Ça prend environ ${esc(remaining)}.`),
    button("Terminer l'inscription", url, "#0C1509"),
    small(esc("Ton établissement reste invisible aux clients tant que l'inscription n'est pas terminée.")),
  ];

  const html = proShell({
    restaurantName,
    logoUrl: logoUrl ?? null,
    kicker: "Inscription",
    subject,
    preheader,
    body: body.join("\n"),
    footer: { reason: `Tu reçois cet e-mail parce que l'inscription de ${restaurantName} n'est pas terminée.` },
  });

  const text = `Encore une étape !

${restaurantName} est presque prêt : il ne manque plus que ${stepLabel}. Ça prend environ ${remaining}.

Terminer l'inscription : ${url}`;

  return { subject, preheader, html, text };
}
