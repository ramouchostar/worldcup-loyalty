"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Check, Copy } from "lucide-react";
import { Card, SectionLabel } from "@/components/admin/ui";
import { whatsappShareUrl } from "@/lib/mission-team-message";
import type { TeamNoticeState } from "@/lib/mission-dates";
import { useT } from "@/components/i18n/I18nProvider";
import type { MessageKey } from "@/lib/i18n/core";

// ADR 0084 §5 — « Prévenir mon équipe » : le message est prêt à partager, et le restaurateur confirme
// quand c'est fait (l'heure est gardée). Une semaine à l'avance : les étudiants ne travaillent pas
// toute la semaine, à deux jours c'est trop tard — l'écran le dit quand on y est presque ou qu'on y est.

const NOTICE_TONE: Record<TeamNoticeState, string> = { early: "text-ink-muted", due: "text-warn font-semibold", late: "text-danger font-semibold", notified: "text-good font-semibold" };

export function TeamNotice({ restaurantId, missionId, message, state }: { restaurantId: string; missionId: string; message: string; state: TeamNoticeState }) {
  const router = useRouter();
  const tr = useT();
  const { t } = tr;
  const [copied, setCopied] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function confirm() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/missions/${missionId}/team-notified`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ restaurantId }) });
      const body = await res.json().catch(() => ({}));
      if (res.ok) {
        router.refresh();
        return;
      }
      setError(tr.err(body, "err.generic"));
    } catch {
      setError(t("err.network"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card className="space-y-4">
      <SectionLabel>{t("rc.team.title")}</SectionLabel>
      <p className={`text-[13.5px] ${NOTICE_TONE[state]}`}>{t(`rc.team.${state}` as MessageKey)}</p>
      <pre className="whitespace-pre-wrap font-sans text-[13.5px] text-ink bg-paper-subtle rounded-xl p-3 border border-paper-border">{message}</pre>
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => {
            navigator.clipboard?.writeText(message);
            setCopied(true);
          }}
          className="inline-flex items-center gap-1.5 min-h-[44px] px-4 rounded-lg border border-paper-border bg-white text-[14px] font-semibold text-ink"
        >
          {copied ? <Check className="w-4 h-4" aria-hidden /> : <Copy className="w-4 h-4" aria-hidden />} {copied ? t("rc.idea.copied") : t("rc.idea.copy")}
        </button>
        <a href={whatsappShareUrl(message)} target="_blank" rel="noopener noreferrer" className="inline-flex items-center min-h-[44px] px-4 rounded-lg bg-[#25D366] text-white text-[14px] font-semibold">
          {t("rc.idea.whatsapp")}
        </a>
      </div>
      {state !== "notified" && (
        <>
          {error && (
            <p role="alert" className="text-danger text-[13px] font-semibold">
              {error}
            </p>
          )}
          <button type="button" disabled={busy} onClick={confirm} className="w-full min-h-[44px] px-4 rounded-xl bg-ink text-white text-[14px] font-semibold disabled:opacity-60">
            {busy ? "…" : t("rc.team.done")}
          </button>
        </>
      )}
    </Card>
  );
}
