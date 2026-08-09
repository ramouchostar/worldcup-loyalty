"use client";

import { CountUp, GrowBar } from "./motion";

const DAYS = [
  { label: "LUN", height: 44, tone: "muted" as const },
  { label: "MAR", height: 32, tone: "muted" as const },
  { label: "MER", height: 56, tone: "muted" as const },
  { label: "JEU", height: 68, tone: "light" as const },
  { label: "VEN", height: 86, tone: "best" as const },
  { label: "SAM", height: 80, tone: "best" as const },
  { label: "DIM", height: 50, tone: "muted" as const },
];

const BAR_COLOR: Record<(typeof DAYS)[number]["tone"], string> = {
  muted: "bg-paper-border",
  light: "bg-moss-light",
  best: "bg-moss",
};

// Version mobile-native du mockup "Prévisions" — mêmes chiffres que
// ForecastMockup (desktop), graphique plus compact adapté à une largeur de
// téléphone au lieu d'une capture desktop réduite.
export function ForecastMockupMobile() {
  return (
    <div className="flex flex-col gap-3 font-landing">
      <h3 className="font-display text-lg font-bold tracking-tight text-ink m-0">Prévisions</h3>

      <div className="bg-ink rounded-xl px-4 py-4">
        <p className="font-mono text-[10px] tracking-[0.1em] uppercase text-moss-light m-0">Semaine prochaine</p>
        <p className="font-display text-2xl font-bold text-white mt-1.5 mb-0">
          <CountUp value={4100} suffix=" €" /> – <CountUp value={4700} suffix=" €" />
        </p>
        <p className="text-xs text-white/80 mt-1 mb-0">Confiance élevée · 12 semaines de ventes caisse</p>
      </div>

      <div className="bg-white border border-paper-border rounded-xl px-4 py-4">
        <div className="flex items-end gap-2 h-[100px]">
          {DAYS.map((d, i) => (
            <div key={d.label} className="flex-1 flex flex-col items-center gap-1.5 h-full justify-end">
              <GrowBar
                heightPx={d.height}
                delay={i * 70}
                className={`w-full rounded-t ${BAR_COLOR[d.tone]}`}
              />
              <span
                className={`font-mono text-[9px] ${
                  d.tone === "best" ? "text-moss-dark font-semibold" : "text-ink-faint"
                }`}
              >
                {d.label}
              </span>
            </div>
          ))}
        </div>
        <p className="text-xs text-ink-muted mt-3 mb-0 pt-3 border-t border-paper-border">
          Vendredi reste ton meilleur soir. Mardi décroche depuis 3 semaines — une promo ciblée est proposée dans
          Opportunités.
        </p>
      </div>
    </div>
  );
}
