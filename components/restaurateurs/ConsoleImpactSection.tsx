"use client";

import { Reveal } from "./motion";
import { BrowserWindow } from "./BrowserWindow";
import { MobileScreenCard } from "./MobileScreenCard";
import { ConsoleImpactMockup } from "./ConsoleImpactMockup";
import { ConsoleImpactMockupMobile } from "./ConsoleImpactMockupMobile";

const POINTS = [
  "Calculé sur tes tickets réels, pas sur des moyennes du secteur",
  "Chaque facteur est affiché — tu peux contredire le modèle",
  "Si la donnée manque, l'app te le dit au lieu d'inventer un chiffre",
];

export function ConsoleImpactSection() {
  return (
    <section id="pilotage" className="bg-paper-subtle py-20 sm:py-24 scroll-mt-16">
      <div className="max-w-[1200px] mx-auto px-5 sm:px-8">
        <Reveal>
          <p className="font-mono text-[11px] tracking-[0.12em] uppercase text-moss-dark mb-3.5">▶ Pilotage</p>
          <h2 className="font-display text-[28px] sm:text-[33px] lg:text-[39px] leading-[1.2] tracking-[-0.02em] font-bold text-ink max-w-[640px] text-pretty">
            Tu vois exactement ce que le programme t&apos;a rapporté.
          </h2>
          <p className="font-landing text-base leading-[1.7] text-ink-muted mt-5 max-w-[640px]">
            Pas un score d&apos;engagement, pas un taux de rétention. Le chiffre d&apos;affaires généré par les
            clients du programme, la marge dessus, et ce qu&apos;il t&apos;a coûté. Détaillé par plat si tu veux
            creuser.
          </p>
        </Reveal>

        <Reveal delay={120} y={28}>
          <div className="mt-8 md:hidden">
            <MobileScreenCard url="boosteats.app/admin/belchicken">
              <ConsoleImpactMockupMobile />
            </MobileScreenCard>
          </div>
          <div className="mt-8 hidden md:block">
            <BrowserWindow url="boosteats.app/admin/belchicken" scaleWidth={1100}>
              <ConsoleImpactMockup />
            </BrowserWindow>
          </div>
        </Reveal>

        <Reveal delay={180}>
          <div className="flex flex-col gap-2.5 mt-8 max-w-[640px]">
            {POINTS.map((point) => (
              <p key={point} className="text-[14.5px] text-ink-body m-0">
                <span className="font-mono text-moss">✓</span>&nbsp; {point}
              </p>
            ))}
          </div>
        </Reveal>
      </div>
    </section>
  );
}
