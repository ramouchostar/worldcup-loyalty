"use client";

import { ScrollProgressBar } from "./motion";
import { Header } from "./Header";
import { Hero } from "./Hero";
import { OfferOverview } from "./OfferOverview";
import { FidelitySection } from "./FidelitySection";
import { OrderingSection } from "./OrderingSection";
import { GoogleSection } from "./GoogleSection";
import { ProductSection } from "./ProductSection";
import { ParrainageSection } from "./ParrainageSection";
import { ConsoleImpactSection } from "./ConsoleImpactSection";
import { MidPageCta } from "./MidPageCta";
import { FaqSection } from "./FaqSection";
import { StepsSection } from "./StepsSection";
import { PlansSection } from "./PlansSection";
import { FinalCtaSection } from "./FinalCtaSection";
import { Footer } from "./Footer";

// Landing publique restaurateurs (redesign m55, design Claude "Landing
// Restaurateurs" ; copie refondue 2026-08-29 — une feature à la fois,
// offre clarifiée 2026-09-26, ADR 0070 : l'offre en trois gestes, commande
// en ligne et référencement Google, plans Croissance 299 € + 5 % / Pro 500 €,
// mockup console restaurateur en principal, mockup client réservé au bloc
// fidélité). Composant client : toute la mise en scène (révélations au
// scroll, mockups à l'échelle, compteurs animés) est interactive ; le
// contenu est statique (pas de fetch — la preuve sociale du Hero est un cas
// nommé, plus un compteur réseau).
export function RestaurateursLanding() {
  return (
    <div className="bg-paper font-landing">
      <ScrollProgressBar />
      <Header />
      <Hero />
      <OfferOverview />
      <FidelitySection />
      <OrderingSection />
      <GoogleSection />
      <ProductSection />
      <ParrainageSection />
      <ConsoleImpactSection />
      <MidPageCta />
      <FaqSection />
      <StepsSection />
      <PlansSection />
      <FinalCtaSection />
      <Footer />
    </div>
  );
}
