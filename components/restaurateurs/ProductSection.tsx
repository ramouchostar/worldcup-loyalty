"use client";

import { Reveal } from "./motion";
import { BrowserWindow } from "./BrowserWindow";
import { InsightsMockup } from "./InsightsMockup";
import { ForecastMockup } from "./ForecastMockup";
import { MobileScreenCard } from "./MobileScreenCard";
import { InsightsMockupMobile } from "./InsightsMockupMobile";
import { ForecastMockupMobile } from "./ForecastMockupMobile";

const OPPORTUNITY_POINTS = [
  "Calcul déterministe — chaque promo est explicable par ses chiffres",
  "L'app propose, tu décides — rien n'est appliqué sans toi",
  "Annonce envoyée au bon moment, jamais trop tôt",
];

const FORECAST_POINTS = [
  "Basée sur tes ventes caisse, pas sur des moyennes du secteur",
  "Chaque facteur est affiché — tu peux contredire le modèle",
];

export function ProductSection() {
  return (
    <section id="produit" className="max-w-[1200px] mx-auto px-5 sm:px-8 pt-20 sm:pt-24 scroll-mt-16">
      <div className="grid lg:grid-cols-[1fr_1.15fr] gap-10 lg:gap-14 items-center">
        <Reveal>
          <TextBlock
            eyebrow="Opportunités"
            title="L'app te dit quoi faire mardi soir, pas juste ce qui s'est passé."
            desc="Chaque suggestion part de tes propres ventes et de ta carte : jour creux, combo qui manque, promo qui tient la marge. Tu vois le chiffre qui la justifie, tu lances en un clic, et tu suis ce qui tourne déjà."
            points={OPPORTUNITY_POINTS}
          />
        </Reveal>

        <Reveal delay={120} y={28}>
          <div className="md:hidden">
            <MobileScreenCard url="/admin/belchicken/insights">
              <InsightsMockupMobile />
            </MobileScreenCard>
          </div>
          <div className="hidden md:block">
            <BrowserWindow url="/admin/belchicken/insights" scaleWidth={900}>
              <InsightsMockup />
            </BrowserWindow>
          </div>
        </Reveal>
      </div>

      <div className="grid lg:grid-cols-[1.15fr_1fr] gap-10 lg:gap-14 items-center pt-24 pb-24">
        <Reveal y={28} className="order-2 lg:order-1">
          <div className="md:hidden">
            <MobileScreenCard url="/admin/belchicken/forecast">
              <ForecastMockupMobile />
            </MobileScreenCard>
          </div>
          <div className="hidden md:block">
            <BrowserWindow url="/admin/belchicken/forecast" scaleWidth={900}>
              <ForecastMockup />
            </BrowserWindow>
          </div>
        </Reveal>

        <Reveal delay={120} className="order-1 lg:order-2">
          <TextBlock
            eyebrow="Prévisions CA"
            title="Tu sais ce que va faire ta semaine avant de commander tes stocks."
            desc="Une fourchette, un niveau de confiance, les facteurs visibles. Pas de boule de cristal : si la donnée manque, l'app te le dit au lieu d'inventer un chiffre."
            points={FORECAST_POINTS}
          />
        </Reveal>
      </div>
    </section>
  );
}

function TextBlock({
  eyebrow,
  title,
  desc,
  points,
}: {
  eyebrow: string;
  title: string;
  desc: string;
  points: string[];
}) {
  return (
    <div>
      <p className="font-mono text-[11px] tracking-[0.12em] uppercase text-moss-dark mb-4">▶ {eyebrow}</p>
      <h2 className="font-display text-[28px] sm:text-[33px] lg:text-[39px] leading-[1.2] tracking-[-0.02em] font-bold text-ink text-pretty">
        {title}
      </h2>
      <p className="font-landing text-base leading-[1.7] text-ink-muted mt-5">{desc}</p>
      <div className="flex flex-col gap-2.5 mt-6">
        {points.map((point) => (
          <p key={point} className="text-[14.5px] text-ink-body m-0">
            <span className="font-mono text-moss">✓</span>&nbsp; {point}
          </p>
        ))}
      </div>
    </div>
  );
}
