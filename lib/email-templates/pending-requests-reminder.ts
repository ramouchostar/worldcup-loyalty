import { appLink, button, esc, eyebrow, heading, paragraph, proShell, small, softCard, type RenderedEmail } from "./kit";

// Restaurateur — demandes clients en attente (tickets en file, actions
// sociales). Envoyé seulement quand ça vaut le coup de déranger : plus de
// 15 demandes, ou une bloquée depuis plus de 48 h (règle dans le cron).

export function pendingRequestsReminderEmail(
  restaurantName: string,
  restaurantId: string,
  totalPending: number,
  oldestPendingHours: number,
  logoUrl?: string | null
): RenderedEmail {
  const url = appLink(`/admin/${restaurantId}/orders`);
  const plural = totalPending > 1;
  const days = Math.floor(oldestPendingHours / 24);
  const oldest = oldestPendingHours >= 48 ? `${days} jour${days > 1 ? "s" : ""}` : `${Math.round(oldestPendingHours)} h`;
  const subject = `${restaurantName} — ${totalPending} demande${plural ? "s" : ""} en attente`;
  const preheader = `La plus ancienne attend depuis ${oldest}.`;

  const body = [
    eyebrow("À traiter"),
    heading("Quelques demandes t'attendent"),
    paragraph(
      `${totalPending} demande${plural ? "s" : ""} de clients (tickets à vérifier ou actions sociales) ` +
      `attende${plural ? "nt" : ""} ta décision — la plus ancienne depuis ${esc(oldest)}.`
    ),
    softCard(esc("Moins de 2 minutes en général : chaque demande s'affiche avec la photo du ticket ou l'action à vérifier, un bouton pour accepter, un pour refuser.")),
    button("Traiter les demandes", url, "#0C1509"),
    small(esc("Tu ne reçois cet e-mail que quand ça s'accumule (plus de 15 demandes, ou une bloquée depuis plus de 48 h) — jamais pour une demande isolée.")),
  ];

  const html = proShell({
    restaurantName,
    logoUrl: logoUrl ?? null,
    kicker: "Demandes en attente",
    subject,
    preheader,
    body: body.join("\n"),
    footer: { reason: `Tu reçois cet e-mail parce que tu gères ${restaurantName} sur Boosteats.`, manageUrl: appLink(`/admin/${restaurantId}`), manageLabel: "Ma console" },
  });

  const text = `Quelques demandes t'attendent

${totalPending} demande(s) de clients attendent ta décision — la plus ancienne depuis ${oldest}.

Traiter les demandes : ${url}`;

  return { subject, preheader, html, text };
}
