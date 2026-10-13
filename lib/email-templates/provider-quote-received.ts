import { button, esc, eyebrow, heading, paragraph, proShell, small, type RenderedEmail } from "./kit";

// Restaurateur — le prestataire vient de répondre à son brief avec un devis (ADR 0084). Sans cet
// e-mail, le restaurateur ne le saurait qu'en rouvrant la console. Le prix n'est PAS dans
// l'e-mail : il dépend du plan et se lit dans la console, là où l'on peut décliner.

export function providerQuoteReceivedEmail(restaurantName: string, providerName: string, missionUrl: string): RenderedEmail {
  const subject = `${providerName} t'a envoyé son devis`;
  const preheader = "Son prix est ferme pour ton brief.";

  const body = [
    eyebrow("Devis reçu"),
    heading(`${providerName} a répondu à ton brief`),
    paragraph(esc(`Son devis est prêt : le prix, ce qui est inclus et ce qui ne l'est pas, le temps de travail et le délai de livraison. Son prix est ferme pour le brief que tu as envoyé.`)),
    button("Lire le devis", missionUrl, "#0C1509"),
    small(esc("Tu ne paies rien en lisant le devis. Tu peux l'accepter ou le décliner sans frais.")),
  ];

  const html = proShell({
    restaurantName,
    logoUrl: null,
    kicker: "Devis reçu",
    subject,
    preheader,
    body: body.join("\n"),
    footer: { reason: `Tu reçois cet e-mail parce que tu as envoyé un brief à ${providerName} depuis la console de ${restaurantName}.` },
  });

  const text = `${providerName} a répondu à ton brief

Son devis est prêt : le prix, ce qui est inclus et ce qui ne l'est pas, le temps de
travail et le délai de livraison. Son prix est ferme pour le brief envoyé.

Lire le devis : ${missionUrl}

Tu ne paies rien en lisant le devis. Tu peux l'accepter ou le décliner sans frais.`;

  return { subject, preheader, html, text };
}
