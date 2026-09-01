import { emailShell, emailHeading, emailParagraph, emailButton, emailCallout, emailDivider, emailFootNote } from "./layout";

// Restaurateur — rappel « articles de tickets absents du catalogue »
// (ADR 0046). Envoyé UNE fois par semaine au plus, et seulement quand des
// libellés récurrents traînent depuis plus de 7 jours (la logique de
// déclenchement vit dans le cron — ce template ne fait que le rendu).

const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? "https://worldcup-loyalty.vercel.app";

export function catalogGapsReminderEmail(
  restaurantName: string,
  restaurantId: string,
  gapCount: number,
  logoUrl?: string | null
): { subject: string; html: string; text: string } {
  const menuUrl = `${APP_URL}/admin/${restaurantId}/menu#rattacher`;
  const plural = gapCount > 1;
  const subject = `${restaurantName} — ${gapCount} article${plural ? "s" : ""} de tes tickets à ajouter au catalogue`;

  const html = emailShell(subject, [
    emailHeading("Tes chiffres de marge ont des trous"),
    emailParagraph(
      `${gapCount} article${plural ? "s" : ""} revien${plural ? "nent" : "t"} sur tes tickets sans exister dans ton catalogue — ` +
      `${plural ? "ils sont ignorés" : "il est ignoré"} par tes ventes par plat et tes marges.`
    ),
    emailCallout(
      "Ça prend quelques secondes : le nom et le prix de vente sont déjà pré-remplis depuis tes tickets, " +
      "il ne manque que ton prix de revient. Tout l'historique est repris automatiquement."
    ),
    emailButton("Compléter mon catalogue →", menuUrl),
    emailDivider(),
    emailFootNote(
      "Tu ne reçois cet email qu'une fois par semaine au plus, et seulement quand des articles récurrents " +
      "restent sans rattachement depuis plus de 7 jours."
    ),
  ].join("\n"), logoUrl);

  const text = `Tes chiffres de marge ont des trous

${gapCount} article${plural ? "s" : ""} de tes tickets ${plural ? "sont absents" : "est absent"} de ton catalogue.
Nom et prix déjà pré-remplis — il ne manque que ton prix de revient : ${menuUrl}`;

  return { subject, html, text };
}
