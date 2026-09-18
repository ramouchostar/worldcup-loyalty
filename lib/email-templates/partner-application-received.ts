import { appLink, button, esc, eyebrow, heading, paragraph, proShell, small, strong, type RenderedEmail } from "./kit";

// Restaurateur — candidature self-service reçue (ADR 0015 §6). Il reste la
// carte puis un ticket exemple (ADR 0019) avant la validation plateforme.

export function partnerApplicationReceivedEmail(
  restaurantName: string,
  restaurantId: string,
  logoUrl?: string | null
): RenderedEmail {
  const menuUrl = appLink(`/become-a-partner/${restaurantId}/menu`);
  const subject = `${restaurantName} — ta candidature est bien reçue`;
  const preheader = "Deux étapes rapides avant la mise en ligne : ta carte, puis un ticket exemple.";

  const body = [
    eyebrow("Candidature reçue"),
    heading("C'est parti !"),
    paragraph(
      `${strong(restaurantName)} est enregistré. Il reste deux étapes rapides avant la mise en ligne : ` +
      "ta carte (pour calibrer les cadeaux), puis un ticket exemple."
    ),
    button("Continuer l'inscription", menuUrl, "#0C1509"),
    small(esc("Ton établissement reste invisible aux clients jusqu'à validation par notre équipe — un contrôle qualité rapide, pas un long processus commercial.")),
  ];

  const html = proShell({
    restaurantName,
    logoUrl: logoUrl ?? null,
    kicker: "Inscription",
    subject,
    preheader,
    body: body.join("\n"),
    footer: { reason: `Tu reçois cet e-mail parce que tu viens d'inscrire ${restaurantName} sur Boosteats.` },
  });

  const text = `C'est parti !

${restaurantName} est enregistré. Il reste deux étapes rapides avant la mise en ligne :
ta carte (pour calibrer les cadeaux), puis un ticket exemple.

Continuer l'inscription : ${menuUrl}

Ton établissement reste invisible aux clients jusqu'à validation par notre équipe.`;

  return { subject, preheader, html, text };
}
