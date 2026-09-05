"use client";

import { TrackedLink } from "@/components/analytics/TrackedLink";
import { Reveal, RotatingWords, useParallaxOffset } from "./motion";
import { BrowserWindow } from "./BrowserWindow";
import { DashboardMockup } from "./DashboardMockup";
import { FloatingFoodIcon } from "./FloatingFoodIcon";

const BOOSTED_BENEFITS = [
  "ton volume de commandes",
  "la fidélité de tes clients",
  "ton revenu net",
  "le bouche-à-oreille",
];

export function Hero() {
  const blobRef = useParallaxOffset(0.12);

  return (
    <section className="relative bg-paper overflow-hidden">
      <div
        ref={blobRef}
        className="absolute -top-[220px] -right-40 w-[760px] h-[760px] pointer-events-none"
        style={{ background: "radial-gradient(circle, rgba(162,197,35,0.18), transparent 60%)" }}
      />

      <FloatingFoodIcon icon="burger" className="hidden lg:block top-24 left-8 -rotate-12" />

      <div className="relative max-w-[1200px] mx-auto px-5 sm:px-8 pt-16 sm:pt-20 pb-0">
        <div className="max-w-[800px] mx-auto text-center">
          <Reveal>
            <p className="font-mono text-xs tracking-[0.12em] uppercase text-moss-dark mb-5">
              ▶ Pour les restaurateurs
            </p>
          </Reveal>
          <Reveal delay={80}>
            <h1 className="font-display text-[38px] sm:text-[48px] lg:text-[58px] leading-[1.05] tracking-[-0.04em] font-bold text-ink text-pretty">
              Ton assistant qui booste
              <br />
              <RotatingWords words={BOOSTED_BENEFITS} className="text-moss-dark" />
            </h1>
          </Reveal>
          <Reveal delay={160}>
            <p className="font-landing text-base sm:text-lg leading-[1.7] text-ink-muted mt-6 max-w-[640px] mx-auto">
              Reprends la main sur les clients que les plateformes de livraison te prennent. Chaque cadeau est
              calculé sur ton propre prix de revient et plafonné par le CA qu&apos;il a généré. Côté client,
              l&apos;app porte ton nom, tes couleurs et ton logo.
            </p>
          </Reveal>
          <Reveal delay={240}>
            <div className="flex items-center justify-center gap-4 mt-8 flex-wrap">
              <TrackedLink
                ctaId="devenir_partenaire"
                ctaLocation="hero"
                audience="restaurateur"
                href="/become-a-partner"
                className="bg-moss text-white text-[15px] font-bold px-[26px] py-[15px] rounded-lg hover:bg-moss-dark transition-colors"
              >
                Commencer le plan gratuit →
              </TrackedLink>
              <TrackedLink
                ctaId="voir_le_produit"
                ctaLocation="hero"
                audience="restaurateur"
                href="#produit"
                className="text-ink text-[15px] font-semibold py-[15px] hover:text-moss-dark transition-colors"
              >
                Voir le produit
              </TrackedLink>
            </div>
          </Reveal>
          <Reveal delay={270}>
            <p className="font-mono text-[11px] tracking-[0.1em] uppercase text-ink-faint mt-6">
              Compte créé instantanément · sans carte bancaire · 0 % de commission
            </p>
          </Reveal>
          <Reveal delay={300}>
            <p className="text-ink-faint text-sm mt-2">
              Belchicken, Uccle — 128 membres inscrits en 9 semaines.
            </p>
          </Reveal>
        </div>

        <Reveal delay={360} y={28}>
          <div className="mt-12 lg:mt-14 pb-16 lg:pb-20">
            <BrowserWindow url="boosteats.app/admin/belchicken" scaleWidth={1400} chromeHeight={34}>
              <DashboardMockup />
            </BrowserWindow>
          </div>
        </Reveal>
      </div>
    </section>
  );
}
