"use client";

import { CalendarDays, CloudRain, Star, Store, Trophy, UserMinus } from "lucide-react";
import { Reveal } from "./motion";

// ADR 0074 §8 — le copilote marketing en une image : un signal que
// l'établissement ne surveille pas, et l'action qui part en un clic. Remplace
// la bande « commission » (site de commande retiré de la feuille de route).
// Pas encore livré : présenté en places pilotes, jamais comme disponible.
const SIGNALS = [
  { icon: CloudRain, signal: "Pluie jeudi soir", action: "Relance de l'emporter auprès des habitués" },
  { icon: Trophy, signal: "Match des Diables samedi", action: "Offre à partager avant le coup d'envoi" },
  { icon: UserMinus, signal: "38 clients ne reviennent plus", action: "Relance au rythme de chacun" },
  { icon: Store, signal: "Un concurrent ouvre à 400 m", action: "Les habitués relancés la même semaine" },
  { icon: CalendarDays, signal: "Vacances flamandes et francophones décalées", action: "Deux vagues de familles, deux offres" },
  { icon: Star, signal: "Un avis à deux étoiles", action: "Une réponse proposée, à publier en un geste" },
];

export function SignalsBand() {
  return (
    <section className="max-w-[1100px] mx-auto px-5 sm:px-8 py-20 sm:py-24">
      <Reveal>
        <p className="font-mono text-[11px] tracking-[0.12em] uppercase text-moss-dark mb-3.5 text-center">
          ▶ Le copilote · Pro · places pilotes
        </p>
        <h2 className="font-display text-[30px] sm:text-[40px] lg:text-[48px] leading-[1.15] tracking-[-0.02em] font-bold text-ink text-center text-pretty m-0">
          Le marketing de la semaine, déjà pensé.
        </h2>
        <p className="text-base leading-[1.7] text-ink-muted text-center mt-4 mb-0 max-w-[600px] mx-auto">
          Chaque lundi, trois actions prêtes, tirées de ce qui se passe autour de l&apos;établissement. Un clic pour
          envoyer, et le résultat mesuré.
        </p>
      </Reveal>
      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4 mt-10">
        {SIGNALS.map((s, i) => (
          <Reveal key={s.signal} delay={(i % 3) * 80}>
            <div className="bg-white border border-paper-border rounded-2xl px-5 py-5 h-full">
              <div className="flex items-center gap-3">
                <span className="w-9 h-9 shrink-0 rounded-xl bg-moss-tint flex items-center justify-center">
                  <s.icon className="w-[18px] h-[18px] text-moss-dark" strokeWidth={2.2} />
                </span>
                <p className="text-[15px] font-semibold text-ink m-0">{s.signal}</p>
              </div>
              <p className="text-[14px] text-ink-muted mt-3 mb-0">
                <span className="font-mono text-moss">→</span>&nbsp; {s.action}
              </p>
            </div>
          </Reveal>
        ))}
      </div>
    </section>
  );
}
