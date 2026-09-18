import {
  button, esc, goodCard, heading, eyebrow, itemTiles, memberShell, paragraph, small, steps, strong, subheading,
  type ItemTile, type LinkFn, type MemberTheme, type RenderedEmail, type ShortMessage,
} from "./kit";

// Séquence membre « Ton premier ticket » — inscrit, aucun ticket validé.
// Trois envois au plus (J+2, J+7, J+21 après l'adhésion), puis silence : un
// client qui n'est pas revenu en trois semaines ne reviendra pas grâce à un
// quatrième e-mail, et chaque envoi sans réponse abîme la délivrabilité de
// tous les autres.
//
// Le cadeau d'accueil (ADR 0061 §4) paie la demande ; jamais « scanner »
// pour le geste ticket (CONTEXT.md, Photo du ticket), jamais d'euro sauf la
// commande minimum de retrait (ADR 0007, amendement du 2026-09-18).

export type FirstTicketData = {
  theme: MemberTheme;
  restaurantId: string;
  firstName: string | null;
  step: 1 | 2 | 3;
  // Cadeau d'accueil (welcomeReward) — null si la grille n'en a pas.
  welcomeGift: { name: string; imageUrl: string | null } | null;
  // Trois articles du catalogue « Mes points » (landingShowcase).
  showcase: ItemTile[];
  link: LinkFn;
  manageUrl: string;
  stopUrl: string;
};

const DIRECT = "Commande sur place, à emporter ou par téléphone — directement au restaurant, pas via une plateforme de livraison.";

export function firstTicketEmail(d: FirstTicketData): RenderedEmail {
  const r = d.theme.restaurantName;
  const hi = d.firstName ? `${d.firstName}, ` : "";
  const gift = d.welcomeGift?.name ?? null;
  const cta = d.link(`/r/${d.restaurantId}/submit-order`);

  const giftCard = gift
    ? goodCard({
        imageUrl: d.welcomeGift?.imageUrl,
        imageAlt: gift,
        kicker: "Offert pour ton premier ticket",
        title: gift,
        note: "À récupérer lors de ta visite suivante, avec une commande d'au moins 10 €.",
      })
    : "";

  let subject: string;
  let preheader: string;
  let body: string[];

  if (d.step === 1) {
    subject = gift
      ? `${hi}${hi ? "un" : "Un"} cadeau t'attend pour ton premier ticket chez ${r}`
      : `${hi}${hi ? "tes" : "Tes"} premiers points t'attendent chez ${r}`;
    preheader = "Un ticket de caisse en photo, et c'est parti.";
    body = [
      eyebrow("Cadeau d'accueil"),
      // Pas d'article devant le nom (« un Frites Medium ») : même tournure
      // que la vitrine, « {article} offert » (ADR 0062).
      heading(gift ? `${gift} offert pour ton premier ticket` : "Ton premier ticket lance tes points"),
      paragraph(
        `À ta prochaine commande chez ${strong(r)}, prends ton ticket de caisse en photo dans l'app. ` +
        (gift ? `Ton ${esc(gift)} t'attend au comptoir, en plus de tes premiers points.` : "Tes premiers points arrivent avec lui.")
      ),
      giftCard,
      subheading("Et à chaque ticket, des points"),
      paragraph("Tu choisis ensuite ton cadeau au catalogue « Mes points » :"),
      itemTiles(d.showcase),
      button("Prendre mon ticket en photo", cta, d.theme.primary),
      small(esc(DIRECT)),
    ];
  } else if (d.step === 2) {
    subject = `Ton ticket de caisse, c'est ta carte de fidélité ${r}`;
    preheader = gift ? `Garde-le, prends-le en photo — ton ${gift} est au bout.` : "Garde-le, prends-le en photo — tes points sont au bout.";
    body = [
      eyebrow("Comment ça marche"),
      heading("Ton ticket de caisse, c'est ta carte de fidélité"),
      paragraph(`Pas de carte à tamponner chez ${strong(r)} : ton ticket suffit.`),
      steps([
        `${strong("Commande directement au restaurant")} — sur place, à emporter ou par téléphone.`,
        `${strong("Garde ton ticket de caisse")} — celui qu'on te donne avec ta commande.`,
        `${strong("Prends-le en photo dans l'app")} — le total et le numéro de commande bien visibles.`,
      ]),
      giftCard,
      button("Prendre mon ticket en photo", cta, d.theme.primary),
    ];
  } else {
    subject = gift ? `Dernier rappel : ton ${gift} chez ${r}` : `Dernier rappel : tes points chez ${r}`;
    preheader = "On ne t'écrira plus à ce sujet.";
    body = [
      eyebrow("Dernier rappel"),
      heading(gift ? `Ton ${gift} est toujours là` : "Tes points t'attendent toujours"),
      paragraph(
        `Il suffit d'un ticket de caisse de ${strong(r)} pris en photo dans l'app. ` +
        "C'est notre dernier rappel à ce sujet : ton compte reste ouvert, ton cadeau d'accueil aussi."
      ),
      giftCard,
      button("Prendre mon ticket en photo", cta, d.theme.primary),
    ];
  }

  const html = memberShell({
    theme: d.theme,
    subject,
    preheader,
    body: body.join("\n"),
    footer: {
      reason: `Tu reçois cet e-mail parce que tu as rejoint le programme de fidélité de ${r}.`,
      manageUrl: d.manageUrl,
      stopUrl: d.stopUrl,
      stopLabel: "Ne plus recevoir ces rappels",
    },
  });

  const text = [
    subject,
    "",
    d.step === 2
      ? "Ton ticket de caisse, c'est ta carte de fidélité : commande directement au restaurant, garde ton ticket, prends-le en photo dans l'app."
      : `À ta prochaine commande chez ${r}, prends ton ticket de caisse en photo dans l'app.`,
    gift ? `Offert pour ton premier ticket : ${gift} (à récupérer lors de ta visite suivante, avec une commande d'au moins 10 €).` : "",
    "",
    `Prendre mon ticket en photo : ${cta}`,
    "",
    DIRECT,
  ].join("\n").replace(/\n{3,}/g, "\n\n");

  return { subject, preheader, html, text };
}

export function firstTicketShort(d: Pick<FirstTicketData, "theme" | "restaurantId" | "welcomeGift" | "link">): ShortMessage {
  const gift = d.welcomeGift?.name;
  return {
    title: d.theme.restaurantName,
    body: gift
      ? `🎁 Ton premier ticket t'offre ${gift}. Prends-le en photo dans l'app à ta prochaine commande.`
      : "📸 Prends ton ticket de caisse en photo à ta prochaine commande : tes premiers points t'attendent.",
    url: d.link(`/r/${d.restaurantId}/submit-order`),
  };
}
