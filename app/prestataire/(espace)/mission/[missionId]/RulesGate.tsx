"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Check } from "lucide-react";
import { Card, SectionLabel } from "@/components/admin/ui";
import { RulesList } from "@/components/missions/RulesList";
import { RULES_ACCEPT_LABEL, rulesFor, rulesVersionFor } from "@/lib/mission-rules";
import type { MetierFamily } from "@/lib/mission-metier";

// ADR 0084 §3 — avant son premier devis, le prestataire lit les règles du jeu et les accepte (une fois par version).
// Il peut refuser un brief sans les avoir acceptées : seule la prise d'engagement (le devis) les exige.

export function RulesGate({ family = "tournage" }: { family?: MetierFamily }) {
  const router = useRouter();
  const [on, setOn] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function accept() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/prestataire/rules/accept", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ accepted: true, version: rulesVersionFor(family) }) });
      const body = await res.json().catch(() => ({}));
      if (res.ok) return router.refresh();
      setError(body.error ?? "Impossible pour le moment. Réessaie.");
    } catch {
      setError("Pas de connexion. Réessaie dans un instant.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card className="space-y-4">
      <div>
        <SectionLabel>Les règles du jeu</SectionLabel>
        <p className="text-[13.5px] text-ink-muted mt-1">Avant ton premier devis, lis ces règles : elles protègent le restaurateur et toi.</p>
      </div>
      <RulesList rules={rulesFor("provider", family)} />
      <button type="button" role="checkbox" aria-checked={on} onClick={() => setOn((v) => !v)} className={`w-full flex items-start gap-3 text-left rounded-xl border p-3 min-h-[44px] ${on ? "border-boost-olive bg-boost-cream" : "border-paper-border bg-white"}`}>
        <span className={`mt-0.5 w-5 h-5 shrink-0 rounded border flex items-center justify-center ${on ? "bg-boost-olive border-boost-olive text-white" : "border-ink-faint bg-white"}`}>{on && <Check className="w-3.5 h-3.5" aria-hidden />}</span>
        <span className="text-[14px] font-semibold text-ink">{RULES_ACCEPT_LABEL.provider}</span>
      </button>
      {error && (
        <p role="alert" className="text-danger text-[13.5px] font-semibold">
          {error}
        </p>
      )}
      <button type="button" disabled={!on || busy} onClick={accept} className="w-full inline-flex items-center justify-center min-h-[44px] px-5 rounded-xl bg-boost-olive text-white text-[14px] font-semibold shadow-[inset_0_-3px_0_#4F5C2D] hover:brightness-95 disabled:opacity-50">
        {busy ? "…" : "J'accepte et je continue"}
      </button>
    </Card>
  );
}
