import type { MessageKey, Translator } from "../i18n";
import type { MissionUpdateInput } from "./mission-update";
import { deadlineText, type ProviderCopy } from "./mission-update-provider";

// ============================================================
// Les e-mails de mise à jour d'une mission que REÇOIT LE RESTAURATEUR, dans sa langue (ADR 0084 §5 terdecies, lot 9).
//
// Même texte que `copyFor` (mission-update.ts) en français — un test le vérifie, cas par cas. Retourne `null` pour un e-mail qui n'est
// pas pour le restaurateur, ou d'une sorte que le restaurateur ne reçoit pas : l'appelant retombe alors sur `copyFor`.
// ============================================================

const k = (s: string) => s as MessageKey;

export function restaurantCopy(i: MissionUpdateInput, tr: Translator): ProviderCopy | null {
  if (i.audience !== "restaurant") return null;
  const { t } = tr;
  const deadline = deadlineText(i, tr.locale);
  const count = i.count ?? 2;
  const v = { restaurant: i.restaurantName, provider: i.providerName, count };
  // Un e-mail « simple » : subject / pre / title / p1… / cta / note sous la même racine.
  const simple = (base: string, extra: Record<string, string | number> = {}, paragraphs: string[] = ["p1"]): ProviderCopy => ({
    subject: t(k(`${base}.subject`), { ...v, ...extra }),
    preheader: t(k(`${base}.pre`), { ...v, ...extra }),
    title: t(k(`${base}.title`), { ...v, ...extra }),
    paragraphs: paragraphs.map((p) => t(k(`${base}.${p}`), { ...v, ...extra })),
    cta: t(k(`${base}.cta`)),
    note: t(k(`${base}.note`)),
  });

  switch (i.kind) {
    case "report_submitted":
      return simple("emr.report_submitted");
    case "delivered":
      return i.print ? simple("emr.delivered_print", {}, ["p1", "p2"]) : simple("emr.delivered");
    case "validation_reminder": {
      const r = i.round === 2 ? "2" : "1";
      return {
        subject: t(k(`emr.validation_reminder.${r}.subject`), v),
        preheader: t(k(`emr.validation_reminder.${r}.pre`), v),
        title: t(k(`emr.validation_reminder.${r}.title`), v),
        paragraphs: [t("emr.validation_reminder.p1", v), t(k(`emr.validation_reminder.${r}.p2`), v)],
        cta: t("emr.validation_reminder.cta"),
        note: t("emr.validation_reminder.note"),
      };
    }
    case "auto_validated":
      return simple("emr.auto_validated");
    case "bat_review":
    case "bat_review_again":
      return { ...simple("emr.bat_review", {}, ["p1", "p2"]), subject: t(k(`emr.${i.kind}.subject`), v), title: t(k(`emr.${i.kind}.title`), v) };
    case "bat_submitted": {
      const again = (i.count ?? 1) > 1;
      return {
        ...simple("emr.bat_submitted"),
        subject: t(k(again ? "emr.bat_submitted_again.subject" : "emr.bat_submitted.subject"), v),
        title: t(k(again ? "emr.bat_submitted_again.title" : "emr.bat_submitted.title")),
        paragraphs: [t(k(again ? "emr.bat_submitted_again.p1" : "emr.bat_submitted.p1"), v), t("emr.bat_submitted.p2")],
      };
    }
    case "message_received":
      return simple("emr.message_received");
    case "work_started":
      return simple("emr.work_started", {}, ["p1", "p2"]);
    case "cancelled": {
      const band = i.band ?? "free";
      const byProvider = (i.cancelledBy ?? "restaurant") === "provider";
      const started = band === "deposit";
      const tier = band === "free" ? "free" : band === "half" ? "half" : "full";
      const when = i.studio ? t(started ? "emr.cancelled.when.started" : "emr.cancelled.when.notStarted") : t(k(`emr.cancelled.when.${tier}`));
      const money = byProvider ? t("emr.cancelled.money.provider") : i.studio ? t(started ? "emr.cancelled.money.deposit" : "emr.cancelled.money.free") : t(k(`emr.cancelled.money.${tier}`));
      const side = byProvider ? "provider" : "restaurant";
      const studio = i.studio ? ".studio" : "";
      return {
        subject: t(k(byProvider ? `emr.cancelled.subject.provider${studio}` : "emr.cancelled.subject.restaurant"), v),
        preheader: money,
        title: t(k(byProvider ? `emr.cancelled.title.provider${studio}` : "emr.cancelled.title.restaurant")),
        paragraphs: [t(k(`emr.cancelled.p1.${side}`), { ...v, when }), money, t(k(`emr.cancelled.p3.${side}`))],
        cta: t("emr.cancelled.cta"),
        note: t(i.studio ? "emr.cancelled.note.studio" : "emr.cancelled.note"),
      };
    }
    case "dispute_opened":
      return simple("emr.dispute_opened", {}, ["p1", "p2"]);
    case "dispute_resolved": {
      const body = t(k(`emr.dispute_resolved.${i.decision ?? "pay"}`), { pct: i.providerPct ?? 0 });
      return { subject: t("emr.dispute_resolved.subject", v), preheader: body, title: t("emr.dispute_resolved.title"), paragraphs: [body, t("emr.dispute_resolved.p2")], cta: t("emr.dispute_resolved.cta"), note: t("emr.dispute_resolved.note") };
    }
    case "proposals_received":
      return {
        subject: t("emr.proposals_received.subject", v),
        preheader: deadline ? t("emr.proposals_received.pre.date", { deadline }) : t("emr.proposals_received.pre.nodate"),
        title: t("emr.proposals_received.title"),
        paragraphs: [t("emr.proposals_received.p1", v), deadline ? t("emr.proposals_received.p2.date", { deadline }) : t("emr.proposals_received.p2.nodate")],
        cta: t("emr.proposals_received.cta"),
        note: t("emr.proposals_received.note"),
      };
    case "proposal_auto": {
      const title = i.title ?? "";
      const reason = t(i.auto === "fallback" ? "emr.proposal_auto.reason.fallback" : "emr.proposal_auto.reason.auto");
      return { subject: t("emr.proposal_auto.subject", { title }), preheader: t("emr.proposal_auto.pre"), title: t("emr.proposal_auto.title"), paragraphs: [t("emr.proposal_auto.p1", { ...v, reason, title })], cta: t("emr.proposal_auto.cta"), note: t("emr.proposal_auto.note") };
    }
    case "proposals_choose":
      return {
        subject: t("emr.proposals_choose.subject", v),
        preheader: deadline ? t("emr.proposals_choose.pre.date", { deadline }) : t("emr.proposals_choose.pre.nodate"),
        title: t("emr.proposals_choose.title"),
        paragraphs: [deadline ? t("emr.proposals_choose.p1.date", { ...v, deadline }) : t("emr.proposals_choose.p1.nodate", v)],
        cta: t("emr.proposals_choose.cta"),
        note: t("emr.proposals_choose.note"),
      };
    case "change_quoted": {
      const f = i.free ? "free" : "paid";
      return {
        subject: t(k(`emr.change_quoted.subject.${f}`), v),
        preheader: t(k(`emr.change_quoted.pre.${f}`)),
        title: t(k(`emr.change_quoted.title.${f}`)),
        paragraphs: [t(k(`emr.change_quoted.p1.${f}`), v), t("emr.change_quoted.p2")],
        cta: t(k(`emr.change_quoted.cta.${f}`)),
        note: t("emr.change_quoted.note"),
      };
    }
    case "change_provider_declined":
      return simple("emr.change_provider_declined");
    case "change_expired":
      return simple("emr.change_expired", {}, ["p1", "p2"]);
    default:
      return null;
  }
}
