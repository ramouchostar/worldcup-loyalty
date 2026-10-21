import { button, esc, eyebrow, heading, paragraph, proShell, small, type RenderedEmail } from "./kit";
import { getT, type Locale } from "../i18n";

// Restaurateur — le prestataire vient de répondre à son brief avec un devis (ADR 0084). Sans cet
// e-mail, le restaurateur ne le saurait qu'en rouvrant la console. Le prix n'est PAS dans
// l'e-mail : il dépend du plan et se lit dans la console, là où l'on peut décliner.

export function providerQuoteReceivedEmail(restaurantName: string, providerName: string, missionUrl: string, locale?: Locale): RenderedEmail {
  const { t } = getT(locale);
  const v = { restaurant: restaurantName, provider: providerName };
  const subject = t("emq.subject", v);
  const preheader = t("emq.pre");

  const body = [eyebrow(t("emq.eyebrow")), heading(t("emq.title", v)), paragraph(esc(t("emq.p1"))), button(t("emq.cta"), missionUrl, "#0C1509"), small(esc(t("emq.note")))];

  const html = proShell({
    restaurantName,
    logoUrl: null,
    kicker: t("emq.eyebrow"),
    subject,
    preheader,
    body: body.join("\n"),
    footer: { reason: t("emq.footer", v) },
  });

  const text = `${t("emq.title", v)}\n\n${t("emq.p1")}\n\n${t("emq.cta")} : ${missionUrl}\n\n${t("emq.note")}`;

  return { subject, preheader, html, text };
}
