"use client";

import { Space_Grotesk, Archivo } from "next/font/google";
import { ScrollProgressBar } from "./motion";
import { Header } from "./Header";
import { Hero } from "./Hero";
import { ProductSection } from "./ProductSection";
import { PlansSection } from "./PlansSection";
import { StepsSection } from "./StepsSection";
import { Footer } from "./Footer";

// Polices de la vitrine — déplacées du layout racine (audit UX 2026-08-11,
// perf vieux appareils : les membres ne doivent pas télécharger les polices
// de la landing B2B). Identité éditoriale m55, distincte de --brand-font
// (par établissement) : Archivo = corps (font-landing), Space Grotesk =
// titres (font-display). JetBrains Mono (font-mono) reste chargée par le
// layout racine car utilisée aussi côté membre.
const spaceGrotesk = Space_Grotesk({ subsets: ["latin"], weight: ["500", "600", "700"], variable: "--font-space-grotesk", display: "swap" });
const archivo = Archivo({ subsets: ["latin"], weight: ["400", "500", "600", "700"], style: ["normal", "italic"], variable: "--font-archivo", display: "swap" });

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
    <div className={`bg-paper font-landing ${spaceGrotesk.variable} ${archivo.variable}`}>
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
