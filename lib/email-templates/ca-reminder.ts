import { appLink, button, esc, eyebrow, heading, paragraph, proShell, small, softCard, type RenderedEmail } from "./kit";
import { dayLabel } from "../daily-revenue-model";
import { reminderTargetDay, reminderText, type PlannedReminder } from "../daily-revenue-reminders";

// Restaurateur — rappel du CA du jour (ADR 0087 §4). Même texte que la
// notification, un bouton qui ouvre la saisie du bon jour. Le rappel du
// dimanche liste les jours manquants, un bouton par jour.

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

export function caReminderEmail(restaurantName: string, restaurantId: string, r: PlannedReminder, logoUrl?: string | null): RenderedEmail {
  const t = reminderText(r);
  const base = `/admin/${restaurantId}/ca`;
  const subject = t.subject;
  const preheader = t.body;

  const body: string[] = [eyebrow("CA du jour")];
  const textLines: string[] = [];
  if (r.slot === "semaine") {
    const days = r.days ?? [];
    body.push(
      heading(t.title),
      paragraph(esc("Complète-les pour que ta comparaison de lundi soit juste. Chaque jour prend 30 secondes.")),
      ...days.map((d) => button(`Saisir ${cap(dayLabel(d))}`, appLink(`${base}/${d}`), "#0C1509")),
    );
    textLines.push(t.title, "", ...days.map((d) => `${cap(dayLabel(d))} : ${appLink(`${base}/${d}`)}`));
  } else {
    const url = appLink(`${base}/${reminderTargetDay(r)}`);
    body.push(
      heading(`Ton chiffre du ${dayLabel(r.day)}`),
      paragraph(esc(t.body)),
      softCard(esc("Par canal (Uber Eats, Deliveroo, Takeaway, à emporter, sur place) ou le total directement : comme tu préfères. Tu vois tout de suite ta semaine comparée à la précédente.")),
      button(`Noter le CA du ${dayLabel(r.day)}`, url, "#0C1509"),
    );
    textLines.push(t.title, "", t.body, "", `Noter le CA : ${url}`);
  }
  body.push(small(esc("Tu reçois ce rappel parce que le chiffre n'est pas encore noté. Il s'arrête dès que tu le saisis.")));

  const html = proShell({
    restaurantName,
    logoUrl: logoUrl ?? null,
    kicker: "CA du jour",
    subject,
    preheader,
    body: body.join("\n"),
    footer: {
      reason: `Tu reçois cet e-mail parce que tu gères ${restaurantName} sur Boosteats.`,
      manageUrl: appLink(`/admin/${restaurantId}`),
      manageLabel: "Ma console",
    },
  });

  return { subject, preheader, html, text: textLines.join("\n") };
}
