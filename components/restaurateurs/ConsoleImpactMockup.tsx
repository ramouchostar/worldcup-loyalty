"use client";

import { CountUp, GrowBar, Reveal } from "./motion";

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

// Mockup "ce que le programme t'a rapporté" (bloc Console/Pilotage) — distinct
// de DashboardMockup (réservé au Hero, inchangé) : ici uniquement les chiffres
// d'impact + la prévision, sans sidebar ni file de tâches. Basé sur les
// tickets scannés (jamais "ventes caisse" — aucune intégration caisse
// n'existe aujourd'hui, cf. note d'intégration de la refonte 2026-08-29).
export function ConsoleImpactMockup() {
  return (
    <div className="p-7 flex flex-col gap-4 font-landing">
      <div>
        <h3 className="font-display text-2xl font-bold tracking-tight text-ink m-0">Tableau de bord</h3>
        <p className="text-ink-muted text-[13px] mt-1 mb-0">Vendredi 8 août · 128 membres inscrits</p>
      </div>

      <div className="bg-ink rounded-xl px-6 py-[22px]">
        <div className="flex items-center justify-between mb-3.5">
          <p className="font-mono text-[10.5px] tracking-[0.12em] uppercase text-moss-light m-0">
            Ce que le programme t&apos;a rapporté — 30 derniers jours
          </p>
          <span className="text-xs font-semibold text-moss-light">Détail par plat →</span>
        </div>
        <div className="grid grid-cols-4 gap-3 text-center">
          <Stat value={6100} suffix=" €" label="CA généré (412 tickets scannés)" color="text-white" />
          <Stat value={3965} suffix=" €" label="marge sur articles reconnus" color="text-moss-light" />
          <Stat value={118} suffix=" €" label="coût des 96 cadeaux distribués" color="text-white" />
          <Stat value={3847} suffix=" €" label="gain net estimé" color="text-good" />
        </div>
      </div>

      <div className="bg-white border border-paper-border rounded-xl px-6 py-5">
        <p className="font-mono text-[10.5px] tracking-[0.12em] uppercase text-moss-dark m-0 mb-2">
          Prévisions — semaine prochaine
        </p>
        <p className="font-display text-[26px] font-bold text-ink mt-1 mb-0">
          <CountUp value={7400} suffix=" €" /> – <CountUp value={8200} suffix=" €" />
        </p>
        <p className="text-[12.5px] text-ink-muted mt-1 mb-4">
          Confiance moyenne · calculée sur 11 semaines de tickets scannés
        </p>
        <div className="flex items-end gap-3.5 h-[110px]">
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
    <Reveal>
      <p className={`font-display text-xl font-bold m-0 ${color}`}>
        <CountUp value={value} suffix={suffix} />
      </p>
      <p className="text-[10.5px] text-white/80 mt-[3px] mb-0">{label}</p>
    </Reveal>
  );
}
