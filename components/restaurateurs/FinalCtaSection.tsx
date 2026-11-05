"use client";

import { TrackedLink } from "@/components/analytics/TrackedLink";
import { Reveal } from "./motion";
import { RestaurantSearchBar } from "@/components/audit-gratuit/RestaurantSearchBar";
import { WHATSAPP_NUMBER_DISPLAY, whatsappUrl } from "@/lib/contact";

// Appel final (maquette du 2026-11-04) : l'analyse gratuite en principal
// (ADR 0071), puis le Gratuit et WhatsApp (décision du 2026-11-01).
export function FinalCtaSection() {
  return (
    <section className="max-w-[1200px] mx-auto px-5 sm:px-8 py-20 sm:py-24 text-center">
      <Reveal>
        <h2 className="font-display text-[34px] sm:text-[44px] lg:text-[54px] leading-[1.2] tracking-[-0.02em] font-bold text-ink text-pretty">
          Prêt à faire monter votre chiffre d&apos;affaires ?
        </h2>
        <p className="font-landing text-base leading-[1.7] text-ink-muted mt-4 max-w-[520px] mx-auto">
          On commence par regarder votre restaurant. Gratuit, en moins d&apos;une minute.
        </p>
        <div className="mt-7 mx-auto max-w-[640px] bg-white rounded-2xl shadow-[0_16px_40px_rgba(10,10,10,0.1)] border border-paper-border p-2 text-left">
          <RestaurantSearchBar location="cta_final" />
        </div>
        <div className="mt-4">
          <TrackedLink
            ctaId="devenir_partenaire"
            ctaLocation="cta_final"
            audience="restaurateur"
            href="/become-a-partner"
            className="text-[15px] font-semibold text-moss-dark hover:underline"
          >
            Ou commencer gratuitement →
          </TrackedLink>
        </div>
        <p className="text-sm text-ink-faint mt-5">
          Une question avant de démarrer ? WhatsApp{" "}
          <TrackedLink
            ctaId="whatsapp"
            ctaLocation="cta_final"
            audience="restaurateur"
            href={whatsappUrl()}
            className="text-good font-semibold hover:underline"
          >
            {WHATSAPP_NUMBER_DISPLAY}
          </TrackedLink>{" "}
          ou{" "}
          <a href="mailto:contact@boosteats.be" className="text-moss-dark hover:underline">
            contact@boosteats.be
          </a>
          .
        </p>
      </Reveal>
    </section>
  );
}
