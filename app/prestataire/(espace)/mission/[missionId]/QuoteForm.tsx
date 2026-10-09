"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Check, Minus, Plus } from "lucide-react";
import { Card } from "@/components/admin/ui";
import { QUOTE_INCLUDES, excludedFor, providerView, quoteVsBudget, type QuoteIssue } from "@/lib/mission-quote";
import { eurosToCents } from "@/lib/mission-view";
import { formatEuros, type Metier } from "@/lib/mission-money";

// ADR 0084 §3 règle 2 — le prestataire chiffre : durée, prix, ce qui est inclus (et donc
// exclu), hypothèses. Son devis est FERME pour ce brief : l'écran le dit avant l'envoi.
// Le prestataire voit son prix ET ce qu'il reçoit (87,5 %) — jamais le restaurateur.

const DEFAULT_INCLUDED: Record<Metier, string[]> = {
  video: ["Tournage sur place", "Montage", "Sous-titres", "Musique libre de droits"],
  photo: ["Prise de vue sur place", "Retouche des images", "Export web"],
  design: ["Création", "Déclinaisons de format"],
  impression: ["Impression", "Livraison"],
};

const ISSUE_TEXT: Record<string, string> = {
  price_invalid: "Indique ton prix en euros",
  price_too_high: "Ce prix est trop élevé pour un devis en ligne",
  hours_invalid: "Indique une durée (par quarts d'heure)",
  delivery_invalid: "Indique un délai de livraison en jours",
  included_empty: "Coche au moins une prestation incluse",
  included_unknown: "Une prestation n'est pas reconnue",
  hypotheses_too_long: "Tes hypothèses sont trop longues (1 000 caractères au plus)",
};

export function QuoteForm({ missionId, metier, budgetCents }: { missionId: string; metier: Metier; budgetCents: number | null }) {
  const router = useRouter();
  const [priceText, setPriceText] = useState("");
  const [hours, setHours] = useState(4);
  const [days, setDays] = useState(7);
  const [included, setIncluded] = useState<string[]>(DEFAULT_INCLUDED[metier]);
  const [hypotheses, setHypotheses] = useState("");
  const [issues, setIssues] = useState<QuoteIssue[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);

  const priceCents = eurosToCents(priceText);
  const view = priceCents ? providerView(priceCents) : null;
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
      setError(body.error ?? "Envoi impossible pour le moment. Réessaie.");
    } catch {
      setError("Pas de connexion. Ton devis n'est pas parti : réessaie dans un instant.");
    } finally {
      setSending(false);
    }
  }

  return (
    <Card className="space-y-6">
      <div>
        <h2 className="font-display text-[20px] font-bold tracking-[-0.02em] text-ink">Ton devis</h2>
        <p className="text-ink-muted text-[13.5px] mt-1">Ton prix est ferme pour ce brief. Si le restaurateur le change ensuite, c&apos;est une demande de modification.</p>
      </div>

      <fieldset className="space-y-2">
        <legend className="text-[14px] font-semibold text-ink">Ce qui est inclus</legend>
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
                <span className="text-[14px] text-ink">{item}</span>
              </button>
            );
          })}
        </div>
        {excluded.length > 0 && (
          <p className="text-[12.5px] text-ink-muted">
            <span className="font-semibold">Non inclus</span> (écrit tel quel dans le devis) : {excluded.join(", ")}.
          </p>
        )}
        {issueOf("included") && (
          <p role="alert" className="text-danger text-[13px] font-semibold">
            {ISSUE_TEXT[issueOf("included")!.code]}
          </p>
        )}
      </fieldset>

      <div className="grid grid-cols-2 gap-4">
        <Stepper
          label="Durée de travail"
          value={`${String(hours).replace(".", ",")} h`}
          onDec={() => setHours((h) => Math.max(0.5, h - 0.5))}
          onInc={() => setHours((h) => Math.min(200, h + 0.5))}
          issue={issueOf("hours") ? ISSUE_TEXT[issueOf("hours")!.code] : null}
        />
        <Stepper
          label="Livraison, jours après le tournage"
          value={`${days} j`}
          onDec={() => setDays((d) => Math.max(1, d - 1))}
          onInc={() => setDays((d) => Math.min(90, d + 1))}
          issue={issueOf("delivery") ? ISSUE_TEXT[issueOf("delivery")!.code] : null}
        />
      </div>

      <div className="space-y-2">
        <label htmlFor="hyp" className="block text-[14px] font-semibold text-ink">
          Tes hypothèses <span className="font-normal text-ink-faint">· facultatif</span>
        </label>
        <p className="text-[12.5px] text-ink-muted">Ce sur quoi ton prix repose (nombre de plats, un seul lieu, pas de déplacement…). Ce qui n&apos;est pas écrit ici est dans ton prix.</p>
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
          Prix du devis (hors TVA)
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
            {ISSUE_TEXT[issueOf("price")!.code]}
          </p>
        )}
        {view && (
          <div className="rounded-xl bg-boost-cream border border-boost-olive/30 p-3 space-y-1">
            <p className="text-[14px] text-ink">
              Tu reçois <span className="font-bold">{formatEuros(view.youReceiveCents)}</span>
            </p>
            <p className="text-[12.5px] text-ink-muted">87,5 % du prix, comme prévu dans ton contrat-cadre. Le restaurateur ne voit que son propre prix, jamais ta part.</p>
          </div>
        )}
        {budget && !budget.within && (
          <p className="text-[12.5px] text-warn font-semibold">
            Ton prix dépasse de {budget.overPct} % le budget indiqué par le restaurateur ({formatEuros(budgetCents ?? 0)}). Il pourra décliner : si c&apos;est voulu, explique-le dans tes hypothèses.
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
        {sending ? "Envoi…" : view ? `Envoyer le devis · ${formatEuros(view.quoteCents)}` : "Envoyer le devis"}
      </button>
    </Card>
  );
}

function Stepper({ label, value, onDec, onInc, issue }: { label: string; value: string; onDec: () => void; onInc: () => void; issue: string | null }) {
  return (
    <div className="space-y-1.5">
      <p className="text-[14px] font-semibold text-ink">{label}</p>
      <div className="flex items-center gap-2">
        <button type="button" onClick={onDec} aria-label={`Moins : ${label}`} className="w-11 h-11 rounded-xl border border-paper-border bg-white flex items-center justify-center">
          <Minus className="w-4 h-4" aria-hidden />
        </button>
        <span className="min-w-[3.5rem] text-center text-[15px] font-semibold text-ink" aria-live="polite">
          {value}
        </span>
        <button type="button" onClick={onInc} aria-label={`Plus : ${label}`} className="w-11 h-11 rounded-xl border border-paper-border bg-white flex items-center justify-center">
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
