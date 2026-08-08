"use client";

import { Reveal } from "./motion";

const FREE_FEATURES = [
  "Récompenses à marge protégée, calculées sur ta carte",
  "Parrainage client illimité, zéro budget pub",
  "Validation des tickets sans saisie",
  "Supports imprimables à ta charte",
  "Tableau de bord complet",
  "Visibilité sur la page réseau de ton secteur",
];

const PRO_FEATURES = [
  "Prévisions de CA et ventes par plat",
  "Opportunités et promos programmées",
  "Repères anonymisés de ton secteur",
];

export function PlansSection() {
  return (
    <section id="plans" className="bg-paper-subtle py-20 sm:py-24 scroll-mt-16">
      <div className="max-w-[1200px] mx-auto px-5 sm:px-8">
        <Reveal>
          <p className="font-mono text-[11px] tracking-[0.12em] uppercase text-moss-dark mb-3.5">▶ Plans</p>
          <h2 className="font-display text-[28px] sm:text-[33px] lg:text-[39px] leading-[1.2] tracking-[-0.02em] font-bold text-ink max-w-[640px] text-pretty">
            Gratuit pour démarrer, et ça ne se dégrade jamais.
          </h2>
        </Reveal>

        <div className="grid sm:grid-cols-2 gap-6 mt-10 items-start">
          <Reveal delay={100}>
            <div className="bg-white border-[1.5px] border-moss rounded-xl p-8 relative h-full">
              <span className="absolute -top-3 left-8 bg-moss text-white font-mono text-[10px] tracking-[0.12em] uppercase px-3 py-1 rounded-full">
                Disponible aujourd&apos;hui
              </span>
              <h3 className="font-display text-[25px] font-bold mt-2 mb-1">Gratuit</h3>
              <p className="text-sm text-ink-muted mb-[22px]">
                Le moteur complet du programme, sans limite de temps.
              </p>
              <div className="flex flex-col gap-3">
                {FREE_FEATURES.map((f) => (
                  <p key={f} className="text-[14.5px] text-ink-body m-0">
                    <span className="font-mono text-moss">✓</span>&nbsp; {f}
                  </p>
                ))}
              </div>
            </div>
          </Reveal>

          <Reveal delay={180}>
            <div className="bg-white border border-paper-border rounded-xl p-8 h-full">
              <span className="inline-block bg-paper-subtle text-ink-muted font-mono text-[10px] tracking-[0.12em] uppercase px-3 py-1 rounded-full">
                En construction
              </span>
              <h3 className="font-display text-[25px] font-bold mt-3.5 mb-1">Croissance &amp; Pro</h3>
              <p className="text-sm text-ink-muted mb-[22px]">
                L&apos;analytique de ton établissement, puis les repères de ton secteur.
              </p>
              <div className="flex flex-col gap-3">
                {PRO_FEATURES.map((f) => (
                  <p key={f} className="text-[14.5px] text-ink-muted m-0">
                    <span className="font-mono text-ink-faint">·</span>&nbsp; {f}
                  </p>
                ))}
              </div>
              <p className="text-[13px] text-ink-faint leading-relaxed mt-7">
                Les premiers restaurants du réseau y auront accès en priorité. Aucune fonction gratuite
                d&apos;aujourd&apos;hui ne passera derrière un paywall.
              </p>
            </div>
          </Reveal>
        </div>
      </div>
    </section>
  );
}
