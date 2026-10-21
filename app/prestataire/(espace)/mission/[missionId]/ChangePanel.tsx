"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Card, SectionLabel } from "@/components/admin/ui";
import { AttachmentList } from "@/components/missions/AttachmentList";
import type { AttachmentView } from "@/lib/mission-files";
import { MAX_DELTA_DAYS, NOTE_MAX, PROVIDER_REFUSAL_REASONS, PROVIDER_ANSWER_DAYS, REASON_MIN, type ChangeQuoteIssue } from "@/lib/mission-changes";
import { useT } from "@/components/i18n/I18nProvider";
import { formatEurosL, type MessageKey } from "@/lib/i18n/core";
import { eurosToCents } from "@/lib/mission-view";
import { DEFAULT_TERMS } from "@/lib/mission-money";
import { providerView } from "@/lib/mission-quote";

// ADR 0084 §3 règle 9 — le prestataire répond à une demande de modification : un supplément (éventuellement nul) et
// les jours de livraison en plus, ou un refus avec sa raison. Il voit son prix ET ce qu'il reçoit ; jamais le
// restaurateur. Sans réponse en 3 jours, la demande expire et le brief d'origine tient.

export type OpenChange = { id: string; seq: number; categories: string[]; description: string; files: AttachmentView[] };

const primary = "inline-flex items-center justify-center min-h-[44px] px-5 rounded-xl bg-boost-olive text-white text-[14px] font-semibold shadow-[inset_0_-3px_0_#4F5C2D] hover:brightness-95 disabled:opacity-60";
const ghost = "inline-flex items-center justify-center min-h-[44px] px-4 rounded-xl border border-paper-border bg-white text-ink text-[14px] font-semibold disabled:opacity-60";
const field = "w-full border border-paper-border rounded-xl px-3 py-2.5 text-[14px] text-ink bg-white focus:outline-none focus-visible:ring-2 focus-visible:ring-boost-olive";

async function post(url: string, body: unknown) {
  const res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  return { ok: res.ok, status: res.status, data: (await res.json().catch(() => ({}))) as Record<string, unknown> };
}

export function ChangePanel({ missionId, change, commissionBps, filesBase }: { missionId: string; change: OpenChange; commissionBps: number; filesBase: string }) {
  const router = useRouter();
  const tr = useT();
  const { t, locale } = tr;
  const eur = (cents: number) => formatEurosL(cents, locale);
  const [free, setFree] = useState(false);
  const [priceText, setPriceText] = useState("");
  const [days, setDays] = useState(0);
  const [note, setNote] = useState("");
  const [refusing, setRefusing] = useState(false);
  const [reason, setReason] = useState("");
  const [issues, setIssues] = useState<ChangeQuoteIssue[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const cents = free ? 0 : eurosToCents(priceText);
  const view = cents ? providerView(cents, { ...DEFAULT_TERMS, commissionBps }) : null;
  const base = `/api/prestataire/missions/${missionId}/changes/${change.id}`;

  async function run(key: string, url: string, body: unknown) {
    setBusy(key);
    setError(null);
    setIssues([]);
    try {
      const r = await post(url, body);
      if (r.ok) return router.refresh();
      if (r.status === 422 && Array.isArray(r.data.issues)) setIssues(r.data.issues as ChangeQuoteIssue[]);
      setError(tr.err(r.data, "err.generic"));
    } catch {
      setError(t("err.network"));
    } finally {
      setBusy(null);
    }
  }

  const problem = (f: ChangeQuoteIssue["field"]) => {
    const p = issues.find((i) => i.field === f);
    return p ? t(`change.issue.${p.code}` as MessageKey) : null;
  };

  return (
    <Card className="space-y-5">
      <div>
        <SectionLabel>{t("change.title", { seq: change.seq })}</SectionLabel>
        <p className="text-[13.5px] text-ink-muted mt-1">{t("change.intro", { days: PROVIDER_ANSWER_DAYS })}</p>
      </div>
      <div className="rounded-xl border border-paper-border bg-white p-3 space-y-2">
        <p className="text-[12.5px] font-semibold text-ink-muted">{change.categories.join(" · ")}</p>
        <p className="text-[14px] text-ink whitespace-pre-line">{change.description}</p>
        <AttachmentList locale={locale} files={change.files} base={filesBase} />
      </div>

      {!refusing ? (
        <div className="space-y-4">
          <button type="button" role="checkbox" aria-checked={free} onClick={() => setFree((v) => !v)} className={`w-full flex items-center gap-3 text-left rounded-xl border p-3 min-h-[44px] ${free ? "border-boost-olive bg-boost-cream" : "border-paper-border bg-white"}`}>
            <span className={`w-5 h-5 shrink-0 rounded border ${free ? "bg-boost-olive border-boost-olive" : "border-ink-faint bg-white"}`} aria-hidden />
            <span className="text-[14px] font-semibold text-ink">{t("change.free")}</span>
          </button>
          {!free && (
            <div className="space-y-1">
              <label htmlFor="chg-price" className="block text-[14px] font-semibold text-ink">
                {t("change.price")}
              </label>
              <input id="chg-price" value={priceText} onChange={(e) => setPriceText(e.target.value)} inputMode="decimal" placeholder="120" className={`${field} w-40`} />
              {view && (
                <p className="text-[13px] text-ink-muted">
                  {t("change.youReceive", { amount: eur(view.youReceiveCents), total: eur(view.quoteCents) })}
                </p>
              )}
              {problem("price") && <p role="alert" className="text-danger text-[13px] font-semibold">{problem("price")}</p>}
            </div>
          )}
          <div className="space-y-1">
            <label htmlFor="chg-days" className="block text-[14px] font-semibold text-ink">
              {t("change.days")}
            </label>
            <input id="chg-days" type="number" min={0} max={MAX_DELTA_DAYS} value={days} onChange={(e) => setDays(Math.max(0, Math.min(MAX_DELTA_DAYS, Number(e.target.value) || 0)))} className={`${field} w-28`} />
            {problem("delta") && <p role="alert" className="text-danger text-[13px] font-semibold">{problem("delta")}</p>}
          </div>
          <div className="space-y-1">
            <label htmlFor="chg-note" className="block text-[14px] font-semibold text-ink">
              {t("change.note")} <span className="font-normal text-ink-faint">· {t("quote.optional")}</span>
            </label>
            <textarea id="chg-note" value={note} onChange={(e) => setNote(e.target.value)} rows={2} maxLength={NOTE_MAX} className={field} />
            {problem("note") && <p role="alert" className="text-danger text-[13px] font-semibold">{problem("note")}</p>}
          </div>
          {error && (
            <p role="alert" className="text-danger text-[13.5px] font-semibold">
              {error}
            </p>
          )}
          <div className="flex flex-wrap gap-2">
            <button type="button" disabled={busy !== null} onClick={() => run("quote", `${base}/quote`, { free, priceCents: cents ?? 0, deltaDays: days, note })} className={primary}>
              {busy === "quote" ? t("quote.sending") : free ? t("change.sendFree") : t("change.sendQuote")}
            </button>
            <button type="button" disabled={busy !== null} onClick={() => setRefusing(true)} className={ghost}>
              {t("change.refuse")}
            </button>
          </div>
        </div>
      ) : (
        <div className="space-y-3">
          <p className="text-[14px] font-semibold text-ink">{t("change.why")}</p>
          <div role="group" aria-label={t("change.reasons")} className="flex flex-wrap gap-2">
            {PROVIDER_REFUSAL_REASONS.map((r) => (
              <button key={r} type="button" aria-pressed={reason === r} onClick={() => setReason(r)} className={`min-h-[44px] px-4 rounded-xl border text-[14px] font-medium text-left ${reason === r ? "bg-boost-olive border-boost-olive text-white" : "bg-white border-paper-border text-ink"}`}>
                {tr.canon("changeRefuse", r)}
              </button>
            ))}
          </div>
          <textarea aria-label={t("change.reasonLabel")} value={reason} onChange={(e) => setReason(e.target.value)} rows={2} maxLength={500} className={field} />
          <p className="text-[12px] text-ink-faint">{reason.trim().length < REASON_MIN ? t("change.reasonMin", { n: REASON_MIN }) : " "}</p>
          {locale !== "fr" && <p className="text-[12px] text-ink-faint">{t("change.reasonFrench")}</p>}
          {error && (
            <p role="alert" className="text-danger text-[13.5px] font-semibold">
              {error}
            </p>
          )}
          <div className="flex flex-wrap gap-2">
            <button type="button" disabled={busy !== null} onClick={() => run("decline", `${base}/decline`, { reason })} className={primary}>
              {busy === "decline" ? "…" : t("change.decline")}
            </button>
            <button type="button" disabled={busy !== null} onClick={() => setRefusing(false)} className={ghost}>
              {t("change.back")}
            </button>
          </div>
          <p className="text-[12.5px] text-ink-muted">{t("change.keeps")}</p>
        </div>
      )}
    </Card>
  );
}
