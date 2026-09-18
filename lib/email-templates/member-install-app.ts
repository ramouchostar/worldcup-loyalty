import {
  button, esc, eyebrow, goodCard, heading, memberShell, paragraph, small, steps, strong, subheading,
  formatInt, type LinkFn, type MemberTheme, type RenderedEmail,
} from "./kit";

// Séquence membre « Installe l'app » — e-mail uniquement (sans l'app, pas de
// push : c'est tout le sujet). Deux envois au plus : 3 jours après le premier
// ticket validé (il a une raison de revenir), puis 30 jours après si rien.
// Signal d'installation : member_app_installs (ADR 0038, complété le
// 2026-08-22) — non rétroactif, d'où le lien « C'est déjà fait » qui sort
// le membre de la séquence.
//
// Argument = ce qu'il a déjà (ses points, un article à sa portée), jamais
// le confort d'usage (ADR 0049 §2 : le cadeau paie la demande).

export type InstallAppData = {
  theme: MemberTheme;
  restaurantId: string;
  firstName: string | null;
  points: number; // solde « Mes points » disponible
  // Article le plus généreux déjà à sa portée, sinon le prochain.
  target: { name: string; imageUrl: string | null; reachable: boolean; missing?: number } | null;
  link: LinkFn;
  manageUrl: string;
  doneUrl: string; // « C'est déjà fait » — sort de la séquence
};

export function installAppEmail(d: InstallAppData): RenderedEmail {
  const r = d.theme.restaurantName;
  const subject = `Tes ${formatInt(d.points)} points ${r}, à un tap de ton écran d'accueil`;
  const preheader = "Pas de store, pas de téléchargement : l'app s'ajoute en 10 secondes.";
  const open = d.link(`/r/${d.restaurantId}/dashboard?installer=1`);

  const target = d.target
    ? d.target.reachable
      ? goodCard({ imageUrl: d.target.imageUrl, imageAlt: d.target.name, kicker: "Tu peux déjà avoir", title: d.target.name, note: "Avec tes points, au catalogue « Mes points »." })
      : goodCard({ imageUrl: d.target.imageUrl, imageAlt: d.target.name, kicker: `Plus que ${formatInt(d.target.missing ?? 0)} points pour`, title: d.target.name })
    : "";

  const body = [
    eyebrow(`L'app ${r}`),
    heading(`Garde ${r} sur ton écran d'accueil`),
    paragraph(
      `${d.firstName ? `${esc(d.firstName)}, tu` : "Tu"} as ${strong(`${formatInt(d.points)} points`)}. ` +
      "Avec l'app, tu les retrouves en un tap au comptoir — et on te prévient quand un cadeau t'attend."
    ),
    target,
    subheading("Sur iPhone"),
    steps([
      "Ouvre le lien ci-dessous <strong style=\"color:#17170F;\">dans Safari</strong>.",
      "Touche <strong style=\"color:#17170F;\">Partager</strong> (le carré avec une flèche vers le haut).",
      "Choisis <strong style=\"color:#17170F;\">« Sur l'écran d'accueil »</strong>.",
    ]),
    subheading("Sur Android"),
    paragraph("Ouvre le lien et touche <strong style=\"color:#17170F;\">« Installer l'app »</strong>."),
    button(`Ouvrir l'app ${r}`, open, d.theme.primary),
    small(`Pas de store, pas de téléchargement. Déjà installée ? <a href="${esc(d.doneUrl)}" style="color:#7C7D72;">C'est déjà fait</a>.`),
  ];

  const html = memberShell({
    theme: d.theme,
    subject,
    preheader,
    body: body.join("\n"),
    footer: {
      reason: `Tu reçois cet e-mail parce que tu es membre du programme de fidélité de ${r}.`,
      manageUrl: d.manageUrl,
      stopUrl: d.doneUrl,
      stopLabel: "Ne plus me le proposer",
    },
  });

  const text = [
    subject,
    "",
    `Tu as ${formatInt(d.points)} points chez ${r}. Avec l'app, tu les retrouves en un tap au comptoir.`,
    "",
    "Sur iPhone : ouvre le lien dans Safari, touche Partager, puis « Sur l'écran d'accueil ».",
    "Sur Android : ouvre le lien et touche « Installer l'app ».",
    "",
    `Ouvrir l'app : ${open}`,
  ].join("\n");

  return { subject, preheader, html, text };
}
