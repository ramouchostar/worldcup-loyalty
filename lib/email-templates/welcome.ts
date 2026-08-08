import { emailShell, emailHeading, emailParagraph, emailButton, emailDivider, emailFootNote } from "./layout";

// Email de bienvenue — envoyé une seule fois, juste après que le membre a
// complété son profil (registerProfile()), avant même qu'il ait rejoint un
// établissement.

const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? "https://worldcup-loyalty.vercel.app";

export function welcomeEmail(displayName: string): { subject: string; html: string; text: string } {
  const joinUrl = `${APP_URL}/join`;
  const firstName = displayName.trim().split(/\s+/)[0] || displayName.trim();

  const subject = `Bienvenue chez Boosteats, ${firstName} !`;

  const html = emailShell(subject, [
    emailHeading(`Bienvenue, ${firstName} !`),
    emailParagraph(
      "Ton compte est prêt. Boosteats te permet de commander directement chez tes restaurants " +
      "préférés — en salle ou par téléphone — et de gagner des cadeaux à chaque commande, " +
      "seul ou avec ton équipe."
    ),
    emailParagraph("Prochaine étape : choisis ton restaurant pour rejoindre son réseau."),
    emailButton("Choisir mon restaurant →", joinUrl),
    emailDivider(),
    emailFootNote("Gratuit, sans carte bancaire, sans abonnement caché — et ça ne changera jamais."),
  ].join("\n"));

  const text = `Bienvenue, ${firstName} !

Ton compte Boosteats est prêt. Commande directement chez tes restaurants préférés
et gagne des cadeaux à chaque commande, seul ou avec ton équipe.

Choisis ton restaurant : ${joinUrl}

Gratuit, sans carte bancaire, sans abonnement caché.`;

  return { subject, html, text };
}
