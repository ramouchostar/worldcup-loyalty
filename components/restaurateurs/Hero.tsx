"use client";

import { TrackedLink } from "@/components/analytics/TrackedLink";
import { Reveal, RotatingWords, useParallaxOffset } from "./motion";
import { HeroPhoneMockup } from "./HeroPhoneMockup";

// Héros resserré (2026-09-26, sur le modèle d'owner.com) : le titre, une
// phrase, puis la console dans un iPhone posé sur un panneau vert. Le bouton
// principal flotte sur le bas du téléphone, comme la barre de recherche
// d'Owner — il reste le premier geste de la page.
const BOOSTED_BENEFITS = [
  "la fidélité des clients",
  "les ventes directes",
  "la place sur Google",
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

      <div className="relative max-w-[1200px] mx-auto px-5 sm:px-8 pt-14 sm:pt-20 pb-16 sm:pb-20">
        <div className="max-w-[800px] mx-auto text-center">
          <Reveal>
            <h1 className="font-display text-[38px] sm:text-[48px] lg:text-[58px] leading-[1.05] tracking-[-0.04em] font-bold text-ink text-pretty">
              L&apos;assistant qui booste
              <br />
              <RotatingWords words={BOOSTED_BENEFITS} className="text-moss-dark" />
            </h1>
          </Reveal>
          <Reveal delay={100}>
            <p className="font-landing text-base sm:text-lg leading-[1.6] text-ink-muted mt-5 max-w-[560px] mx-auto">
              Fidélité, commande en ligne et acquisition : tout ce qui remplit un restaurant, dans une seule app.
            </p>
          </Reveal>
        </div>

        <Reveal delay={200} y={28}>
          <div className="relative mt-10 sm:mt-12 max-w-[1000px] mx-auto">
            {/* Panneau vert : le téléphone déborde en haut, coupé en bas */}
            <div className="relative h-[480px] sm:h-[540px] [clip-path:inset(-120px_-120px_0_-120px_round_0_0_28px_28px)]">
              <div
                className="absolute inset-x-0 bottom-0 top-[72px] rounded-[28px] bg-gradient-to-br from-moss-dark via-moss to-moss-light"
                aria-hidden
              >
                <div
                  className="absolute inset-0 rounded-[28px] opacity-20"
                  style={{
                    backgroundImage:
                      "repeating-linear-gradient(135deg, rgba(255,255,255,0.35) 0 1px, transparent 1px 22px)",
                  }}
                />
              </div>
              <div className="relative flex justify-center">
                <HeroPhoneMockup />
              </div>
            </div>

            {/* Bouton flottant sur le bas du téléphone */}
            <div className="relative -mt-12 sm:-mt-10 mx-auto max-w-[620px] bg-white rounded-2xl shadow-[0_16px_40px_rgba(10,10,10,0.14)] border border-paper-border p-2.5 flex flex-col sm:flex-row items-stretch sm:items-center gap-2.5">
              <p className="text-[15px] text-ink-muted px-3 py-1 m-0 flex-1 text-center sm:text-left sm:whitespace-nowrap">
                Gratuit pour démarrer, sans carte bancaire.
              </p>
              <TrackedLink
                ctaId="devenir_partenaire"
                ctaLocation="hero"
                audience="restaurateur"
                href="/become-a-partner"
                className="text-center bg-moss text-white text-[15px] font-bold px-6 py-3.5 rounded-xl hover:bg-moss-dark transition-colors"
              >
                Commencer gratuitement →
              </TrackedLink>
            </div>
          </div>
        </Reveal>
      </div>
    </section>
  );
}
