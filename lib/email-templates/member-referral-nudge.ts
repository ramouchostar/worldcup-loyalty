import {
  button, esc, eyebrow, heading, memberShell, paragraph, progress, softCard, strong,
  type LinkFn, type MemberTheme, type RenderedEmail, type ShortMessage,
} from "./kit";

// Séquence membre « Invite tes amis » — le lendemain d'un cadeau récupéré,
// une fois par cadeau. Le moment est choisi : le membre vient de VIVRE la
// promesse du programme, c'est l'instant où il la raconte le mieux.
//
// Mécanique inchangée (CONTEXT.md, Parrainage) : lien unique partagé par
// WhatsApp, 5 amis inscrits = 1 jeton, 4 jetons = 1 cadeau. Les actions
// sociales (1 jeton chacune) sont proposées à côté : 20 inscriptions pour un
// cadeau est un horizon lointain, un avis Google est à une minute.

export type ReferralNudgeData = {
  theme: MemberTheme;
  restaurantId: string;
  firstName: string | null;
  redeemedGift: string; // le cadeau qu'il vient de récupérer
  jetons: number; // jetons validés (0–3 dans le cycle en cours)
  friendsTowardNext: number; // inscriptions comptées vers le prochain jeton (0–4)
  jetonsGift: string; // cadeau des 4 jetons (restaurants.jetons_gift_menu_item_id)
  whatsappUrl: string; // buildWhatsappShareUrl(buildJoinUrl(...))
  socialActionsLeft: number; // actions sociales encore faisables
  link: LinkFn;
  manageUrl: string;
  stopUrl: string;
};

export function referralNudgeEmail(d: ReferralNudgeData): RenderedEmail {
  const r = d.theme.restaurantName;
  const subject = `Content de ton ${d.redeemedGift} ? Fais-en profiter tes amis`;
  const preheader = `Chaque fois que 5 amis s'inscrivent, tu gagnes un jeton. 4 jetons = ${d.jetonsGift} offert.`;
  const cycleJetons = d.jetons % 4;

  const body = [
    eyebrow("Parrainage"),
    heading("Invite tes amis, gagne des jetons"),
    paragraph(
      `${d.firstName ? `${esc(d.firstName)}, tu` : "Tu"} viens de récupérer ton ${strong(d.redeemedGift)} chez ${strong(r)}. ` +
      "Partage ton lien : chaque fois que 5 amis s'inscrivent, tu gagnes un jeton."
    ),
    softCard(
      `<strong style="color:#17170F;">${cycleJetons} jeton${cycleJetons > 1 ? "s" : ""} sur 4</strong> — à 4, ${esc(d.jetonsGift)} offert.`
    ),
    progress(cycleJetons / 4, `${d.friendsTowardNext} ami${d.friendsTowardNext > 1 ? "s" : ""} inscrit${d.friendsTowardNext > 1 ? "s" : ""} sur 5 pour ton prochain jeton`),
    button("Partager mon lien sur WhatsApp", d.whatsappUrl, d.theme.primary),
    d.socialActionsLeft > 0
      ? softCard(
          `${strong("Plus rapide :")} suis ${esc(r)} sur Instagram ou laisse un avis Google — un jeton chacun. ` +
          `<a href="${esc(d.link(`/r/${d.restaurantId}/micro-rewards`))}" style="color:#17170F; font-weight:700;">Voir les actions →</a>`
        )
      : "",
  ];

  const html = memberShell({
    theme: d.theme,
    subject,
    preheader,
    body: body.join("\n"),
    footer: {
      reason: `Tu reçois cet e-mail parce que tu viens de récupérer un cadeau chez ${r}.`,
      manageUrl: d.manageUrl,
      stopUrl: d.stopUrl,
      stopLabel: "Ne plus recevoir ces suggestions",
    },
  });

  const text = [
    subject,
    "",
    `Partage ton lien : chaque fois que 5 amis s'inscrivent chez ${r}, tu gagnes un jeton. 4 jetons = ${d.jetonsGift} offert.`,
    `Tu as ${cycleJetons} jeton(s) sur 4 ; ${d.friendsTowardNext} ami(s) inscrit(s) sur 5 pour le prochain.`,
    "",
    `Partager sur WhatsApp : ${d.whatsappUrl}`,
  ].join("\n");

  return { subject, preheader, html, text };
}

export function referralNudgeShort(d: Pick<ReferralNudgeData, "theme" | "restaurantId" | "redeemedGift" | "jetonsGift" | "link">): ShortMessage {
  return {
    title: d.theme.restaurantName,
    body: `🎉 Content de ton ${d.redeemedGift} ? Invite tes amis : 5 inscrits = 1 jeton, 4 jetons = ${d.jetonsGift} offert.`,
    url: d.link(`/r/${d.restaurantId}/micro-rewards`),
  };
}
