import { dayLabel, type Locale, type MessageKey, type Translator } from "../i18n";
import type { MissionUpdateInput } from "./mission-update";

// ============================================================
// Les e-mails de mise à jour d'une mission que REÇOIT LE PRESTATAIRE, dans sa langue (ADR 0084 §5 terdecies).
//
// Même texte que `mission-update.ts` en français (un test le vérifie, cas par cas) ; les e-mails du restaurateur et de la plateforme
// restent dans `mission-update.ts` jusqu'au lot « côté restaurateur ». Retourne `null` pour un e-mail qui n'est pas pour le prestataire.
// ============================================================

export type ProviderCopy = { subject: string; preheader: string; title: string; paragraphs: string[]; cta: string; note: string };

const k = (s: string) => s as MessageKey;

/** « jeudi 22 octobre » : le jour ISO s'il est donné (dans la langue du lecteur), sinon le libellé français déjà formaté. */
export function deadlineText(i: Pick<MissionUpdateInput, "deadlineDay" | "deadlineLabel">, locale: Locale): string | undefined {
  return i.deadlineDay ? dayLabel(i.deadlineDay, locale) : i.deadlineLabel;
}

export function providerCopy(i: MissionUpdateInput, tr: Translator): ProviderCopy | null {
  if (i.audience !== "provider") return null;
  const { t } = tr;
  const v = { restaurant: i.restaurantName, provider: i.providerName };
  const deadline = deadlineText(i, tr.locale);
  const pick = (base: string, parts: Record<string, unknown>, extra: Record<string, string | number> = {}) => ({
    subject: t(k(`${base}.subject`), { ...v, ...extra }),
    preheader: t(k(`${base}.pre`), { ...v, ...extra }),
    title: t(k(`${base}.title`), { ...v, ...extra }),
    ...parts,
  });
  const simple = (base: string, extra: Record<string, string | number> = {}, paragraphs: string[] = ["p1"]): ProviderCopy => ({
    ...pick(base, {}, extra),
    paragraphs: paragraphs.map((p) => t(k(`${base}.${p}`), { ...v, ...extra })),
    cta: t(k(`${base}.cta`)),
    note: t(k(`${base}.note`)),
  });

  switch (i.kind) {
    case "validated":
      return simple("em.validated");
    case "retouch_requested": {
      const round = i.round ?? 1;
      return { ...simple("em.retouch_requested", { round }, ["p1", "p2"]), note: t(round === 2 ? "em.retouch_requested.note.last" : "em.retouch_requested.note.more") };
    }
    case "auto_validated":
      return simple("em.auto_validated");
    case "studio_start": {
      const wish = deadline ? t("em.studio_start.wish", { deadline }) : "";
      return {
        subject: t("em.studio_start.subject", v),
        preheader: deadline ? t("em.studio_start.pre.date", { deadline }) : t("em.studio_start.pre.nodate"),
        title: t("em.studio_start.title"),
        paragraphs: [t("em.studio_start.p1", { ...v, wish }), t("em.studio_start.p2")],
        cta: t("em.studio_start.cta"),
        note: t("em.studio_start.note"),
      };
    }
    case "studio_deliver":
      return {
        subject: t("em.studio_deliver.subject", v),
        preheader: deadline ? t("em.studio_deliver.pre.date", { deadline }) : t("em.studio_deliver.pre.nodate"),
        title: t("em.studio_deliver.title"),
        paragraphs: [t("em.studio_deliver.p1", { ...v, when: deadline ?? t("em.studio_deliver.soon") })],
        cta: t("em.studio_deliver.cta"),
        note: t("em.studio_deliver.note"),
      };
    case "studio_overdue":
      return {
        subject: t("em.studio_overdue.subject", v),
        preheader: t("em.studio_overdue.pre"),
        title: t("em.studio_overdue.title"),
        paragraphs: [t("em.studio_overdue.p1", { ...v, forDate: deadline ? t("em.studio_overdue.forDate", { deadline }) : "" })],
        cta: t("em.studio_overdue.cta"),
        note: t("em.studio_overdue.note"),
      };
    case "bat_corrections_due":
      return simple("em.bat_corrections_due");
    case "message_received":
      return simple("em.message_received");
    case "bat_corrections": {
      const count = i.count ?? 1;
      return {
        subject: tr.tp("em.bat_corrections.subject", count, { ...v, count }),
        preheader: t("em.bat_corrections.pre"),
        title: t("em.bat_corrections.title"),
        paragraphs: [t("em.bat_corrections.p1", v)],
        cta: t("em.bat_corrections.cta"),
        note: t("em.bat_corrections.note"),
      };
    }
    case "bat_signed":
      return simple("em.bat_signed");
    case "cancelled":
      return cancelled(i, tr);
    case "dispute_opened":
      return simple("em.dispute_opened", {}, ["p1", "p2"]);
    case "dispute_resolved": {
      const d = i.decision ?? "pay";
      const pct = i.providerPct ?? 0;
      const body = t(k(`em.dispute_resolved.${d}`), { pct });
      return {
        subject: t("em.dispute_resolved.subject", v),
        preheader: body,
        title: t("em.dispute_resolved.title"),
        paragraphs: [body, t("em.dispute_resolved.p2")],
        cta: t("em.dispute_resolved.cta"),
        note: t("em.dispute_resolved.note"),
      };
    }
    case "paid_out":
      return simple("em.paid_out");
    case "proposals_again":
      return {
        subject: t("em.proposals_again.subject", v),
        preheader: deadline ? t("em.proposals_again.pre.date", { deadline }) : t("em.proposals_again.pre.nodate"),
        title: t("em.proposals_again.title"),
        paragraphs: [t("em.proposals_again.p1", v), t("em.proposals_again.p2")],
        cta: t("em.proposals_again.cta"),
        note: deadline ? t("em.proposals_again.note.date", { deadline }) : t("em.proposals_again.note.nodate"),
      };
    case "proposal_chosen": {
      const title = i.title ?? t("em.proposal_chosen.yourIdea");
      return {
        subject: t("em.proposal_chosen.subject", { ...v, title }),
        preheader: t("em.proposal_chosen.pre"),
        title: t("em.proposal_chosen.title"),
        paragraphs: [t("em.proposal_chosen.p1", { ...v, title: i.title ?? "" })],
        cta: t("em.proposal_chosen.cta"),
        note: t("em.proposal_chosen.note"),
      };
    }
    case "proposal_auto": {
      const reason = t(i.auto === "fallback" ? "em.proposal_auto.reason.fallback" : "em.proposal_auto.reason.auto");
      return {
        subject: t("em.proposal_auto.subject", { title: i.title ?? "" }),
        preheader: t("em.proposal_auto.pre"),
        title: t("em.proposal_auto.title"),
        paragraphs: [t("em.proposal_auto.p1", { ...v, reason, title: i.title ?? "" })],
        cta: t("em.proposal_auto.cta"),
        note: t("em.proposal_auto.note"),
      };
    }
    case "proposals_due":
      return {
        subject: t("em.proposals_due.subject", v),
        preheader: deadline ? t("em.proposals_due.pre.date", { deadline }) : t("em.proposals_due.pre.nodate"),
        title: t("em.proposals_due.title"),
        paragraphs: [t("em.proposals_due.p1", v)],
        cta: t("em.proposals_due.cta"),
        note: t("em.proposals_due.note"),
      };
    case "change_requested":
      return simple("em.change_requested", {}, ["p1", "p2"]);
    case "change_accepted":
      return { ...simple("em.change_accepted", { what: t(i.free ? "em.change_accepted.what.free" : "em.change_accepted.what.paid") }) };
    case "change_restaurant_declined":
      return simple("em.change_restaurant_declined");
    case "change_withdrawn":
      return simple("em.change_withdrawn");
    case "change_expired":
      return simple("em.change_expired", {}, ["p1", "p2"]);
    default:
      return null;
  }
}

function cancelled(i: MissionUpdateInput, tr: Translator): ProviderCopy {
  const { t } = tr;
  const by = i.cancelledBy ?? "restaurant";
  const band = i.band ?? "free";
  const v = { restaurant: i.restaurantName };
  const fromRestaurant = by === "restaurant";
  if (i.studio) {
    const started = band === "deposit";
    const when = t(started ? "em.cancelled.studio.when.started" : "em.cancelled.studio.when.notStarted");
    const money = fromRestaurant ? t(started ? "em.cancelled.studio.money.restStarted" : "em.cancelled.studio.money.restNotStarted") : t("em.cancelled.studio.money.byProvider");
    return {
      subject: t(fromRestaurant ? "em.cancelled.studio.subject.restaurant" : "em.cancelled.studio.subject.provider", v),
      preheader: money,
      title: t(fromRestaurant ? "em.cancelled.studio.title.restaurant" : "em.cancelled.studio.title.provider"),
      paragraphs: [t(fromRestaurant ? "em.cancelled.studio.p1.restaurant" : "em.cancelled.studio.p1.provider", { ...v, when }), money],
      cta: t("em.cancelled.cta"),
      note: by === "provider" && started ? t("em.cancelled.studio.note.warning") : t("em.cancelled.note.thanks"),
    };
  }
  const whenKey = band === "free" ? "em.cancelled.when.free" : band === "half" ? "em.cancelled.when.half" : "em.cancelled.when.full";
  const when = t(whenKey as MessageKey);
  const money = fromRestaurant ? t(band === "free" ? "em.cancelled.money.restFree" : band === "half" ? "em.cancelled.money.restHalf" : "em.cancelled.money.restFull") : t("em.cancelled.money.byProvider");
  return {
    subject: t(fromRestaurant ? "em.cancelled.subject.restaurant" : "em.cancelled.subject.provider", v),
    preheader: money,
    title: t(fromRestaurant ? "em.cancelled.title.restaurant" : "em.cancelled.title.provider"),
    paragraphs: [t(fromRestaurant ? "em.cancelled.p1.restaurant" : "em.cancelled.p1.provider", { ...v, when }), money],
    cta: t("em.cancelled.cta"),
    note: by === "provider" && band !== "free" ? t("em.cancelled.note.late") : t("em.cancelled.note.thanks"),
  };
}
