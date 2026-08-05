// Blocs HTML partagés entre tous les templates email — évite de répéter le
// même tableau de compatibilité (styles inline, structure <table>) dans
// chaque fichier. Couleurs du kit Boosteats par défaut (globals.css /
// lib/branding.ts) : ni les emails membres ni les emails restaurateur ne
// sont scopés à un établissement précis, donc pas de charte personnalisée ici.

export const EMAIL_COLORS = {
  pageBg: "#EFF1E4",
  cardBg: "#FFFFFF",
  dark: "#0C1509",
  accent: "#6B7C3F",
  accentLight: "#A9BB6E",
  heading: "#14210D",
  body: "#4B5546",
  muted: "#8A9280",
  border: "#E5E7DC",
  warnBg: "#FBF3E4",
  warnBorder: "#E3C98C",
  warnText: "#7A5B12",
} as const;

// Enveloppe complète (<html>...<table>...) autour d'un bloc de contenu déjà
// construit avec les helpers ci-dessous (emailParagraph, emailButton...).
// logoUrl : logo de l'établissement (restaurants.logo_url) quand l'email est
// scopé à un resto qui en a configuré un (lib/branding.ts) — remplace le
// wordmark Boosteats générique dans l'en-tête. Absent (email membre sans
// contexte resto, ex. bienvenue, ou resto sans logo) → wordmark par défaut.
export function emailShell(subject: string, contentHtml: string, logoUrl?: string | null): string {
  const header = logoUrl
    ? `<img src="${logoUrl}" alt="Logo" height="32" style="height:32px; max-height:32px; width:auto; display:block; border:0;" />`
    : `<span style="color:#FFFFFF; font-size:20px; font-weight:900; letter-spacing:0.02em;">Boosteats</span>`;

  return `<!DOCTYPE html>
<html lang="fr">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>${subject}</title>
  </head>
  <body style="margin:0; padding:0; background-color:${EMAIL_COLORS.pageBg}; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:${EMAIL_COLORS.pageBg}; padding:32px 16px;">
      <tr>
        <td align="center">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:480px; background-color:${EMAIL_COLORS.cardBg}; border-radius:16px; overflow:hidden;">
            <tr>
              <td style="background-color:${EMAIL_COLORS.dark}; padding:28px 32px;">
                ${header}
              </td>
            </tr>
            <tr>
              <td style="padding:32px;">
                ${contentHtml}
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;
}

export function emailHeading(text: string): string {
  return `<h1 style="margin:0 0 16px; color:${EMAIL_COLORS.heading}; font-size:24px; font-weight:900; line-height:1.25;">${text}</h1>`;
}

export function emailParagraph(html: string): string {
  return `<p style="margin:0 0 16px; color:${EMAIL_COLORS.body}; font-size:15px; line-height:1.6;">${html}</p>`;
}

export function emailButton(label: string, url: string): string {
  return `<table role="presentation" cellpadding="0" cellspacing="0">
  <tr>
    <td style="border-radius:12px; background-color:${EMAIL_COLORS.accent};">
      <a href="${url}" style="display:inline-block; padding:14px 28px; color:#FFFFFF; font-size:15px; font-weight:700; text-decoration:none;">${label}</a>
    </td>
  </tr>
</table>`;
}

export function emailDivider(): string {
  return `<hr style="margin:32px 0 20px; border:none; border-top:1px solid ${EMAIL_COLORS.border};" />`;
}

export function emailFootNote(html: string): string {
  return `<p style="margin:0; color:${EMAIL_COLORS.muted}; font-size:12px; line-height:1.6;">${html}</p>`;
}

// Encart d'alerte discret (relances, seuils dépassés) — jamais alarmiste,
// juste visuellement distinct d'un paragraphe normal.
export function emailCallout(html: string): string {
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 20px;">
  <tr>
    <td style="background-color:${EMAIL_COLORS.warnBg}; border:1px solid ${EMAIL_COLORS.warnBorder}; border-radius:10px; padding:14px 16px; color:${EMAIL_COLORS.warnText}; font-size:14px; line-height:1.55;">${html}</td>
  </tr>
</table>`;
}
