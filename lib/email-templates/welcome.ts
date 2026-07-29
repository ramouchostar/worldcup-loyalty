// Template email de bienvenue — HTML brut avec styles inline (compatibilité
// clients mail), aux couleurs du kit Boosteats (globals.css / lib/branding.ts).
// Envoyé une seule fois, juste après que le membre a complété son profil
// (registerProfile()) — avant même qu'il ait rejoint un établissement, donc
// pas de charte par restaurant ici, uniquement les couleurs par défaut.

const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? "https://worldcup-loyalty.vercel.app";

const COLORS = {
  pageBg: "#EFF1E4",
  cardBg: "#FFFFFF",
  dark: "#0C1509",
  accent: "#6B7C3F",
  accentLight: "#A9BB6E",
  heading: "#14210D",
  body: "#4B5546",
  muted: "#8A9280",
};

export function welcomeEmail(displayName: string): { subject: string; html: string; text: string } {
  const joinUrl = `${APP_URL}/join`;
  const firstName = displayName.trim().split(/\s+/)[0] || displayName.trim();

  const subject = `Bienvenue chez Boosteats, ${firstName} !`;

  const html = `<!DOCTYPE html>
<html lang="fr">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>${subject}</title>
  </head>
  <body style="margin:0; padding:0; background-color:${COLORS.pageBg}; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:${COLORS.pageBg}; padding:32px 16px;">
      <tr>
        <td align="center">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:480px; background-color:${COLORS.cardBg}; border-radius:16px; overflow:hidden;">
            <!-- Header -->
            <tr>
              <td style="background-color:${COLORS.dark}; padding:28px 32px;">
                <span style="color:#FFFFFF; font-size:20px; font-weight:900; letter-spacing:0.02em;">Boosteats</span>
              </td>
            </tr>
            <!-- Body -->
            <tr>
              <td style="padding:32px;">
                <h1 style="margin:0 0 16px; color:${COLORS.heading}; font-size:24px; font-weight:900; line-height:1.25;">
                  Bienvenue, ${firstName} !
                </h1>
                <p style="margin:0 0 16px; color:${COLORS.body}; font-size:15px; line-height:1.6;">
                  Ton compte est prêt. Boosteats te permet de commander directement chez tes restaurants
                  préférés — en salle ou par téléphone — et de gagner des cadeaux à chaque commande,
                  seul ou avec ton équipe.
                </p>
                <p style="margin:0 0 24px; color:${COLORS.body}; font-size:15px; line-height:1.6;">
                  Prochaine étape : choisis ton restaurant pour rejoindre son réseau.
                </p>

                <table role="presentation" cellpadding="0" cellspacing="0">
                  <tr>
                    <td style="border-radius:12px; background-color:${COLORS.accent};">
                      <a href="${joinUrl}" style="display:inline-block; padding:14px 28px; color:#FFFFFF; font-size:15px; font-weight:700; text-decoration:none;">
                        Choisir mon restaurant →
                      </a>
                    </td>
                  </tr>
                </table>

                <hr style="margin:32px 0 20px; border:none; border-top:1px solid #E5E7DC;" />

                <p style="margin:0; color:${COLORS.muted}; font-size:12px; line-height:1.6;">
                  Gratuit, sans carte bancaire, sans abonnement caché — et ça ne changera jamais.
                </p>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;

  const text = `Bienvenue, ${firstName} !

Ton compte Boosteats est prêt. Commande directement chez tes restaurants préférés
et gagne des cadeaux à chaque commande, seul ou avec ton équipe.

Choisis ton restaurant : ${joinUrl}

Gratuit, sans carte bancaire, sans abonnement caché.`;

  return { subject, html, text };
}
