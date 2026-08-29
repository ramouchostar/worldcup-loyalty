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

// Version mobile-native de ConsoleImpactMockup — mêmes chiffres, composition
// mobile au lieu d'une capture desktop réduite.
export function ConsoleImpactMockupMobile() {
  return (
    <div className="flex flex-col gap-3 font-landing">
      <div>
        <h3 className="font-display text-lg font-bold tracking-tight text-ink m-0">Tableau de bord</h3>
        <p className="text-ink-muted text-xs mt-0.5 mb-0">Vendredi 8 août · 128 membres inscrits</p>
      </div>

      <div className="bg-ink rounded-xl px-4 py-4">
        <p className="font-mono text-[9.5px] tracking-[0.1em] uppercase text-moss-light m-0 mb-2.5">
          Ce que le programme t&apos;a rapporté — 30j
        </p>
        <div className="grid grid-cols-2 gap-3 text-center">
          <Stat value={6100} suffix=" €" label="CA généré (412 tickets scannés)" color="text-white" />
          <Stat value={3965} suffix=" €" label="marge sur articles reconnus" color="text-moss-light" />
          <Stat value={118} suffix=" €" label="coût des 96 cadeaux" color="text-white" />
          <Stat value={3847} suffix=" €" label="gain net estimé" color="text-good" />
        </div>
      </div>

      <div className="bg-white border border-paper-border rounded-xl px-4 py-4">
        <p className="font-mono text-[10px] tracking-[0.1em] uppercase text-moss-dark m-0 mb-1.5">
          Prévisions — semaine prochaine
        </p>
        <p className="font-display text-xl font-bold text-ink mt-1 mb-0">
          <CountUp value={7400} suffix=" €" /> – <CountUp value={8200} suffix=" €" />
        </p>
        <p className="text-[11px] text-ink-muted mt-1 mb-3">Confiance moyenne · 11 semaines de tickets scannés</p>
        <div className="flex items-end gap-2 h-[90px]">
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
          Vendredi reste ton meilleur soir. Mardi décroche depuis 3 semaines — une promo ciblée t&apos;attend dans
          Opportunités.
        </p>
      </div>
    </div>
  );
}

function Stat({
  value,
  suffix,
  label,
  color,
}: {
  value: number;
  suffix: string;
  label: string;
  color: string;
}) {
  return (
    <div>
      <p className={`font-display text-base font-bold m-0 ${color}`}>
        <CountUp value={value} suffix={suffix} />
      </p>
      <p className="text-[9.5px] text-white/80 mt-0.5 mb-0 leading-tight">{label}</p>
    </div>
  );
}
