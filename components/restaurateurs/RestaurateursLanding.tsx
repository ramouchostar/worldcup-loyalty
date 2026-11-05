"use client";

import "./landing.css";
import { ScrollProgressBar } from "./motion";
import { Header } from "./Header";
import { Hero } from "./Hero";
import { BrigadeSection } from "./BrigadeSection";
import { ComparisonSection } from "./ComparisonSection";
import { FiveMinutesSection } from "./FiveMinutesSection";
import { SiteSection } from "./SiteSection";
import { AnalysisSection } from "./AnalysisSection";
import { ProofSection } from "./ProofSection";
import { PlansSection } from "./PlansSection";
import { FaqSection } from "./FaqSection";
import { FinalCtaSection } from "./FinalCtaSection";
import { Footer } from "./Footer";

// Landing publique restaurateurs. Refonte 2026-09-26 (inspirée d'owner.com),
// repositionnée le 2026-09-29 (ADR 0074 : outil marketing, pas d'exploitation).
// Brigade 17 (maquette validée par Mehdi le 2026-11-04, ADR 0089) : la page
// présente la brigade. Héros (« Idées du jour » dans un iPhone) → les sept
// assistants → ce que vous payeriez ailleurs (comparatif, 2026-11-05) → cinq minutes par jour (une carte d'idée) → le site de Nina (en
// pilote) → l'analyse gratuite → le cas Kraainem → tarifs par forfait →
// questions → appel final. La méthode en trois étapes, la visite guidée et
// « Prêt en quatre étapes » sont retirées : la maquette les remplace.
// Style (2026-11-05, Mehdi) : celui de la maquette validée, photos libres de
// droits (Unsplash) et verre dépoli — `landing.css`, classes « bx- ».
// Contenu statique (pas de fetch) ; mockups = établissements IMAGINAIRES.
export function RestaurateursLanding() {
  return (
    <div className="bx bg-paper font-landing">
      <ScrollProgressBar />
      <Header />
      <Hero />
      <BrigadeSection />
      <ComparisonSection />
      <FiveMinutesSection />
      <SiteSection />
      <AnalysisSection />
      <ProofSection />
      <PlansSection />
      <FaqSection />
      <FinalCtaSection />
      <Footer />
    </div>
  );
}
