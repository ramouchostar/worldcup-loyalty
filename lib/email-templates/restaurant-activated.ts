import { appLink, button, esc, eyebrow, heading, paragraph, proShell, small, type RenderedEmail } from "./kit";

// Restaurateur — établissement validé et mis en ligne (ADR 0015 §6). La
// prochaine action est physique : le QR code sur les tables.

export function restaurantActivatedEmail(
  restaurantName: string,
  restaurantId: string,
  logoUrl?: string | null
): RenderedEmail {
  const qrUrl = appLink(`/admin/${restaurantId}/qr`);
  const subject = `${restaurantName} est en ligne !`;
  const preheader = "Il ne manque plus que le QR code sur tes tables.";

  const body = [
    eyebrow("Mise en ligne"),
    heading(`${restaurantName} est en ligne !`),
    paragraph(
      "Ton établissement est validé et visible par tes clients. Il ne manque plus que le QR code " +
      "sur tes tables pour recevoir tes premières commandes directes."
    ),
    button("Récupérer mon QR code", qrUrl, "#0C1509"),
    small(esc("Sticker, flyer et affiche sont générés aux couleurs de ton établissement.")),
  ];

  const html = proShell({
    restaurantName,
    logoUrl: logoUrl ?? null,
    kicker: "Mise en ligne",
    subject,
    preheader,
    body: body.join("\n"),
    footer: { reason: `Tu reçois cet e-mail parce que tu gères ${restaurantName} sur Boosteats.`, manageUrl: appLink(`/admin/${restaurantId}`), manageLabel: "Ma console" },
  });

  const text = `${restaurantName} est en ligne !

Ton établissement est validé et visible par tes clients. Il ne manque plus que le QR code
sur tes tables pour recevoir tes premières commandes directes.

Récupérer mon QR code : ${qrUrl}`;

  return { subject, preheader, html, text };
}
