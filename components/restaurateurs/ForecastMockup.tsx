"use client";

import { CountUp, GrowBar } from "./motion";

const DAYS = [
  { label: "LUN", height: 62, tone: "muted" as const },
  { label: "MAR", height: 44, tone: "muted" as const },
  { label: "MER", height: 78, tone: "muted" as const },
  { label: "JEU", height: 96, tone: "light" as const },
  { label: "VEN", height: 120, tone: "best" as const },
  { label: "SAM", height: 112, tone: "best" as const },
  { label: "DIM", height: 70, tone: "muted" as const },
];

const BAR_COLOR: Record<(typeof DAYS)[number]["tone"], string> = {
  muted: "bg-paper-border",
  light: "bg-moss-light",
  best: "bg-moss",
};

// Réplique du mockup "Prévisions" (/admin/[id]/forecast) du design Claude —
// le graphique se dessine barre par barre à l'entrée dans le viewport.
export function ForecastMockup() {
  return (
    <div className="p-7 flex flex-col gap-4 font-landing">
      <h3 className="font-display text-2xl font-bold tracking-tight text-ink m-0">Prévisions</h3>

      <div className="bg-ink rounded-xl px-6 py-[22px]">
        <p className="font-mono text-[10.5px] tracking-[0.12em] uppercase text-moss-light m-0">
          Semaine prochaine
        </p>
        <p className="font-display text-[34px] font-bold text-white mt-2 mb-0">
          <CountUp value={4100} suffix=" €" /> – <CountUp value={4700} suffix=" €" />
        </p>
        <p className="text-[13px] text-white/80 mt-1.5 mb-0">
          Confiance élevée · calculée sur 12 semaines de ventes caisse
        </p>
      </div>

      <div className="bg-white border border-paper-border rounded-xl px-6 py-5">
        <div className="flex items-end gap-3.5 h-[150px]">
          {DAYS.map((d, i) => (
            <div key={d.label} className="flex-1 flex flex-col items-center gap-2 h-full justify-end">
              <GrowBar
                heightPx={d.height}
                delay={i * 70}
                className={`w-full rounded-t ${BAR_COLOR[d.tone]}`}
              />
              <span
                className={`font-mono text-[10px] ${
                  d.tone === "best" ? "text-moss-dark font-semibold" : "text-ink-faint"
                }`}
              >
                {d.label}
              </span>
            </div>
          ))}
        </div>
        <p className="text-[12.5px] text-ink-muted mt-4 mb-0 pt-3.5 border-t border-paper-border">
          Vendredi reste ton meilleur soir. Mardi décroche depuis 3 semaines — une promo ciblée est proposée dans
          Opportunités.
        </p>
      </div>
    </div>
  );
}
