"use client";

import { TrackedLink } from "@/components/analytics/TrackedLink";
import { Reveal } from "./motion";
import { RestaurantSearchBar } from "@/components/audit-gratuit/RestaurantSearchBar";

export function FinalCtaSection() {
  return (
    <section className="max-w-[1200px] mx-auto px-5 sm:px-8 py-20 sm:py-24 text-center">
      <Reveal>
        <h2 className="font-display text-[34px] sm:text-[44px] lg:text-[54px] leading-[1.2] tracking-[-0.02em] font-bold text-ink text-pretty">
          Découvrez la première impression que vous laissez à vos clients.
        </h2>
        <p className="font-landing text-base leading-[1.7] text-ink-muted mt-4 max-w-[520px] mx-auto">
          Une note sur 100 en moins d&apos;une minute, puis le rapport complet sur WhatsApp. Gratuit, sans engagement.
        </p>
        {/* ADR 0071 — l'audit gratuit en principal, le plan gratuit en second. */}
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
          Une question avant de démarrer ? L&apos;équipe répond à{" "}
          <a href="mailto:contact@boosteats.tech" className="text-moss-dark hover:underline">
            contact@boosteats.tech
          </a>
          .
        </p>
      </Reveal>
    </section>
  );
}
