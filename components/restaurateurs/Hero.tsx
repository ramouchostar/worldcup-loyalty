"use client";

import { TrackedLink } from "@/components/analytics/TrackedLink";
import { Reveal, useParallaxOffset } from "./motion";
import { BrowserWindow } from "./BrowserWindow";
import { DashboardMockup } from "./DashboardMockup";
import { MemberAppMockup } from "./MemberAppMockup";

export function Hero({
  hasNetwork,
  restaurantCount,
  memberCount,
}: {
  hasNetwork: boolean;
  restaurantCount: number;
  memberCount: number;
}) {
  const blobRef = useParallaxOffset(0.12);

  return (
    <section className="relative bg-ink overflow-hidden">
      <div
        ref={blobRef}
        className="absolute -top-[220px] -right-40 w-[760px] h-[760px] pointer-events-none"
        style={{ background: "radial-gradient(circle, rgba(122,143,63,0.18), transparent 60%)" }}
      />

      <div className="relative max-w-[1200px] mx-auto px-5 sm:px-8 pt-16 sm:pt-20 pb-0">
        <div className="max-w-[800px]">
          <Reveal>
            <p className="font-mono text-xs tracking-[0.12em] uppercase text-moss-light mb-5">
              ▶ Pour les restaurateurs
            </p>
          </Reveal>
          <Reveal delay={80}>
            <h1 className="font-display text-[38px] sm:text-[48px] lg:text-[58px] leading-[1.05] tracking-[-0.04em] font-bold text-white text-pretty">
              Fidélise tes clients sans jamais toucher ta marge.
            </h1>
          </Reveal>
          <Reveal delay={160}>
            <p className="font-landing text-base sm:text-lg leading-[1.7] text-night-text mt-6 max-w-[640px]">
              Reprends la main sur les clients que les plateformes de livraison te prennent. Chaque cadeau est
              calculé sur ton propre prix de revient et plafonné par le CA qu&apos;il a généré. Côté client,
              l&apos;app porte ton nom, tes couleurs et ton logo.
            </p>
          </Reveal>
          <Reveal delay={240}>
            <div className="flex items-center gap-4 mt-8 flex-wrap">
              <TrackedLink
                ctaId="devenir_partenaire"
                ctaLocation="hero"
                audience="restaurateur"
                href="/become-a-partner"
                className="bg-moss text-white text-[15px] font-bold px-[26px] py-[15px] rounded-lg hover:bg-moss-dark transition-colors"
              >
                Devenir partenaire gratuitement →
              </TrackedLink>
              <TrackedLink
                ctaId="voir_le_produit"
                ctaLocation="hero"
                audience="restaurateur"
                href="#produit"
                className="text-white text-[15px] font-semibold py-[15px] hover:text-moss-light transition-colors"
              >
                Voir le produit
              </TrackedLink>
            </div>
          </Reveal>
          <Reveal delay={300}>
            <p className="font-mono text-[11px] tracking-[0.1em] uppercase text-night-faint mt-6">
              Gratuit à vie · 0% de commission · aucune carte bancaire
            </p>
            <p className="text-night-faint text-sm mt-2">
              {hasNetwork ? (
                <>
                  Déjà <span className="text-white font-bold">{restaurantCount}</span> établissement
                  {restaurantCount > 1 ? "s" : ""} et{" "}
                  <span className="text-white font-bold">{memberCount}</span> membre
                  {memberCount > 1 ? "s" : ""} actifs sur le réseau.
                </>
              ) : (
                "Le réseau démarre — sois l'un des premiers restaurants à en profiter."
              )}
            </p>
          </Reveal>
        </div>

        <Reveal delay={360} y={28}>
          <div className="flex flex-col-reverse lg:flex-row-reverse items-center lg:items-end gap-8 lg:gap-0 mt-12 lg:mt-14 pb-16 lg:pb-20">
            <div className="w-full max-w-[900px] lg:flex-1 lg:min-w-0">
              <BrowserWindow url="boosteats.app/admin/belchicken" scaleWidth={1400} chromeHeight={34}>
                <DashboardMockup />
              </BrowserWindow>
            </div>

            <div className="w-[240px] sm:w-[250px] shrink-0 lg:relative lg:z-[2] lg:-mr-2 rounded-[32px] bg-night-raised border border-night-line p-[9px] shadow-[0_24px_64px_rgba(0,0,0,0.55)]">
              <MemberAppMockup />
            </div>
          </div>
        </Reveal>
      </div>
    </section>
  );
}
