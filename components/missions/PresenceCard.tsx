"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { CalendarPlus, Check, Hourglass } from "lucide-react";
import { Card, SectionLabel } from "@/components/admin/ui";
import { useT } from "@/components/i18n/I18nProvider";

// ADR 0084 §5 — « je serai là » : de J-2 au jour J, chaque partie confirme sa présence ; l'autre le voit.
// Partagé par le restaurateur et le prestataire (même geste, deux routes). Le fichier calendrier est
// proposé dès que la date est réservée. L'écran dit toujours où en est l'AUTRE partie : une absence
// le jour J se prépare la veille, pas le matin.

export type Verdict = "ok" | "too_early" | "too_late" | "no_date";

export function PresenceCard({
  confirmUrl,
  body,
  icsUrl,
  verdict,
  selfConfirmed,
  otherConfirmed,
  otherName,
}: {
  confirmUrl: string;
  /** Corps JSON de la requête (le restaurateur y met son restaurantId). */
  body: Record<string, unknown>;
  icsUrl: string;
  verdict: Verdict;
  selfConfirmed: boolean;
  otherConfirmed: boolean;
  otherName: string;
}) {
  const router = useRouter();
  const tr = useT();
  const { t } = tr;
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function confirm() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(confirmUrl, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        router.refresh();
        return;
      }
      setError(tr.err(data, "err.generic"));
    } catch {
      setError(t("err.network"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card className="space-y-4">
      <SectionLabel>{t("presence.title")}</SectionLabel>
      <ul className="space-y-2 text-[14px]">
        <li className="flex items-center gap-2">
          {selfConfirmed ? <Check className="w-4 h-4 text-good shrink-0" aria-hidden /> : <Hourglass className="w-4 h-4 text-ink-faint shrink-0" aria-hidden />}
          <span className={selfConfirmed ? "text-ink font-semibold" : "text-ink-muted"}>{selfConfirmed ? t("presence.self.yes") : t("presence.self.no")}</span>
        </li>
        <li className="flex items-center gap-2">
          {otherConfirmed ? <Check className="w-4 h-4 text-good shrink-0" aria-hidden /> : <Hourglass className="w-4 h-4 text-ink-faint shrink-0" aria-hidden />}
          <span className={otherConfirmed ? "text-ink font-semibold" : "text-ink-muted"}>{otherConfirmed ? t("presence.other.yes", { name: otherName }) : t("presence.other.no", { name: otherName })}</span>
        </li>
      </ul>

      {!selfConfirmed && verdict === "too_early" && <p className="text-[13px] text-ink-muted">{t("presence.tooEarly")}</p>}
      {!selfConfirmed && verdict === "ok" && (
        <>
          {error && (
            <p role="alert" className="text-danger text-[13px] font-semibold">
              {error}
            </p>
          )}
          <button
            type="button"
            disabled={busy}
            onClick={confirm}
            className="w-full inline-flex items-center justify-center min-h-[44px] px-5 rounded-xl bg-boost-olive text-white text-[14px] font-semibold shadow-[inset_0_-3px_0_#4F5C2D] hover:brightness-95 disabled:opacity-60"
          >
            {busy ? "…" : t("presence.button")}
          </button>
          <p className="text-[12.5px] text-ink-muted">{t("presence.warning")}</p>
        </>
      )}

      <a href={icsUrl} className="inline-flex items-center gap-1.5 min-h-[44px] text-[13.5px] font-semibold text-ink underline underline-offset-2">
        <CalendarPlus className="w-4 h-4" aria-hidden /> {t("presence.calendar")}
      </a>
    </Card>
  );
}
