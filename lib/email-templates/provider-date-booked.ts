import { button, esc, eyebrow, heading, paragraph, proShell, small, type RenderedEmail } from "./kit";
import { dayLabel, getT, type Locale } from "../i18n";

// Prestataire — un restaurateur vient de réserver sa date (ADR 0084 §5). Le jour est bloqué dans
// son calendrier : il le sait par e-mail, avec le lieu, l'heure et le contact sur place.
// ADR 0084 §5 terdecies — dans la langue du prestataire : `dateISO` (si donné) est dit dans sa langue, sinon `dateLabel` (français).

export function providerDateBookedEmail(input: {
  providerName: string;
  restaurantName: string;
  dateLabel: string;
  /** Le jour en ISO (« 2026-10-22 ») : dit dans la langue du prestataire. */
  dateISO?: string;
  startTime: string;
  contact: string;
  missionUrl: string;
  locale?: Locale;
}): RenderedEmail {
  const { providerName, restaurantName, startTime, contact, missionUrl } = input;
  const locale = input.locale ?? "fr";
  const { t } = getT(locale);
  const date = input.dateISO ? dayLabel(input.dateISO, locale) : input.dateLabel;
  const v = { name: providerName, restaurant: restaurantName, date, time: startTime, contact };
  const subject = t("em.date.subject", v);
  const preheader = t("em.date.pre", v);
  const title = t("em.date.title", v);
  const p1 = t("em.date.p1", v);
  const p2 = t("em.date.p2", v);
  const cta = t("em.date.cta");
  const note = t("em.date.note");

  const body = [eyebrow(t("em.date.eyebrow")), heading(title), paragraph(esc(p1)), paragraph(esc(p2)), button(cta, missionUrl, "#0C1509"), small(esc(note))];

  const html = proShell({
    restaurantName: "Boosteats",
    logoUrl: null,
    kicker: t("em.date.eyebrow"),
    subject,
    preheader,
    body: body.join("\n"),
    footer: { reason: t("em.date.footer") },
    brandLine: t("em.brand"),
  });

  const text = `${title}

${p1}

${p2}

${cta} : ${missionUrl}

${note}`;

  return { subject, preheader, html, text };
}
