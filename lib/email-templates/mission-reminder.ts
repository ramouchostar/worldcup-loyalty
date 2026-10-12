import { button, esc, eyebrow, heading, paragraph, proShell, small, type RenderedEmail } from "./kit";
import { PROVIDER_BRAND_LINE } from "./provider-invite";

// Les rappels d'un tournage (ADR 0084 §5) : J-7, J-2 et la veille, vers le restaurateur et vers le
// prestataire, plus l'alerte vers la plateforme quand une présence n'est pas confirmée. Courts : ce
// qu'on attend de la personne, le lien, et c'est tout.

export type MissionReminderInput = {
  key: "j7" | "j2" | "veille" | "alerte";
  audience: "restaurant" | "provider" | "platform";
  /** Le destinataire. */
  recipientName: string;
  /** L'autre partie : le prestataire pour le restaurateur, le restaurant pour le prestataire. */
  otherName: string;
  restaurantName: string;
  dateLabel: string;
  startTime: string;
  contact: string;
  url: string;
  /** Veille : la présence de l'autre partie est-elle confirmée ? */
  otherConfirmed?: boolean;
  /** Veille : le destinataire a-t-il lui-même confirmé ? */
  selfConfirmed?: boolean;
  /** Alerte : qui n'a pas confirmé. */
  missing?: string[];
};

type Copy = { subject: string; preheader: string; title: string; paragraphs: string[]; cta: string; note: string };

function copyFor(i: MissionReminderInput): Copy {
  const when = `${i.dateLabel} à ${i.startTime}`;
  if (i.key === "alerte") {
    return {
      subject: `Présence non confirmée : ${i.restaurantName}, ${i.dateLabel}`,
      preheader: `Il manque : ${(i.missing ?? []).join(", ")}.`,
      title: "Tournage demain, présence non confirmée",
      paragraphs: [`${i.restaurantName} et ${i.otherName} tournent ${when}. Il manque la confirmation de : ${(i.missing ?? []).join(", ")}.`, "À rappeler aujourd'hui : un tournage annulé à la dernière minute est dû en entier."],
      cta: "Voir la mission",
      note: "Alerte envoyée une seule fois, la veille du tournage.",
    };
  }
  if (i.audience === "restaurant") {
    if (i.key === "j7") {
      return {
        subject: `Préviens ton équipe : tournage ${i.dateLabel}`,
        preheader: "C'est dans 7 jours : le bon moment pour prévenir tout le monde.",
        title: "Ton équipe est-elle prévenue ?",
        paragraphs: [`Le tournage avec ${i.otherName} a lieu ${when}, dans 7 jours. Certains de tes employés (les étudiants surtout) ne travaillent pas toute la semaine : à deux jours, c'est trop tard.`, "Le message est prêt à partager (copier ou WhatsApp) dans ta console."],
        cta: "Prévenir mon équipe",
        note: "Tu reçois ce rappel une seule fois, tant que l'équipe n'est pas marquée comme prévenue.",
      };
    }
    if (i.key === "j2") {
      return {
        subject: `Confirme ta présence : tournage ${i.dateLabel}`,
        preheader: "Dans 2 jours. Un clic suffit.",
        title: "Tu seras là ?",
        paragraphs: [`Le tournage avec ${i.otherName} a lieu ${when}, dans 2 jours. Confirme que tout est prêt : équipe prévenue, plats, vaisselle propre, contact sur place joignable.`],
        cta: "Confirmer ma présence",
        note: "Un tournage annulé à moins de 48 h est dû en entier.",
      };
    }
    return {
      subject: `Demain, ${when} : ${i.otherName} vient filmer`,
      preheader: `Contact sur place : ${i.contact}`,
      title: "C'est demain",
      paragraphs: [`${i.otherName} arrive demain, ${when}. Ton contact sur place : ${i.contact}.`, i.selfConfirmed ? (i.otherConfirmed ? "Vous avez tous les deux confirmé. Bon tournage." : `${i.otherName} n'a pas encore confirmé sa présence : on le relance.`) : "Tu n'as pas encore confirmé ta présence : un clic suffit.", "Rappel : assiettes un peu plus remplies que d'habitude, uniformes propres, vaisselle propre."],
      cta: i.selfConfirmed ? "Voir la mission" : "Confirmer ma présence",
      note: "Dernier rappel avant le tournage.",
    };
  }
  // Prestataire
  if (i.key === "j2") {
    return {
      subject: `Confirme ta présence : ${i.restaurantName}, ${i.dateLabel}`,
      preheader: "Dans 2 jours. Un clic suffit.",
      title: "Tu seras là ?",
      paragraphs: [`Tu tournes chez ${i.restaurantName} ${when}, dans 2 jours. Confirme que tu seras là, avec le matériel prévu (batteries, lumière).`, `Contact sur place : ${i.contact}.`],
      cta: "Confirmer ma présence",
      note: "Une absence le jour J est un manquement : la mission est remboursée au restaurateur et ta visibilité en pâtit.",
    };
  }
  return {
    subject: `Demain, ${when} : ${i.restaurantName}`,
    preheader: `Contact sur place : ${i.contact}`,
    title: "Tu tournes demain",
    paragraphs: [`${i.restaurantName}, ${when}. Contact sur place : ${i.contact}.`, i.selfConfirmed ? (i.otherConfirmed ? "Le restaurateur a confirmé : tout est prêt." : "Le restaurateur n'a pas encore confirmé : on le relance.") : "Tu n'as pas encore confirmé ta présence : un clic suffit."],
    cta: i.selfConfirmed ? "Voir la mission" : "Confirmer ma présence",
    note: "Dernier rappel avant le tournage.",
  };
}

export function missionReminderEmail(i: MissionReminderInput): RenderedEmail {
  const c = copyFor(i);
  const fromProvider = i.audience === "provider";
  const body = [
    eyebrow("Rappel"),
    heading(c.title),
    ...c.paragraphs.map((p) => paragraph(esc(p))),
    button(c.cta, i.url, "#0C1509"),
    small(esc(c.note)),
  ];
  const html = proShell({
    restaurantName: i.audience === "restaurant" ? i.restaurantName : "Boosteats",
    logoUrl: null,
    kicker: "Rappel de tournage",
    subject: c.subject,
    preheader: c.preheader,
    body: body.join("\n"),
    footer: { reason: i.audience === "platform" ? "Tu reçois cette alerte en tant que plateforme Boosteats." : `Tu reçois ce rappel parce qu'un tournage est réservé sur Boosteats${i.audience === "restaurant" ? ` pour ${i.restaurantName}` : ""}.` },
    ...(fromProvider ? { brandLine: PROVIDER_BRAND_LINE } : {}),
  });
  const text = `${c.title}

${c.paragraphs.join("\n\n")}

${c.cta} : ${i.url}

${c.note}`;
  return { subject: c.subject, preheader: c.preheader, html, text };
}
