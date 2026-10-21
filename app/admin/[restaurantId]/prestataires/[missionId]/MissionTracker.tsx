import { Check } from "lucide-react";
import { Card, PageHeader, SectionLabel, StatusBadge } from "@/components/admin/ui";
import type { BriefTemplate } from "@/lib/mission-brief";
import type { MissionRow } from "@/lib/missions";
import { STATUS_VIEW, briefHeadline, briefRows, timeline } from "@/lib/mission-view";
import { hasShoot } from "@/lib/mission-metier";
import { LOCALE_TAG, type MessageKey, type Translator } from "@/lib/i18n/core";

// ADR 0084 — le suivi d'une mission envoyée : la frise (où ça en est, en mots
// de restaurateur) et le brief verrouillé tel que le prestataire l'a reçu.
// Présentation seule : aucune donnée n'est lue ici (testable sans base).
export function MissionTracker({
  mission,
  template,
  providerName,
  tr,
}: {
  mission: Pick<MissionRow, "metier" | "status" | "brief" | "brief_locked_at"> & Partial<Pick<MissionRow, "cancelled_by" | "cancellation_note">>;
  template: BriefTemplate;
  providerName: string | null;
  /** La langue du restaurateur. */
  tr: Translator;
}) {
  const { t, locale } = tr;
  const view = STATUS_VIEW[mission.status];
  const tl = timeline(mission.status, mission.metier);
  const who = providerName ?? t(`rest.whoCap.${mission.metier}` as MessageKey);
  const rows = briefRows(mission.brief ?? {}, template, "brief", locale);
  const lockedOn = mission.brief_locked_at
    ? new Date(mission.brief_locked_at).toLocaleDateString(LOCALE_TAG[locale], { day: "numeric", month: "long", timeZone: "Europe/Brussels" })
    : null;

  return (
    <>
      <PageHeader
        title={`${t(`metier.${mission.metier}` as MessageKey)}${briefHeadline(mission.brief, locale, mission.metier) ? ` · ${briefHeadline(mission.brief, locale, mission.metier)}` : ""}`}
        subtitle={providerName ? t("rest.tracker.with", { name: providerName }) : undefined}
        action={<StatusBadge tone={view.tone}>{t(`status.restaurant.${mission.status}` as MessageKey)}</StatusBadge>}
      />

      <Card className="space-y-4">
        <SectionLabel>{t("rest.tracker.where")}</SectionLabel>
        <ol className="space-y-3">
          {tl.steps.map((s) => (
            <li key={s.key} className="flex items-center gap-3">
              <span
                className={`w-6 h-6 shrink-0 rounded-full flex items-center justify-center text-[12px] ${
                  s.state === "done" ? "bg-boost-olive text-white" : s.state === "current" ? "border-2 border-boost-olive bg-boost-cream" : "border border-paper-border bg-white"
                }`}
                aria-hidden
              >
                {s.state === "done" && <Check className="w-3.5 h-3.5" />}
              </span>
              <span className={`text-[14px] ${s.state === "todo" ? "text-ink-faint" : "text-ink font-semibold"}`}>
                {t(`rest.tl.${s.key === "production" && !hasShoot(mission.metier) ? "creation" : s.key}` as MessageKey)}
                {s.state === "current" && <span className="sr-only">{t("rest.tracker.current")}</span>}
              </span>
            </li>
          ))}
        </ol>
        {mission.status === "devis" && (
          <p className="text-[13.5px] text-ink-muted border-t border-paper-border pt-3">
            {t("rest.tracker.devis", { who, next: t(hasShoot(mission.metier) ? "rest.tracker.devis.shoot" : "rest.tracker.devis.studio") })}
          </p>
        )}
        {mission.status === "accepte" && (
          <p className="text-[13.5px] text-ink-muted border-t border-paper-border pt-3">
            {hasShoot(mission.metier) ? t("rest.tracker.accepte.shoot") : t("rest.tracker.accepte.studio", { who })}
          </p>
        )}
        {mission.status === "envoye" && (
          <p className="text-[13.5px] text-ink-muted border-t border-paper-border pt-3">
            {t("rest.tracker.envoye", { who })}
          </p>
        )}
        {tl.stopped && (
          <p className="text-[13.5px] text-ink-muted border-t border-paper-border pt-3">
            {mission.status === "annule" && mission.cancelled_by === "provider"
              ? t("rest.tracker.cancelledByProvider", { who, note: mission.cancellation_note ? t("rest.tracker.cancelledByProvider.note", { note: mission.cancellation_note }) : "" })
              : mission.status === "annule" && mission.cancelled_by === "restaurant"
                ? t("rest.tracker.cancelledByYou")
                : t("rest.tracker.stopped", { status: t(`status.restaurant.${mission.status}` as MessageKey).toLowerCase() })}
          </p>
        )}
      </Card>

      <Card padding="p-0">
        <div className="px-5 pt-4">
          <SectionLabel>{t("rest.tracker.brief")}</SectionLabel>
          <p className="text-ink-muted text-[13px] mt-1">{t("rest.tracker.locked", { on: lockedOn ? t("rest.tracker.lockedOn", { date: lockedOn }) : "" })}</p>
        </div>
        <dl className="mt-2">
          {rows.map((r, i) => (
            <div key={r.label} className={`px-5 py-3 ${i === 0 ? "" : "border-t border-paper-border"}`}>
              <dt className="text-[12px] text-ink-faint">{r.label}</dt>
              <dd className="text-[14px] text-ink whitespace-pre-line">{r.value}</dd>
            </div>
          ))}
        </dl>
      </Card>
    </>
  );
}
