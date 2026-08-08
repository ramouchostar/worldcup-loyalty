"use client";

import { useState } from "react";
import type { Entitlement } from "@/lib/entitlements";

// ADR 0029 §5 — paywall DOUX : la fonction reste visible mais verrouillée
// (contenu flouté, jamais caché) + CTA « Demander le plan ». Sans Stripe
// (Phase 5), la demande part vers /platform où le super-admin active à la
// main. Pendant l'essai : simple bandeau compte à rebours, rien n'est bloqué.

const PLAN_LABEL: Record<string, string> = { croissance: "Croissance", pro: "Pro" };

export function RequestPlanButton({
  restaurantId,
  feature,
  requiredPlan,
  className,
}: {
  restaurantId: string;
  feature: string;
  requiredPlan: string;
  className?: string;
}) {
  const [state, setState] = useState<"idle" | "busy" | "sent" | "already" | "error">("idle");

  async function send() {
    setState("busy");
    try {
      const res = await fetch("/api/admin/plan-request", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ restaurantId, plan: requiredPlan, feature }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) { setState("error"); return; }
      setState(body.alreadyPending ? "already" : "sent");
    } catch {
      setState("error");
    }
  }

  if (state === "sent" || state === "already") {
    return (
      <p className="text-sm font-semibold text-green-700 bg-green-50 border border-green-200 rounded-xl px-4 py-2.5 text-center">
        ✓ {state === "already" ? "Demande déjà envoyée" : "Demande envoyée"} — on te recontacte
        très vite.
      </p>
    );
  }

  return (
    <div className="text-center">
      <button
        type="button"
        onClick={send}
        disabled={state === "busy"}
        className={
          className ??
          "bg-brand-red text-white px-5 py-2.5 rounded-xl text-sm font-bold hover:bg-brand-red/85 disabled:opacity-50 transition-colors"
        }
      >
        {state === "busy" ? "…" : `Demander le plan ${PLAN_LABEL[requiredPlan] ?? requiredPlan}`}
      </button>
      {state === "error" && (
        <p className="text-xs text-red-600 mt-2">Échec de l&apos;envoi — réessaie.</p>
      )}
    </div>
  );
}

// Bandeau d'essai en cours — informatif, ne bloque rien.
export function TrialBanner({
  ent,
  restaurantId,
  feature,
}: {
  ent: Entitlement;
  restaurantId: string;
  feature: string;
}) {
  if (ent.state !== "essai") return null;
  return (
    <div className="bg-brand-gold/15 border border-brand-gold/40 rounded-xl px-4 py-3 flex flex-col sm:flex-row sm:items-center gap-2 justify-between">
      <p className="text-sm text-amber-900">
        ⏳ <strong>Essai gratuit</strong> — encore {ent.trialDaysLeft} jour
        {(ent.trialDaysLeft ?? 0) > 1 ? "s" : ""} pour profiter de cette fonction.
      </p>
      <RequestPlanButton
        restaurantId={restaurantId}
        feature={feature}
        requiredPlan={ent.requiredPlan}
        className="bg-brand-dark text-white px-4 py-2 rounded-lg text-xs font-bold hover:bg-gray-800 transition-colors shrink-0"
      />
    </div>
  );
}

// Enveloppe de verrouillage : floute son contenu et pose l'appel à l'action
// par-dessus. Le contenu réel est rendu (la valeur se voit) mais illisible et
// non interactif. Ne JAMAIS y placer l'import de données — la donnée reste
// toujours ouverte (c'est l'actif, ADR 0029 §3).
export function PaywallSection({
  ent,
  restaurantId,
  feature,
  title,
  pitch,
  enabled = true,
  children,
}: {
  ent: Entitlement;
  restaurantId: string;
  feature: string;
  title: string;
  pitch: string;
  // false = pas de donnée à montrer (état vide) → jamais de flou : on ne
  // verrouille que ce qui peut impressionner (ADR 0029 §5).
  enabled?: boolean;
  children: React.ReactNode;
}) {
  if (!enabled || ent.state !== "verrouille") return <>{children}</>;

  return (
    <div className="relative">
      <div className="pointer-events-none select-none blur-[6px] opacity-60" aria-hidden="true">
        {children}
      </div>
      <div className="absolute inset-0 flex items-center justify-center p-4">
        <div className="bg-white/95 border border-gray-200 shadow-xl rounded-2xl p-6 max-w-sm text-center space-y-3">
          <p className="text-3xl" aria-hidden="true">🔒</p>
          <p className="font-bold text-gray-900">{title}</p>
          <p className="text-sm text-gray-500">{pitch}</p>
          <RequestPlanButton restaurantId={restaurantId} feature={feature} requiredPlan={ent.requiredPlan} />
          <p className="text-xs text-gray-400">
            Ton essai gratuit est terminé — tes données restent intactes et continuent de
            s&apos;accumuler.
          </p>
        </div>
      </div>
    </div>
  );
}
