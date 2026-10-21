import { button, esc, eyebrow, heading, paragraph, proShell, small, type RenderedEmail } from "./kit";
import { getT, type Locale, type MessageKey } from "../i18n";
import type { Metier } from "../mission-money";

// Prestataire — un brief vient d'arriver (ADR 0084). Court : ce que c'est, de
// qui, et le bouton. Le détail du brief vit dans l'espace (jamais dans un
// e-mail : il contient des pièces et des décisions du restaurateur).
// ADR 0084 §5 terdecies — dans la langue du prestataire (français par défaut).

export function providerBriefReceivedEmail(providerName: string, restaurantName: string, goal: string | null, missionUrl: string, metier: Metier = "video", locale: Locale = "fr"): RenderedEmail {
  const { t } = getT(locale);
  const subject = t("em.brief.subject", { restaurant: restaurantName });
  const preheader = goal ? t("em.brief.pre.goal", { goal }) : t("em.brief.pre.nogoal");
  const p1 = t("em.brief.p1", { name: providerName, goal: goal ? t("em.brief.goal", { goal }) : "" });
  const note = t("em.brief.note");
  const cta = t("em.brief.cta");
  const title = t("em.brief.title", { restaurant: restaurantName, wants: t(`em.brief.wants.${metier}` as MessageKey) });

  const body = [eyebrow(t("em.brief.eyebrow")), heading(title), paragraph(esc(p1)), button(cta, missionUrl, "#0C1509"), small(esc(note))];

  const html = proShell({
    restaurantName: "Boosteats",
    logoUrl: null,
    kicker: t("em.brief.eyebrow"),
    subject,
    preheader,
    body: body.join("\n"),
    footer: { reason: t("em.brief.footer") },
    brandLine: t("em.brand"),
  });

  const text = `${subject}

${p1}

${cta} : ${missionUrl}

${note}`;

  return { subject, preheader, html, text };
}
