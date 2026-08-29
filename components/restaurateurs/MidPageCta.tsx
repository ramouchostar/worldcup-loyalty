"use client";

import { TrackedLink } from "@/components/analytics/TrackedLink";
import { Reveal } from "./motion";

export function MidPageCta() {
  return (
    <section className="max-w-[1200px] mx-auto px-5 sm:px-8 py-16 text-center">
      <Reveal>
        <TrackedLink
          ctaId="devenir_partenaire"
          ctaLocation="milieu_page"
          audience="restaurateur"
          href="/become-a-partner"
          className="inline-block bg-moss text-white text-[15px] font-bold px-[26px] py-[15px] rounded-lg hover:bg-moss-dark transition-colors"
        >
          Commencer le plan gratuit →
        </TrackedLink>
        <p className="font-mono text-[11px] tracking-[0.1em] uppercase text-ink-faint mt-4">
          Compte créé instantanément · sans carte bancaire · sans engagement
        </p>
      </Reveal>
    </section>
  );
}
