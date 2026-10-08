"use client";

import { useState } from "react";
import { Check, Clapperboard, MapPin, type LucideIcon } from "lucide-react";
import type { Plan } from "@/lib/entitlements";
import { AD_FEE_PCT } from "@/lib/service-offers";
import type { ServiceKind } from "@/lib/service-requests";

// Missions pour aller plus vite (ADR 0081 §6) — dès l'étape 1, on propose
// déjà une pub dans la zone et des vidéos. Tant que ces services ne sont pas
// intégrés à l'app, le bouton enregistre une DEMANDE (service_requests) que
// l'équipe voit sur /platform et rappelle : on ne promet que ce qui se passe.

type Status = "idle" | "sending" | "sent" | "error";

const MISSIONS: { service: ServiceKind; icon: LucideIcon; title: string; text: (fee: number) => string; cta: string }[] = [
  {
    service: "pub",
    icon: MapPin,
    title: "Une pub dans ta zone",
    text: (fee) =>
      `Montre ta maison aux gens à quelques kilomètres qui ne te connaissent pas encore, sur Instagram et Facebook. Notre équipe la prépare avec toi. Frais de service : ${fee} % du budget.`,
    cta: "Je veux une pub",
  },
  {
    service: "video",
    icon: Clapperboard,
    title: "Des vidéos de ta maison",
    text: () => "Pas encore de vidéos de tes plats ? Des vidéastes spécialisés en restaurant te font un devis, et tu choisis.",
    cta: "Je veux des vidéos",
  },
];

export function GrowthMissions({
  restaurantId,
  plan,
  pending,
  source,
}: {
  restaurantId: string;
  plan: Plan;
  pending: ServiceKind[];
  source: "accueil_etape1" | "accueil_etape2";
}) {
  const [status, setStatus] = useState<Record<ServiceKind, Status>>({
    pub: pending.includes("pub") ? "sent" : "idle",
    video: pending.includes("video") ? "sent" : "idle",
  });

  async function ask(service: ServiceKind) {
    setStatus((s) => ({ ...s, [service]: "sending" }));
    try {
      const res = await fetch("/api/admin/service-request", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ restaurantId, service, source }),
      });
      setStatus((s) => ({ ...s, [service]: res.ok ? "sent" : "error" }));
    } catch {
      setStatus((s) => ({ ...s, [service]: "error" }));
    }
  }

  return (
    <section className="bg-white border border-paper-border rounded-2xl p-5" aria-labelledby="missions-plus-vite">
      <p className="font-mono text-[11px] tracking-[0.12em] uppercase text-boost-olive-dark">Pour aller plus vite</p>
      <h2 id="missions-plus-vite" className="font-brand-display text-[20px] font-extrabold text-ink mt-1">
        Deux missions qui remplissent les jauges
      </h2>
      <ul className="mt-4 space-y-3">
        {MISSIONS.map((m) => {
          const st = status[m.service];
          const Icon = m.icon;
          return (
            <li key={m.service} className="flex gap-3.5 rounded-xl bg-paper p-4">
              <span className="w-10 h-10 rounded-xl bg-boost-cream flex items-center justify-center shrink-0" aria-hidden="true">
                <Icon size={20} strokeWidth={2} className="text-boost-olive-dark" />
              </span>
              <div className="flex-1 min-w-0">
                <p className="text-[15px] font-semibold text-ink">{m.title}</p>
                <p className="text-[13px] text-ink-muted mt-0.5">{m.text(AD_FEE_PCT[plan])}</p>
                {st === "sent" ? (
                  <p className="flex items-center gap-1.5 text-[13.5px] font-semibold text-boost-olive-dark mt-3" role="status">
                    <Check size={16} strokeWidth={2.6} aria-hidden="true" />
                    Demande envoyée : notre équipe te rappelle.
                  </p>
                ) : (
                  <>
                    <button
                      type="button"
                      onClick={() => ask(m.service)}
                      disabled={st === "sending"}
                      className="mt-3 min-h-[44px] px-4 rounded-xl bg-boost-olive text-white text-[14px] font-semibold shadow-[inset_0_-3px_0_#4F5C2D] hover:bg-boost-olive-dark transition-colors disabled:opacity-60"
                    >
                      {st === "sending" ? "Envoi…" : m.cta}
                    </button>
                    {st === "error" && (
                      <p className="text-[12.5px] text-danger mt-2" role="alert">
                        Demande impossible pour le moment. Réessaie plus tard.
                      </p>
                    )}
                  </>
                )}
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
