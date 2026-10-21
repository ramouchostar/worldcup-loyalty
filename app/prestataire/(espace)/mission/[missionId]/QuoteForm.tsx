"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Check, Minus, Plus } from "lucide-react";
import { Card } from "@/components/admin/ui";
import { QUOTE_INCLUDES, excludedFor, providerView, quoteVsBudget, type QuoteIssue } from "@/lib/mission-quote";
import { eurosToCents } from "@/lib/mission-view";
import { DEFAULT_TERMS, type Metier } from "@/lib/mission-money";
import { useT } from "@/components/i18n/I18nProvider";
import { formatEurosL, type MessageKey } from "@/lib/i18n/core";

// ADR 0084 §3 règle 2 — le prestataire chiffre : durée, prix, ce qui est inclus (et donc
// exclu), hypothèses. Son devis est FERME pour ce brief : l'écran le dit avant l'envoi.
// Le prestataire voit son prix ET ce qu'il reçoit (87,5 %) — jamais le restaurateur.

const DEFAULT_INCLUDED: Record<Metier, string[]> = {
  video: ["Tournage sur place", "Montage", "Sous-titres", "Musique libre de droits"],
  photo: ["Prise de vue sur place", "Retouche des images", "Export web"],
  design: ["Création", "Déclinaisons de format"],
  impression: ["Impression", "Livraison"],
};

export function QuoteForm({ missionId, metier, budgetCents, commissionBps }: { missionId: string; metier: Metier; budgetCents: number | null; commissionBps: number }) {
  const router = useRouter();
  const tr = useT();
  const { t, locale } = tr;
  const eur = (cents: number) => formatEurosL(cents, locale);
  const issueText = (i: QuoteIssue | undefined) => (i ? t(`quote.issue.${i.code}` as MessageKey) : null);
  const [priceText, setPriceText] = useState("");
  const [hours, setHours] = useState(4);
  const [days, setDays] = useState(7);
  const [included, setIncluded] = useState<string[]>(DEFAULT_INCLUDED[metier]);
  const [hypotheses, setHypotheses] = useState("");
  const [issues, setIssues] = useState<QuoteIssue[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);

  const priceCents = eurosToCents(priceText);
  const view = priceCents ? providerView(priceCents, { ...DEFAULT_TERMS, commissionBps }) : null;
  const budget = priceCents ? quoteVsBudget(priceCents, budgetCents) : null;
  const excluded = excludedFor(metier, included);
  const issueOf = (field: QuoteIssue["field"]) => issues.find((i) => i.field === field);

  async function send() {
    setSending(true);
    setError(null);
    setIssues([]);
    try {
      const res = await fetch(`/api/prestataire/missions/${missionId}/quote`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ priceCents: priceCents ?? 0, hours, deliveryDays: days, included, hypotheses }),
      });
      const body = await res.json().catch(() => ({}));
      if (res.ok) {
        router.refresh();
        return;
      }
      if (res.status === 422 && Array.isArray(body.issues)) setIssues(body.issues as QuoteIssue[]);
      setError(tr.err(body, "err.sendFailed"));
    } catch {
      setError(t("quote.offline"));
    } finally {
      setSending(false);
    }
  }

  return (
    <Card className="space-y-6">
      <div>
        <h2 className="font-display text-[20px] font-bold tracking-[-0.02em] text-ink">{t("quote.title")}</h2>
        <p className="text-ink-muted text-[13.5px] mt-1">{t("quote.note")}</p>
      </div>

      <fieldset className="space-y-2">
        <legend className="text-[14px] font-semibold text-ink">{t("quote.included")}</legend>
        <div className="space-y-2">
          {QUOTE_INCLUDES[metier].map((item) => {
            const on = included.includes(item);
            return (
              <button
                key={item}
                type="button"
                role="checkbox"
                aria-checked={on}
                onClick={() => setIncluded((list) => (on ? list.filter((x) => x !== item) : [...list, item]))}
                className={`w-full flex items-center gap-3 text-left rounded-xl border p-3 min-h-[44px] ${on ? "border-boost-olive bg-boost-cream" : "border-paper-border bg-white"}`}
              >
                <span className={`w-5 h-5 shrink-0 rounded border flex items-center justify-center ${on ? "bg-boost-olive border-boost-olive text-white" : "border-ink-faint bg-white"}`}>
                  {on && <Check className="w-3.5 h-3.5" aria-hidden />}
                </span>
                <span className="text-[14px] text-ink">{tr.canon("included", item)}</span>
              </button>
            );
          })}
        </div>
        {excluded.length > 0 && (
          <p className="text-[12.5px] text-ink-muted">
            <span className="font-semibold">{t("quote.excluded")}</span> {t("quote.excludedNote", { list: excluded.map((x) => tr.canon("included", x)).join(", ") })}
          </p>
        )}
        {issueOf("included") && (
          <p role="alert" className="text-danger text-[13px] font-semibold">
            {issueText(issueOf("included"))}
          </p>
        )}
      </fieldset>

      <div className="grid grid-cols-2 gap-4">
        <Stepper
          label={t("quote.hours")}
          lessLabel={t("quote.stepperLess", { label: t("quote.hours") })}
          moreLabel={t("quote.stepperMore", { label: t("quote.hours") })}
          value={`${String(hours).replace(".", locale === "en" ? "." : ",")} h`}
          onDec={() => setHours((h) => Math.max(0.5, h - 0.5))}
          onInc={() => setHours((h) => Math.min(200, h + 0.5))}
          issue={issueText(issueOf("hours"))}
        />
        <Stepper
          label={t("quote.days")}
          lessLabel={t("quote.stepperLess", { label: t("quote.days") })}
          moreLabel={t("quote.stepperMore", { label: t("quote.days") })}
          value={`${days} j`}
          onDec={() => setDays((d) => Math.max(1, d - 1))}
          onInc={() => setDays((d) => Math.min(90, d + 1))}
          issue={issueText(issueOf("delivery"))}
        />
      </div>

      <div className="space-y-2">
        <label htmlFor="hyp" className="block text-[14px] font-semibold text-ink">
          {t("quote.hypotheses")} <span className="font-normal text-ink-faint">· {t("quote.optional")}</span>
        </label>
        <p className="text-[12.5px] text-ink-muted">{t("quote.hypothesesNote")}</p>
        <textarea
          id="hyp"
          value={hypotheses}
          onChange={(e) => setHypotheses(e.target.value)}
          rows={3}
          maxLength={1000}
          className="w-full border border-paper-border rounded-xl px-3 py-2.5 text-[14px] text-ink bg-white focus:outline-none focus-visible:ring-2 focus-visible:ring-boost-olive"
        />
      </div>

      <div className="space-y-2">
        <label htmlFor="price" className="block text-[14px] font-semibold text-ink">
          {t("quote.price")}
        </label>
        <div className="flex items-center gap-2">
          <input
            id="price"
            inputMode="decimal"
            value={priceText}
            onChange={(e) => setPriceText(e.target.value)}
            className="w-36 border border-paper-border rounded-xl px-3 py-2.5 text-[14px] text-ink bg-white focus:outline-none focus-visible:ring-2 focus-visible:ring-boost-olive"
          />
          <span className="text-[14px] text-ink-muted">€</span>
        </div>
        {issueOf("price") && (
          <p role="alert" className="text-danger text-[13px] font-semibold">
            {issueText(issueOf("price"))}
          </p>
        )}
        {view && (
          <div className="rounded-xl bg-boost-cream border border-boost-olive/30 p-3 space-y-1">
            <p className="text-[14px] text-ink">
              {t("quote.youReceive", { amount: eur(view.youReceiveCents) })}
            </p>
            <p className="text-[12.5px] text-ink-muted">{t("quote.shareNote", { pct: (100 - commissionBps / 100).toString().replace(".", locale === "en" ? "." : ",") })}</p>
          </div>
        )}
        {budget && !budget.within && (
          <p className="text-[12.5px] text-warn font-semibold">
            {t("quote.overBudget", { pct: budget.overPct, budget: eur(budgetCents ?? 0) })}
          </p>
        )}
      </div>

      {error && (
        <p role="alert" className="text-danger text-[13.5px] font-semibold">
          {error}
        </p>
      )}
      <button
        type="button"
        disabled={sending}
        onClick={send}
        className="w-full inline-flex items-center justify-center min-h-[44px] px-5 rounded-xl bg-boost-olive text-white text-[14px] font-semibold shadow-[inset_0_-3px_0_#4F5C2D] hover:brightness-95 disabled:opacity-60"
      >
        {sending ? t("quote.sending") : view ? t("quote.sendWithPrice", { price: eur(view.quoteCents) }) : t("quote.send")}
      </button>
    </Card>
  );
}

function Stepper({ label, lessLabel, moreLabel, value, onDec, onInc, issue }: { label: string; lessLabel: string; moreLabel: string; value: string; onDec: () => void; onInc: () => void; issue: string | null }) {
  return (
    <div className="space-y-1.5">
      <p className="text-[14px] font-semibold text-ink">{label}</p>
      <div className="flex items-center gap-2">
        <button type="button" onClick={onDec} aria-label={lessLabel} className="w-11 h-11 rounded-xl border border-paper-border bg-white flex items-center justify-center">
          <Minus className="w-4 h-4" aria-hidden />
        </button>
        <span className="min-w-[3.5rem] text-center text-[15px] font-semibold text-ink" aria-live="polite">
          {value}
        </span>
        <button type="button" onClick={onInc} aria-label={moreLabel} className="w-11 h-11 rounded-xl border border-paper-border bg-white flex items-center justify-center">
          <Plus className="w-4 h-4" aria-hidden />
        </button>
      </div>
      {issue && (
        <p role="alert" className="text-danger text-[12.5px] font-semibold">
          {issue}
        </p>
      )}
    </div>
  );
}
