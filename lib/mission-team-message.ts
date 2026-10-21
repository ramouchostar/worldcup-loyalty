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

import { dayLabel, makeTranslator, type Translator } from "./i18n/core";
import { fr } from "./i18n/messages/fr";

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
  /** L'idée de tournage retenue (PR K), quand elle l'est déjà : l'équipe sait quoi préparer. */
  concept?: { title: string; onsite: string };
};

export function teamMessage(i: TeamMessageInput): string {
  return teamMessageT(makeTranslator("fr", fr), i);
}

/** Le message à partager avec l'équipe, dans la langue du restaurateur (c'est SON équipe qui le lit). Fonction PURE. */
export function teamMessageT(tr: Translator, i: TeamMessageInput): string {
  const { t } = tr;
  const roles = i.roles.length ? i.roles.map((r) => tr.canon("role", r).toLowerCase()).join(", ") : t("rc.msg.rolesTbd");
  const lines: string[] = [
    t("rc.msg.hello"),
    "",
    t("rc.msg.shoot", { date: dayLabel(i.shootDate, tr.locale), time: i.startTime, name: i.providerName }),
    "",
    t("rc.msg.who", { roles }),
    "",
    t("rc.msg.plan"),
    t("rc.msg.uniform"),
    t("rc.msg.dishes"),
    t("rc.msg.dishware"),
    t("rc.msg.room"),
  ];
  if (i.concept) lines.push(t("rc.msg.concept", { title: i.concept.title, onsite: i.concept.onsite }));
  if (i.kitchen === "Non") lines.push(t("rc.msg.kitchen.no"));
  else if (i.kitchen === "Oui") lines.push(t("rc.msg.kitchen.yes"));
  else if (i.kitchen === "Partiellement") lines.push(t("rc.msg.kitchen.partly"));
  lines.push("");
  lines.push(t("rc.msg.contact", { name: i.contactName?.trim() || t("rc.msg.nameTbd"), phone: i.contactPhone?.trim() || t("rc.msg.phoneTbd") }));
  lines.push("");
  lines.push(t("rc.msg.warn"));
  return lines.join("\n");
}

export type ConceptMessageInput = { shootDate: string; startTime: string; providerName: string; title: string; onsite: string };

/**
 * Le message de précision, une fois l'idée de tournage retenue (elle l'est après le message d'équipe de J-7) :
 * ce qu'on filme et ce qu'il faut prévoir. Texte sortant : aucun montant. Fonction PURE.
 */
export function conceptMessage(i: ConceptMessageInput): string {
  return conceptMessageT(makeTranslator("fr", fr), i);
}

export function conceptMessageT(tr: Translator, i: ConceptMessageInput): string {
  const { t } = tr;
  return [
    t("rc.msg.hello"),
    "",
    t("rc.msg.conceptIntro", { date: dayLabel(i.shootDate, tr.locale), time: i.startTime, name: i.providerName, title: i.title }),
    "",
    t("rc.msg.conceptTodo", { onsite: i.onsite }),
    "",
    t("rc.msg.conceptWarn"),
  ].join("\n");
}

/** Lien WhatsApp avec le message prêt à envoyer (même mécanique que le parrainage). */
export function whatsappShareUrl(message: string): string {
  return `https://wa.me/?text=${encodeURIComponent(message)}`;
}
