"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle } from "lucide-react";
import { Card, SectionLabel } from "@/components/admin/ui";
import type { CancelIssue } from "@/lib/mission-cancel-rules";
import { useT } from "@/components/i18n/I18nProvider";
import type { MessageKey } from "@/lib/i18n/core";

// ADR 0084 §4 — annuler : l'écran dit D'ABORD ce que ça coûte (jamais une surprise après le clic), demande une
// raison de la liste, et une confirmation. Partagé par le restaurateur et le prestataire (même geste, deux routes).
// Le coût est calculé côté serveur à l'affichage ET recalculé à l'écriture : si la bande change entre les deux
// (il passe sous les 7 jours pendant que l'écran est ouvert), c'est la règle du moment du clic qui s'applique.

export function CancelCard({
  cancelUrl,
  body,
  reasons,
  costText,
  severity,
  title,
  extraWarning,
  confirmLabel,
}: {
  cancelUrl: string;
  /** Corps JSON de base (le restaurateur y met son restaurantId). */
  body: Record<string, unknown>;
  reasons: readonly string[];
  /** La phrase de coût, calculée côté serveur à l'instant de l'affichage. */
  costText: string;
  /** free : aucune conséquence ; half / full : une conséquence réelle, mise en avant. */
  severity: "free" | "half" | "full" | "deposit";
  title: string;
  extraWarning?: string;
  confirmLabel: string;
}) {
  const router = useRouter();
  const tr = useT();
  const { t } = tr;
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState<string | null>(null);
  const [note, setNote] = useState("");
  const [understood, setUnderstood] = useState(severity === "free");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function send() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(cancelUrl, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...body, reason, note }) });
      const data = await res.json().catch(() => ({}));
      if (res.ok) return router.refresh();
      const issue = data.issue as CancelIssue | undefined;
      setError(issue ? t(`cancel.issue.${issue}` as MessageKey) : tr.err(data, "err.generic"));
    } catch {
      setError(t("err.network"));
    } finally {
      setBusy(false);
    }
  }

  const warn = severity !== "free";

  if (!open) {
    return (
      <Card className="space-y-2">
        <SectionLabel>{title}</SectionLabel>
        <p className={`text-[13.5px] ${warn ? "text-warn font-semibold" : "text-ink-muted"}`}>{costText}</p>
        <button type="button" onClick={() => setOpen(true)} className="inline-flex items-center min-h-[44px] px-4 rounded-lg border border-paper-border bg-white text-[14px] font-semibold text-ink">
          {title}
        </button>
      </Card>
    );
  }

  return (
    <Card className="space-y-4">
      <SectionLabel>{title}</SectionLabel>
      <div className={`flex items-start gap-2 rounded-xl border p-3 ${warn ? "border-warn/40 bg-white" : "border-paper-border bg-paper-subtle"}`}>
        {warn && <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0 text-warn" aria-hidden />}
        <div className="space-y-1">
          <p className={`text-[14px] ${warn ? "font-semibold text-ink" : "text-ink"}`}>{costText}</p>
          {extraWarning && <p className="text-[13px] text-ink-muted">{extraWarning}</p>}
        </div>
      </div>

      <fieldset className="space-y-2">
        <legend className="text-[14px] font-semibold text-ink">{t("cancel.why")}</legend>
        <div role="radiogroup" aria-label={t("cancel.group")} className="space-y-2">
          {reasons.map((r) => (
            <button key={r} type="button" role="radio" aria-checked={reason === r} onClick={() => setReason(r)} className={`w-full text-left rounded-xl border px-3 py-2.5 min-h-[44px] text-[14px] ${reason === r ? "border-boost-olive bg-boost-cream font-semibold" : "border-paper-border bg-white"}`}>
              {tr.canon("cancel", r)}
            </button>
          ))}
        </div>
        <textarea aria-label={t("cancel.noteOptional")} value={note} onChange={(e) => setNote(e.target.value)} rows={2} maxLength={500} placeholder={reason === "Autre raison" ? t("cancel.noteOther") : t("cancel.noteOptional")} className="w-full border border-paper-border rounded-xl px-3 py-2.5 text-[14px] text-ink bg-white focus:outline-none focus-visible:ring-2 focus-visible:ring-boost-olive" />
      </fieldset>

      {warn && (
        <button type="button" role="checkbox" aria-checked={understood} onClick={() => setUnderstood((u) => !u)} className={`w-full flex items-start gap-3 text-left rounded-xl border p-3 min-h-[44px] bg-white ${understood ? "border-boost-olive" : "border-paper-border"}`}>
          <span className={`mt-0.5 w-5 h-5 shrink-0 rounded border ${understood ? "bg-boost-olive border-boost-olive" : "border-ink-faint bg-white"}`} aria-hidden />
          <span className="text-[14px] font-semibold text-ink">{t("cancel.understood")}</span>
        </button>
      )}

      {error && (
        <p role="alert" className="text-danger text-[13.5px] font-semibold">
          {error}
        </p>
      )}
      <div className="flex gap-3">
        <button type="button" onClick={() => setOpen(false)} className="min-h-[44px] px-4 rounded-lg border border-paper-border bg-white text-[14px] font-semibold text-ink">
          {t("cancel.keep")}
        </button>
        <button type="button" disabled={busy || !reason || !understood} onClick={send} className="flex-1 min-h-[44px] px-4 rounded-lg bg-ink text-white text-[14px] font-semibold disabled:opacity-50">
          {busy ? "…" : confirmLabel}
        </button>
      </div>
    </Card>
  );
}
