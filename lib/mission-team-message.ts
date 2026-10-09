// ============================================================
// Réserver un prestataire (ADR 0084 §5) — le message d'équipe.
//
// Généré à partir du brief : le restaurateur le copie ou le partage par
// WhatsApp AU MOINS 7 jours avant le tournage. Il dit qui doit être là et ce
// qui est attendu de l'équipe — la propreté du lieu et la justesse des plats
// sont l'affaire de l'équipe, pas du prestataire.
//
// Texte sortant : jamais d'euro, jamais de montant (c'est l'équipe du
// restaurant, pas un surface de plateforme). Fonction PURE.
// ============================================================

const JOURS = ["dimanche", "lundi", "mardi", "mercredi", "jeudi", "vendredi", "samedi"] as const;
const MOIS = ["janvier", "février", "mars", "avril", "mai", "juin", "juillet", "août", "septembre", "octobre", "novembre", "décembre"] as const;

/** « mardi 20 octobre » */
export function dateLabelFr(dateISO: string): string {
  const d = new Date(`${dateISO}T12:00:00Z`);
  return `${JOURS[d.getUTCDay()]} ${d.getUTCDate()} ${MOIS[d.getUTCMonth()]}`;
}

export type TeamMessageInput = {
  shootDate: string;
  startTime: string;
  providerName: string;
  /** Rôles à convoquer (cuisinier, serveur, barman…). */
  roles: readonly string[];
  /** « Oui » / « Non » / « Partiellement » — la réponse du brief. */
  kitchen?: string;
  contactName?: string;
  contactPhone?: string;
};

export function teamMessage(i: TeamMessageInput): string {
  const roles = i.roles.length ? i.roles.map((r) => r.toLowerCase()).join(", ") : "[à choisir]";
  const lines: string[] = [
    "Salut l'équipe !",
    "",
    `Tournage le ${dateLabelFr(i.shootDate)} à ${i.startTime} avec ${i.providerName}.`,
    "",
    `Qui doit être là : ${roles}.`,
    "",
    "On prévoit :",
    "– uniforme propre et repassé",
    "– plats prêts et conformes à la carte, assiettes un peu plus remplies que d'habitude (tout paraît plus petit à la caméra)",
    "– vaisselle propre",
    "– salle rangée : tables propres, déco en place",
  ];
  if (i.kitchen === "Non") lines.push("– aucun plan en cuisine");
  else if (i.kitchen === "Oui") lines.push("– cuisine propre et rangée : elle sera filmée");
  else if (i.kitchen === "Partiellement") lines.push("– cuisine : on vous dira quelles zones sont filmées, tout le reste est propre aussi");
  lines.push("");
  lines.push(`Contact sur place : ${i.contactName?.trim() || "[prénom]"} · ${i.contactPhone?.trim() || "[téléphone]"}`);
  lines.push("");
  lines.push("Prévenez-moi dès maintenant si vous avez un empêchement ce jour-là.");
  return lines.join("\n");
}

/** Lien WhatsApp avec le message prêt à envoyer (même mécanique que le parrainage). */
export function whatsappShareUrl(message: string): string {
  return `https://wa.me/?text=${encodeURIComponent(message)}`;
}
