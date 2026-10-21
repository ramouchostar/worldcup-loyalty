import { button, esc, eyebrow, heading, paragraph, proShell, small, type RenderedEmail } from "./kit";
import { LOCALE_TAG, getT, type Locale } from "../i18n";

// Prestataire — lien d'invitation à son espace (ADR 0084). Le destinataire n'a
// souvent pas encore de compte : ce qu'on lui propose, ce qu'il doit faire, et
// jusqu'à quand. Le lien est lié à CETTE adresse : on le dit, pour qu'il ne le
// transfère pas et qu'il se connecte avec la bonne.
// ADR 0084 §5 terdecies — dans la langue fixée pour ce prestataire (français par défaut).

export const PROVIDER_BRAND_LINE = "Boosteats · des prestataires de confiance pour les restaurateurs";

export function providerInviteEmail(name: string, inviteUrl: string, expiresAt: string, email: string, locale: Locale = "fr"): RenderedEmail {
  const { t } = getT(locale);
  const deadline = new Date(expiresAt).toLocaleDateString(LOCALE_TAG[locale], { day: "numeric", month: "long", year: "numeric" });
  const subject = t("em.invite.subject");
  const preheader = t("em.invite.pre", { deadline });
  const p1 = t("em.invite.p1", { name });
  const p2 = t("em.invite.p2");
  const note = t("em.invite.note", { email, deadline });
  const cta = t("em.invite.cta");

  const body = [eyebrow(t("em.invite.eyebrow")), heading(t("em.invite.title")), paragraph(esc(p1)), paragraph(esc(p2)), button(cta, inviteUrl, "#0C1509"), small(esc(note))];

  const html = proShell({
    restaurantName: "Boosteats",
    logoUrl: null,
    kicker: t("em.invite.eyebrow"),
    subject,
    preheader,
    body: body.join("\n"),
    footer: { reason: t("em.invite.footer") },
    brandLine: t("em.brand"),
  });

  const text = `${t("em.invite.title")}

${p1} ${p2}

${cta} : ${inviteUrl}

${note}`;

  return { subject, preheader, html, text };
}
