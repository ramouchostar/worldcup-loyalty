import { button, esc, eyebrow, heading, paragraph, proShell, small, steps, strong, type RenderedEmail } from "./kit";
import { ADMIN_ROLE_LABELS, type AdminRole } from "../restaurant-admin-roles";

// Restaurateur — lien d'invitation à la console (ADR 0032, rôle ADR 0041).
// Le destinataire n'a souvent pas encore de compte : pas de lien de
// gestion, seulement ce qu'il y a à faire, dans l'ordre, et jusqu'à quand.
// Le rôle proposé est dit dès l'e-mail (un manager ajouté par le gérant
// doit savoir qu'il rejoint l'équipe d'un établissement, pas qu'on lui en
// confie un). Les étapes suivent le vrai parcours : /invite/<jeton> →
// « Créer mon compte » (e-mail + mot de passe, ou Google) → confirmation
// éventuelle → retour sur l'invitation (cookie, même navigateur) →
// « Activer mon espace restaurateur ».

export function ownerInviteEmail(
  restaurantName: string,
  inviteUrl: string,
  expiresAt: string,
  logoUrl?: string | null,
  role?: AdminRole | null,
  email?: string | null
): RenderedEmail {
  const deadline = new Date(expiresAt).toLocaleDateString("fr-BE", { day: "numeric", month: "long", year: "numeric" });
  const roleLabel = role ? ADMIN_ROLE_LABELS[role] : null;
  const subject = role && role !== "gerant"
    ? `Tu es invité comme ${roleLabel?.toLowerCase()} de ${restaurantName}`
    : `Ton espace restaurateur pour ${restaurantName}`;
  const preheader = `Trois étapes pour te connecter. Lien personnel, valable jusqu'au ${deadline}.`;

  const roleLine = roleLabel
    ? `Tu es ajouté à l'équipe de ${restaurantName} avec le rôle ${roleLabel}. `
    : "";
  const accountHint = email
    ? `Choisis « Créer mon compte » et inscris-toi avec ${strong(email)} (e-mail et mot de passe, ou le bouton Google). Déjà un compte ? « J'ai déjà un compte ».`
    : `Choisis « Créer mon compte » (e-mail et mot de passe, ou le bouton Google). Déjà un compte ? « J'ai déjà un compte ».`;

  const body = [
    eyebrow("Invitation"),
    heading(subject),
    paragraph(esc(`${roleLine}Tu auras accès à la console de l'établissement : tickets des clients, cadeaux, idées de la brigade et chiffres.`)),
    steps([
      `Appuie sur le bouton ${strong("Activer mon espace restaurateur")} ci-dessous.`,
      `${accountHint} Si on te demande de confirmer ton e-mail, ouvre le message reçu, de préférence sur le même téléphone.`,
      `Tu reviens sur l'invitation : appuie sur ${strong("Activer mon espace restaurateur")}. Ta console s'ouvre.`,
    ]),
    button("Activer mon espace restaurateur", inviteUrl, "#0C1509"),
    small(esc(`Ensuite, pour revenir : boosteats.be/login, avec la même adresse. Tu ne retombes pas sur l'invitation après l'inscription ? Rouvre ce lien, connecté. Lien personnel, utilisable une seule fois, valable jusqu'au ${deadline}.`)),
  ];

  const html = proShell({
    restaurantName,
    logoUrl: logoUrl ?? null,
    kicker: "Invitation",
    subject,
    preheader,
    body: body.join("\n"),
    footer: { reason: `Tu reçois cet e-mail parce qu'on t'a invité à gérer ${restaurantName} sur Boosteats.` },
  });

  const text = `${subject}

${roleLine}Tu auras accès à la console de l'établissement : tickets des clients, cadeaux, idées de la brigade et chiffres.

1. Ouvre ce lien : ${inviteUrl}
2. Choisis « Créer mon compte »${email ? ` et inscris-toi avec ${email}` : ""} (e-mail et mot de passe, ou le bouton Google). Déjà un compte ? « J'ai déjà un compte ». Si on te demande de confirmer ton e-mail, ouvre le message reçu, de préférence sur le même téléphone.
3. Tu reviens sur l'invitation : appuie sur « Activer mon espace restaurateur ». Ta console s'ouvre.

Ensuite, pour revenir : boosteats.be/login, avec la même adresse.
Tu ne retombes pas sur l'invitation après l'inscription ? Rouvre le lien, connecté.
Lien personnel, utilisable une seule fois, valable jusqu'au ${deadline}.`;

  return { subject, preheader, html, text };
}
