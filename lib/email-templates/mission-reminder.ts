import { button, esc, eyebrow, heading, paragraph, proShell, small, type RenderedEmail } from "./kit";
import { dayLabel, getT, type Locale, type Translator } from "../i18n";

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
  /** Le jour en ISO : dit dans la langue du destinataire PRESTATAIRE (sinon `dateLabel`, en français). */
  dateISO?: string;
  /** La langue du destinataire, prestataire ou restaurateur (français par défaut). */
  locale?: Locale;
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
  // Prestataire : voir `providerCopy` (dictionnaires).
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

/** Le rappel que reçoit le restaurateur (J-7, J-2, veille), dans sa langue. */
function restaurantCopy(i: MissionReminderInput, tr: Translator): Copy {
  const { t } = tr;
  const date = i.dateISO ? dayLabel(i.dateISO, tr.locale) : i.dateLabel;
  const when = t("emrm.when", { date, time: i.startTime });
  const v = { date, when, other: i.otherName, contact: i.contact };
  if (i.key === "j7") {
    return { subject: t("emrm.j7.subject", v), preheader: t("emrm.j7.pre"), title: t("emrm.j7.title"), paragraphs: [t("emrm.j7.p1", v), t("emrm.j7.p2")], cta: t("emrm.j7.cta"), note: t("emrm.j7.note") };
  }
  if (i.key === "j2") {
    return { subject: t("emrm.j2.subject", v), preheader: t("emrm.j2.pre"), title: t("emrm.j2.title"), paragraphs: [t("emrm.j2.p1", v)], cta: t("emrm.j2.cta"), note: t("emrm.j2.note") };
  }
  return {
    subject: t("emrm.veille.subject", v),
    preheader: t("emrm.veille.pre", v),
    title: t("emrm.veille.title"),
    paragraphs: [t("emrm.veille.p1", v), i.selfConfirmed ? (i.otherConfirmed ? t("emrm.veille.p2.both") : t("emrm.veille.p2.selfOnly", v)) : t("emrm.veille.p2.none"), t("emrm.veille.p3")],
    cta: i.selfConfirmed ? t("emrm.veille.cta.view") : t("emrm.veille.cta.confirm"),
    note: t("emrm.veille.note"),
  };
}

/** Le rappel que reçoit le prestataire (J-2, veille), dans sa langue. */
function providerCopy(i: MissionReminderInput, tr: Translator): Copy {
  const { t } = tr;
  const date = i.dateISO ? dayLabel(i.dateISO, tr.locale) : i.dateLabel;
  const when = t("em.reminder.when", { date, time: i.startTime });
  const v = { restaurant: i.restaurantName, date, when, contact: i.contact };
  if (i.key === "j2") {
    return {
      subject: t("em.reminder.j2.subject", v),
      preheader: t("em.reminder.j2.pre"),
      title: t("em.reminder.j2.title"),
      paragraphs: [t("em.reminder.j2.p1", v), t("em.reminder.j2.p2", v)],
      cta: t("em.reminder.j2.cta"),
      note: t("em.reminder.j2.note"),
    };
  }
  return {
    subject: t("em.reminder.veille.subject", v),
    preheader: t("em.reminder.veille.pre", v),
    title: t("em.reminder.veille.title"),
    paragraphs: [t("em.reminder.veille.p1", v), i.selfConfirmed ? (i.otherConfirmed ? t("em.reminder.veille.p2.both") : t("em.reminder.veille.p2.selfOnly")) : t("em.reminder.veille.p2.none")],
    cta: i.selfConfirmed ? t("em.reminder.veille.cta.view") : t("em.reminder.veille.cta.confirm"),
    note: t("em.reminder.veille.note"),
  };
}

export function missionReminderEmail(i: MissionReminderInput): RenderedEmail {
  const fromProvider = i.audience === "provider" && i.key !== "alerte" && i.key !== "j7";
  const tr = getT(i.locale);
  const fromRestaurant = i.audience === "restaurant" && i.key !== "alerte";
  const c = fromProvider ? providerCopy(i, tr) : fromRestaurant ? restaurantCopy(i, tr) : copyFor(i);
  const body = [
    eyebrow(fromProvider || fromRestaurant ? tr.t("em.reminder.eyebrow") : "Rappel"),
    heading(c.title),
    ...c.paragraphs.map((p) => paragraph(esc(p))),
    button(c.cta, i.url, "#0C1509"),
    small(esc(c.note)),
  ];
  const html = proShell({
    restaurantName: i.audience === "restaurant" ? i.restaurantName : "Boosteats",
    logoUrl: null,
    kicker: fromProvider || fromRestaurant ? tr.t("em.reminder.kicker") : "Rappel de tournage",
    subject: c.subject,
    preheader: c.preheader,
    body: body.join("\n"),
    footer: { reason: i.audience === "platform" ? "Tu reçois cette alerte en tant que plateforme Boosteats." : fromProvider ? tr.t("em.reminder.footer") : fromRestaurant ? tr.t("emrm.footer", { restaurant: i.restaurantName }) : "Tu reçois ce rappel parce qu'un tournage est réservé sur Boosteats." },
    ...(fromProvider ? { brandLine: tr.t("em.brand") } : {}),
  });
  const text = `${c.title}

${c.paragraphs.join("\n\n")}

${c.cta} : ${i.url}

${c.note}`;
  return { subject: c.subject, preheader: c.preheader, html, text };
}
