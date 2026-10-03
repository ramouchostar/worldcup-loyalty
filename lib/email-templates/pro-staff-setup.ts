import { button, esc, eyebrow, heading, paragraph, proShell, small, softCard, steps, type LinkFn, type RenderedEmail, type ShortMessage } from "./kit";

// Séquence restaurateur « Crée les QR de ton équipe » (ADR 0077 §1) —
// établissement mis en ligne qui n'a AUCUN QR d'équipe, à J+7, J+14 et J+30
// après sa mise en ligne, puis silence. S'arrête au premier QR créé.
// Trois angles, pas trois fois le même e-mail : l'invitation, le comment,
// le dernier rappel court.

export type StaffSetupData = {
  restaurantName: string;
  restaurantId: string;
  logoUrl: string | null;
  step: 1 | 2 | 3;
  link: LinkFn;
  manageUrl: string;
  stopUrl: string;
};

const SUBJECTS: Record<1 | 2 | 3, string> = {
  1: "Ton équipe en salle n'a pas encore ses QR",
  2: "Trois gestes pour que ton équipe fasse inscrire tes clients",
  3: "Dernier rappel : les QR de ton équipe",
};

export function staffSetupPath(restaurantId: string): string {
  return `/admin/${restaurantId}/qr?creer=1#equipe`;
}

export function staffSetupEmail(d: StaffSetupData): RenderedEmail {
  const r = d.restaurantName;
  const url = d.link(staffSetupPath(d.restaurantId));
  const subject = SUBJECTS[d.step];
  const preheader =
    d.step === 3
      ? "Une minute par prénom. Ensuite, on ne t'en parle plus."
      : "Un QR par prénom : tu vois qui, dans ton équipe, fait inscrire des clients.";

  const body =
    d.step === 1
      ? [
          eyebrow("Équipe en salle"),
          heading("Ton équipe peut faire inscrire tes clients dès ce soir"),
          paragraph(
            `${esc(r)} est en ligne depuis une semaine. Dans nos établissements, la personne à la caisse qui montre son QR est la première source d'inscriptions.`
          ),
          softCard(
            esc("Un QR par prénom, une minute par personne. Tu imprimes la planche A4, chacun garde sa carte près de la caisse, et tu vois qui fait inscrire le plus.")
          ),
          button("Créer les QR de mon équipe", url, "#0C1509"),
        ]
      : d.step === 2
        ? [
            eyebrow("Équipe en salle"),
            heading("Trois gestes, et ton équipe recrute pour toi"),
            steps([
              `<strong style="color:#17170F;">Crée un QR par prénom</strong> dans ta console. Pas de compte à créer pour eux.`,
              `<strong style="color:#17170F;">Imprime la planche A4</strong> : six cartes par feuille, le prénom sous chaque QR.`,
              `<strong style="color:#17170F;">Chacun montre sa carte</strong> au client qui paie, avec la phrase prête sur le badge.`,
            ]),
            paragraph(esc("Chaque mois, tu reçois le classement : qui a fait inscrire le plus de clients, et qui a besoin d'un coup de pouce.")),
            button("Créer les QR de mon équipe", url, "#0C1509"),
          ]
        : [
            eyebrow("Équipe en salle"),
            heading("Dernier rappel pour les QR de ton équipe"),
            paragraph(esc(`Personne chez ${r} n'a encore son QR. Une minute par prénom, et tu sauras qui amène des clients.`)),
            button("Créer les QR de mon équipe", url, "#0C1509"),
            small(esc("C'est le dernier e-mail sur ce sujet. Le rappel reste sur l'accueil de ta console.")),
          ];

  const html = proShell({
    restaurantName: r,
    logoUrl: d.logoUrl,
    kicker: "Équipe en salle",
    subject,
    preheader,
    body: body.join("\n"),
    footer: {
      reason: `Tu reçois cet e-mail parce que tu gères ${r} sur Boosteats.`,
      manageUrl: d.manageUrl,
      stopUrl: d.stopUrl,
      stopLabel: "Ne plus recevoir ce rappel",
    },
  });

  const text = [
    subject,
    "",
    d.step === 2
      ? "1. Crée un QR par prénom dans ta console.\n2. Imprime la planche A4 (six cartes par feuille).\n3. Chacun montre sa carte au client qui paie."
      : "Un QR par prénom, une minute par personne. Tu vois qui, dans ton équipe, fait inscrire des clients.",
    "",
    `Créer les QR de mon équipe : ${url}`,
  ].join("\n");

  return { subject, preheader, html, text };
}

// Le push du même envoi (ADR 0077 §2) : deux lignes, l'appui ouvre la création.
export function staffSetupShort(d: { restaurantId: string; step: 1 | 2 | 3; link: LinkFn }): ShortMessage {
  const body =
    d.step === 3
      ? "Dernier rappel : une minute par prénom pour que ton équipe fasse inscrire tes clients."
      : "Ton équipe n'a pas encore ses QR. Une minute par personne : ce sont eux qui font inscrire tes clients.";
  return { title: "Équipe en salle", body, url: d.link(staffSetupPath(d.restaurantId)) };
}
