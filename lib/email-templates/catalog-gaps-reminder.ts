import { appLink, button, esc, eyebrow, heading, paragraph, proShell, small, softCard, type RenderedEmail } from "./kit";

// Restaurateur — articles vus sur les tickets mais absents du catalogue
// (ADR 0046 §5) : une fois par semaine au plus, après 7 jours d'inaction.

export function catalogGapsReminderEmail(
  restaurantName: string,
  restaurantId: string,
  gapCount: number,
  logoUrl?: string | null
): RenderedEmail {
  const url = appLink(`/admin/${restaurantId}/menu#rattacher`);
  const plural = gapCount > 1;
  const subject = `${restaurantName} — ${gapCount} article${plural ? "s" : ""} de tes tickets à ajouter au catalogue`;
  const preheader = "Nom et prix déjà remplis depuis tes tickets : il ne manque que ton prix de revient.";

  const body = [
    eyebrow("Catalogue"),
    heading("Tes chiffres de marge ont des trous"),
    paragraph(
      `${gapCount} article${plural ? "s" : ""} revien${plural ? "nent" : "t"} sur tes tickets sans exister dans ton catalogue : ` +
      `${plural ? "ils sont ignorés" : "il est ignoré"} dans tes ventes par plat et tes marges.`
    ),
    softCard(esc("Quelques secondes par article : le nom et le prix de vente sont déjà remplis depuis tes tickets, il ne manque que ton prix de revient. Tout l'historique est repris.")),
    button("Compléter mon catalogue", url, "#0C1509"),
    small(esc("Au plus une fois par semaine, et seulement quand des articles récurrents restent sans rattachement depuis plus de 7 jours.")),
  ];

  const html = proShell({
    restaurantName,
    logoUrl: logoUrl ?? null,
    kicker: "Catalogue",
    subject,
    preheader,
    body: body.join("\n"),
    footer: { reason: `Tu reçois cet e-mail parce que tu gères ${restaurantName} sur Boosteats.`, manageUrl: appLink(`/admin/${restaurantId}`), manageLabel: "Ma console" },
  });

  const text = `Tes chiffres de marge ont des trous

${gapCount} article(s) de tes tickets ${plural ? "sont absents" : "est absent"} de ton catalogue.
Nom et prix déjà remplis — il ne manque que ton prix de revient : ${url}`;

  return { subject, preheader, html, text };
}
