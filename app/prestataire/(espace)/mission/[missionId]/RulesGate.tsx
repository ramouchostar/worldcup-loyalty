"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Check } from "lucide-react";
import { Card, SectionLabel } from "@/components/admin/ui";
import { RulesList } from "@/components/missions/RulesList";
import { rulesFor, rulesVersionFor, type RulesKind } from "@/lib/mission-rules";
import { useT } from "@/components/i18n/I18nProvider";

// ADR 0084 §3 — avant son premier devis, le prestataire lit les règles du jeu et les accepte (une fois par version).
// Il peut refuser un brief sans les avoir acceptées : seule la prise d'engagement (le devis) les exige.

export function RulesGate({ kind = "tournage" }: { kind?: RulesKind }) {
  const router = useRouter();
  const tr = useT();
  const { t, locale } = tr;
  const [on, setOn] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function accept() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/prestataire/rules/accept", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ accepted: true, version: rulesVersionFor(kind) }) });
      const body = await res.json().catch(() => ({}));
      if (res.ok) return router.refresh();
      setError(tr.err(body, "err.generic"));
    } catch {
      setError(t("err.network"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card className="space-y-4">
      <div>
        <SectionLabel>{t("rules.title")}</SectionLabel>
        <p className="text-[13.5px] text-ink-muted mt-1">{t("rules.intro")}</p>
        {locale !== "fr" && <p className="text-[13px] font-semibold text-ink mt-2">{t("rules.frenchOnly")}</p>}
      </div>
      <RulesList rules={rulesFor("provider", kind)} />
      <button type="button" role="checkbox" aria-checked={on} onClick={() => setOn((v) => !v)} className={`w-full flex items-start gap-3 text-left rounded-xl border p-3 min-h-[44px] ${on ? "border-boost-olive bg-boost-cream" : "border-paper-border bg-white"}`}>
        <span className={`mt-0.5 w-5 h-5 shrink-0 rounded border flex items-center justify-center ${on ? "bg-boost-olive border-boost-olive text-white" : "border-ink-faint bg-white"}`}>{on && <Check className="w-3.5 h-3.5" aria-hidden />}</span>
        <span className="text-[14px] font-semibold text-ink">{t("rules.accept")}</span>
      </button>
      {error && (
        <p role="alert" className="text-danger text-[13.5px] font-semibold">
          {error}
        </p>
      )}
      <button type="button" disabled={!on || busy} onClick={accept} className="w-full inline-flex items-center justify-center min-h-[44px] px-5 rounded-xl bg-boost-olive text-white text-[14px] font-semibold shadow-[inset_0_-3px_0_#4F5C2D] hover:brightness-95 disabled:opacity-50">
        {busy ? "…" : t("rules.continue")}
      </button>
    </Card>
  );
}
