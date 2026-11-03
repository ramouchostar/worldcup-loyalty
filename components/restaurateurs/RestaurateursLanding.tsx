"use client";

import { ScrollProgressBar } from "./motion";
import { Header } from "./Header";
import { Hero } from "./Hero";
import { LoopSection } from "./LoopSection";
import { FeatureTour } from "./FeatureTour";
import { CaseStudyBand } from "@/components/marketing/CaseStudyBand";
import { StepsSection } from "./StepsSection";
import { PlansSection } from "./PlansSection";
import { FaqSection } from "./FaqSection";
import { FinalCtaSection } from "./FinalCtaSection";
import { Footer } from "./Footer";

// Landing publique restaurateurs. Refonte 2026-09-26 (inspirée d'owner.com),
// repositionnée le 2026-09-29 (ADR 0074 : outil marketing, pas d'exploitation) :
// peu de texte, l'illustration explique. Héros (titre, une phrase, console
// dans un iPhone) → la méthode en roue (acquisition, rétention, optimisation,
// 2026-11-03) → visite guidée (un iPhone fixe dont l'écran change à chaque
// fonctionnalité) → le copilote en six signaux → démarrer → plans → questions
// → appel final.
// Contenu statique (pas de fetch) ; mockups = établissement fictif Belchicken.
export function RestaurateursLanding() {
  return (
    <div className="bg-paper font-landing">
      <ScrollProgressBar />
      <Header />
      <Hero />
      <LoopSection />
      <FeatureTour />
      <CaseStudyBand />
      <StepsSection />
      <PlansSection />
      <FaqSection />
      <FinalCtaSection />
      <Footer />
    </div>
  );
}
