"use client";

import { TrackedLink } from "@/components/analytics/TrackedLink";
import { Reveal } from "./motion";
import { FloatingFoodIcon } from "./FloatingFoodIcon";

export function FinalCtaSection() {
  return (
    <section className="relative overflow-hidden max-w-[1200px] mx-auto px-5 sm:px-8 py-20 sm:py-24 text-center">
      <FloatingFoodIcon icon="pizza" className="hidden lg:block top-10 right-10 rotate-6" />
      <Reveal>
        <h2 className="font-display text-[34px] sm:text-[44px] lg:text-[54px] leading-[1.2] tracking-[-0.02em] font-bold text-ink text-pretty">
          Ton programme tourne ce soir.
        </h2>
        <p className="font-landing text-base leading-[1.7] text-ink-muted mt-4 max-w-[520px] mx-auto">
          Compte créé instantanément, QR code prêt après validation de ton établissement. Sans carte bancaire, sans
          engagement, sans commission.
        </p>
        <TrackedLink
          ctaId="devenir_partenaire"
          ctaLocation="cta_final"
          audience="restaurateur"
          href="/become-a-partner"
          className="inline-block bg-moss text-white text-[15px] font-bold px-[26px] py-[15px] rounded-lg mt-7 hover:bg-moss-dark transition-colors"
        >
          Commencer le plan gratuit →
        </TrackedLink>
        <p className="text-sm text-ink-faint mt-5">
          Une question avant de te lancer ? Écris-nous à{" "}
          <a href="mailto:contact@boosteats.tech" className="text-moss-dark hover:underline">
            contact@boosteats.tech
          </a>
          .
        </p>
      </Reveal>
    </section>
  );
}
