import { button, esc, eyebrow, heading, paragraph, proShell, small, type RenderedEmail } from "./kit";
import { PROVIDER_BRAND_LINE } from "./provider-invite";
import type { Metier } from "../mission-money";

// Prestataire — un brief vient d'arriver (ADR 0084). Court : ce que c'est, de
// qui, et le bouton. Le détail du brief vit dans l'espace (jamais dans un
// e-mail : il contient des pièces et des décisions du restaurateur).

const WANTS: Record<Metier, string> = { video: "veut une vidéo", photo: "veut des photos", design: "veut un visuel", impression: "veut une impression" };

export function providerBriefReceivedEmail(providerName: string, restaurantName: string, goal: string | null, missionUrl: string, metier: Metier = "video"): RenderedEmail {
  const subject = `Nouveau brief de ${restaurantName}`;
  const preheader = goal ? `${goal} — à chiffrer.` : "À chiffrer.";

  const body = [
    eyebrow("Nouveau brief"),
    heading(`${restaurantName} ${WANTS[metier]}`),
    paragraph(esc(`Bonjour ${providerName}, un brief complet et verrouillé t'attend${goal ? ` : « ${goal} »` : ""}. Lis-le, puis fais ton devis ou dis-nous pourquoi tu ne peux pas.`)),
    button("Lire le brief", missionUrl, "#0C1509"),
    small(esc("Ton prix sera ferme pour ce brief. Si le restaurateur le change ensuite, c'est une demande de modification que tu chiffres ou refuses.")),
  ];

  const html = proShell({
    restaurantName: "Boosteats",
    logoUrl: null,
    kicker: "Nouveau brief",
    subject,
    preheader,
    body: body.join("\n"),
    footer: { reason: "Tu reçois cet e-mail parce qu'un restaurateur t'a envoyé un brief sur Boosteats." },
    brandLine: PROVIDER_BRAND_LINE,
  });

  const text = `Nouveau brief de ${restaurantName}

Bonjour ${providerName}, un brief complet et verrouillé t'attend${goal ? ` : « ${goal} »` : ""}.
Lis-le, puis fais ton devis ou dis-nous pourquoi tu ne peux pas.

Lire le brief : ${missionUrl}

Ton prix sera ferme pour ce brief.`;

  return { subject, preheader, html, text };
}
