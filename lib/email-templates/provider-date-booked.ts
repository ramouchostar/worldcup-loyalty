import { button, esc, eyebrow, heading, paragraph, proShell, small, type RenderedEmail } from "./kit";
import { PROVIDER_BRAND_LINE } from "./provider-invite";

// Prestataire — un restaurateur vient de réserver sa date (ADR 0084 §5). Le jour est bloqué dans
// son calendrier : il le sait par e-mail, avec le lieu, l'heure et le contact sur place.

export function providerDateBookedEmail(input: {
  providerName: string;
  restaurantName: string;
  dateLabel: string;
  startTime: string;
  contact: string;
  missionUrl: string;
}): RenderedEmail {
  const { providerName, restaurantName, dateLabel, startTime, contact, missionUrl } = input;
  const subject = `Date réservée : ${dateLabel} chez ${restaurantName}`;
  const preheader = `${startTime} · contact sur place : ${contact}`;

  const body = [
    eyebrow("Date réservée"),
    heading(`${dateLabel} à ${startTime}`),
    paragraph(esc(`Bonjour ${providerName}, ${restaurantName} a choisi sa date. Le jour est bloqué dans ton calendrier : le restaurateur est engagé, et toi aussi.`)),
    paragraph(esc(`Contact sur place : ${contact}.`)),
    button("Voir la mission", missionUrl, "#0C1509"),
    small(esc("Tu recevras un rappel pour confirmer ta présence deux jours avant. Un tournage annulé à moins de 48 h est dû en entier.")),
  ];

  const html = proShell({
    restaurantName: "Boosteats",
    logoUrl: null,
    kicker: "Date réservée",
    subject,
    preheader,
    body: body.join("\n"),
    footer: { reason: "Tu reçois cet e-mail parce qu'un restaurateur a réservé une date avec toi sur Boosteats." },
    brandLine: PROVIDER_BRAND_LINE,
  });

  const text = `Date réservée : ${dateLabel} à ${startTime}

Bonjour ${providerName}, ${restaurantName} a choisi sa date. Le jour est bloqué dans
ton calendrier : le restaurateur est engagé, et toi aussi.

Contact sur place : ${contact}.

Voir la mission : ${missionUrl}

Tu recevras un rappel pour confirmer ta présence deux jours avant.`;

  return { subject, preheader, html, text };
}
