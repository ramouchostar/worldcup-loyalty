"use client";

import { ScrollProgressBar } from "./motion";
import { Header } from "./Header";
import { Hero } from "./Hero";
import { ProductSection } from "./ProductSection";
import { PlansSection } from "./PlansSection";
import { StepsSection } from "./StepsSection";
import { Footer } from "./Footer";

// Landing publique restaurateurs (redesign m55, design Claude "Landing
// Restaurateurs"). Composant client : toute la mise en scène (révélations au
// scroll, mockups à l'échelle, compteurs animés) est interactive, mais les
// données réelles (compteurs réseau) sont calculées côté serveur et passées
// en props par app/(public)/restaurateurs/page.tsx — pas de fetch client.
export function RestaurateursLanding({
  hasNetwork,
  restaurantCount,
  memberCount,
}: {
  hasNetwork: boolean;
  restaurantCount: number;
  memberCount: number;
}) {
  return (
    <div className="bg-paper font-landing">
      <ScrollProgressBar />
      <Header />
      <Hero hasNetwork={hasNetwork} restaurantCount={restaurantCount} memberCount={memberCount} />
      <ProductSection />
      <PlansSection />
      <StepsSection />
      <Footer />
    </div>
  );
}
