"use client";

import { Reveal } from "./motion";
import { BrowserWindow } from "./BrowserWindow";
import { InsightsMockup } from "./InsightsMockup";
import { MobileScreenCard } from "./MobileScreenCard";
import { InsightsMockupMobile } from "./InsightsMockupMobile";

const OPPORTUNITY_POINTS = [
  "Chaque promo est chiffrée avant d'être lancée — tu vois le CA attendu et le coût matière",
  "L'app propose, tu décides — rien n'est jamais appliqué sans toi",
  "L'annonce part au bon moment, jamais trop tôt",
];

export function ProductSection() {
  return (
    <section id="produit" className="max-w-[1200px] mx-auto px-5 sm:px-8 pt-20 sm:pt-24 pb-24 scroll-mt-16">
      <div className="grid lg:grid-cols-[1fr_1.15fr] gap-10 lg:gap-14 items-center">
        <Reveal>
          <TextBlock
            eyebrow="Opportunités"
            title="L'app te dit quoi faire mardi soir, pas juste ce qui s'est passé."
            desc="Chaque suggestion part de tes ventes réelles et de ta carte : un jour creux à remplir, un combo que tes clients composent déjà eux-mêmes, un groupe de clients qui n'est pas revenu depuis trois semaines. Tu vois le chiffre qui justifie la proposition, tu lances en un clic, ou tu ignores."
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
      <h2 className="font-display text-[34px] sm:text-[44px] lg:text-[54px] leading-[1.2] tracking-[-0.02em] font-bold text-ink text-pretty">
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
