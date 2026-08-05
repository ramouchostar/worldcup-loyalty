import { emailShell, emailHeading, emailParagraph, emailButton, emailCallout, emailDivider, emailFootNote } from "./layout";

// Restaurateur — rappel de validation des demandes clients en attente
// (commandes suspectes + actions sociales, ADR 0008/0019). Envoyé
// uniquement quand ça vaut le coup de déranger : une demande bloquée depuis
// plus de 48h, ou plus de 15 en attente en même temps (cf. logique de
// déclenchement dans le cron, pas ici — ce template ne fait que le rendu).

const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? "https://worldcup-loyalty.vercel.app";

export function pendingRequestsReminderEmail(
  restaurantName: string,
  restaurantId: string,
  totalPending: number,
  oldestPendingHours: number,
  logoUrl?: string | null
): { subject: string; html: string; text: string } {
  const dashboardUrl = `${APP_URL}/admin/${restaurantId}`;
  const subject = `${restaurantName} — ${totalPending} demande${totalPending > 1 ? "s" : ""} en attente`;

  const oldestLabel =
    oldestPendingHours >= 48
      ? `${Math.floor(oldestPendingHours / 24)} jour${Math.floor(oldestPendingHours / 24) > 1 ? "s" : ""}`
      : `${Math.round(oldestPendingHours)}h`;

  const html = emailShell(subject, [
    emailHeading("Quelques demandes t'attendent"),
    emailParagraph(
      `${totalPending} demande${totalPending > 1 ? "s" : ""} client${totalPending > 1 ? "s" : ""} ` +
      `(commandes à vérifier ou actions sociales) attende${totalPending > 1 ? "nt" : ""} ta validation ` +
      `— la plus ancienne depuis ${oldestLabel}.`
    ),
    emailCallout(
      "Ça prend en général moins de 2 minutes : chaque demande s'affiche avec la photo du ticket ou " +
      "l'action à vérifier, un seul bouton pour valider ou rejeter."
    ),
    emailButton("Traiter les demandes →", dashboardUrl),
    emailDivider(),
    emailFootNote(
      "Tu ne reçois cet email que lorsque ça s'accumule (plus de 15 demandes, ou une bloquée depuis " +
      "plus de 48h) — jamais pour une simple demande isolée."
    ),
  ].join("\n"), logoUrl);

  const text = `Quelques demandes t'attendent

${totalPending} demande(s) client(s) (commandes à vérifier ou actions sociales) attendent ta
validation — la plus ancienne depuis ${oldestLabel}.

Ça prend en général moins de 2 minutes par demande.

Traiter les demandes : ${dashboardUrl}`;

  return { subject, html, text };
}
