"use client";

import { Reveal } from "./motion";

// ADR 0070 — le chiffre qui parle au restaurateur, sans paragraphe : ce qu'il
// laisse à l'intermédiaire sur une commande de 25 €. Frais de carte (~1,5 %)
// identiques partout, donc hors comparaison.
const ROWS = [
  { label: "Plateforme de livraison", note: "25 à 35 %", amount: "≈ 7,50 €", highlight: false },
  { label: "Boosteats Croissance", note: "5 %", amount: "1,25 €", highlight: false },
  { label: "Boosteats Pro", note: "0 %", amount: "0 €", highlight: true },
];

export function CommissionBand() {
  return (
    <section className="max-w-[1100px] mx-auto px-5 sm:px-8 py-20 sm:py-24">
      <Reveal>
        <h2 className="font-display text-[30px] sm:text-[40px] lg:text-[48px] leading-[1.15] tracking-[-0.02em] font-bold text-ink text-center text-pretty m-0">
          Sur une commande de 25 €, tu laisses :
        </h2>
      </Reveal>
      <div className="grid sm:grid-cols-3 gap-4 mt-10">
        {ROWS.map((r, i) => (
          <Reveal key={r.label} delay={i * 100}>
            <div
              className={`rounded-2xl px-5 py-4 sm:px-6 sm:py-7 h-full flex items-center justify-between gap-4 sm:flex-col-reverse sm:justify-center sm:gap-0 sm:text-center ${
                r.highlight ? "bg-moss-tint border-[1.5px] border-moss" : "bg-white border border-paper-border"
              }`}
            >
              <div>
                <p className="text-[15px] font-semibold text-ink m-0 sm:mt-2">{r.label}</p>
                <p className="text-[13px] text-ink-faint m-0">{r.note}</p>
              </div>
              <p
                className={`font-display text-[28px] sm:text-[40px] font-bold m-0 whitespace-nowrap ${r.highlight ? "text-moss-dark" : "text-ink"}`}
              >
                {r.amount}
              </p>
            </div>
          </Reveal>
        ))}
      </div>
      <p className="text-[12px] text-ink-faint text-center mt-5 mb-0">
        Hors frais de carte bancaire (≈ 1,5 %), les mêmes partout.
      </p>
    </section>
  );
}
