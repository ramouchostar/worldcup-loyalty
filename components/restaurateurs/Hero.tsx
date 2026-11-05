"use client";

import { TrackedLink } from "@/components/analytics/TrackedLink";
import { Reveal, RotatingWords, useParallaxOffset } from "./motion";
import { HeroPhoneMockup } from "./HeroPhoneMockup";
import { Portrait } from "./Portrait";
import { BRIGADE } from "./brigade";
import { RestaurantSearchBar } from "@/components/audit-gratuit/RestaurantSearchBar";

// Héros resserré (2026-09-26, sur le modèle d'owner.com) : le titre, une
// phrase, puis un iPhone posé sur un panneau vert. Le bouton principal reste
// la recherche de l'établissement (analyse gratuite, ADR 0071).
//
// Titre (2026-09-26, demande du porteur) : la fin d'un problème que le
// restaurateur vit déjà. Chaque mot tournant est une douleur concrète.
//
// Brigade 17 (maquette validée le 2026-11-04, ADR 0089) : la promesse devient
// la brigade — sept assistants, un seul objectif (le chiffre d'affaires), cinq
// minutes par jour pour valider leurs idées. Le téléphone montre « Idées du jour ».
const PROBLEMS = [
  "le jeudi soir creux.",
  "la salle vide.",
  "le chiffre d'affaires qui baisse.",
  "les clients qui ne reviennent pas.",
];

const FIRST_FOUR = BRIGADE.slice(0, 4);

export function Hero() {
  const blobRef = useParallaxOffset(0.12);

  return (
    <section className="relative bg-paper overflow-hidden">
      <div
        ref={blobRef}
        className="absolute -top-[220px] -right-40 w-[760px] h-[760px] pointer-events-none"
        style={{ background: "radial-gradient(circle, rgba(162,197,35,0.18), transparent 60%)" }}
      />

      <div className="relative max-w-[1200px] mx-auto px-5 sm:px-8 pt-14 sm:pt-20 pb-16 sm:pb-20">
        <div className="max-w-[800px] mx-auto text-center">
          <Reveal>
            <p className="font-mono text-xs tracking-[0.12em] uppercase text-moss-dark mb-5">
              ▶ Nouveau · votre brigade marketing
            </p>
          </Reveal>
          <Reveal delay={80}>
            <h1 className="font-display text-[38px] sm:text-[48px] lg:text-[58px] leading-[1.05] tracking-[-0.04em] font-bold text-ink text-pretty">
              Fini
              <br />
              <RotatingWords words={PROBLEMS} className="text-moss-dark" />
            </h1>
            <p className="font-landing text-[17px] sm:text-[19px] leading-[1.6] text-ink-muted mt-5 mb-0 max-w-[660px] mx-auto text-pretty">
              Sept assistants marketing travaillent pour une seule chose :{" "}
              <strong className="font-semibold text-ink">faire monter votre chiffre d&apos;affaires</strong>. Ils font
              venir de nouveaux clients et font revenir les anciens. Vous validez leurs idées en 5 minutes par jour.
            </p>
          </Reveal>
          {/* ADR 0071 — premier geste de la page : chercher son établissement, puis l'audit gratuit.
              Le z-index se pose sur le Reveal : son transform en fait un contexte d'empilement,
              sans quoi les suggestions passent sous le téléphone (Reveal suivant). */}
          <Reveal delay={150} className="relative z-30">
            <div className="relative z-20 mt-7 mx-auto max-w-[640px] bg-white rounded-2xl shadow-[0_16px_40px_rgba(10,10,10,0.12)] border border-paper-border p-2">
              <RestaurantSearchBar location="hero" />
            </div>
            <p className="text-[13px] text-ink-faint mt-3 mb-0">Analysez votre restaurant gratuitement · note sur 100 en moins d&apos;une minute</p>
            <div className="mt-6 flex items-center justify-center gap-3">
              <div className="flex -space-x-2.5 shrink-0" aria-hidden>
                {FIRST_FOUR.map((a) => (
                  <Portrait key={a.id} id={a.id} size={34} className="border-2 border-paper" />
                ))}
              </div>
              <p className="text-[13.5px] text-ink-muted m-0 text-left">
                {FIRST_FOUR.map((a) => a.name).join(", ")} et 3 autres, prêts à travailler pour vous
              </p>
            </div>
          </Reveal>
        </div>

        <Reveal delay={200} y={28}>
          <div className="relative mt-10 sm:mt-12 max-w-[1000px] mx-auto">
            {/* Panneau vert : le téléphone déborde en haut, coupé en bas */}
            <div className="relative h-[480px] sm:h-[540px] [clip-path:inset(-120px_-120px_0_-120px_round_0_0_28px_28px)]">
              <div
                className="absolute inset-x-0 bottom-0 top-[72px] rounded-[28px] bg-gradient-to-br from-moss-dark via-moss to-moss-light"
                aria-hidden
              >
                <div
                  className="absolute inset-0 rounded-[28px] opacity-20"
                  style={{
                    backgroundImage:
                      "repeating-linear-gradient(135deg, rgba(255,255,255,0.35) 0 1px, transparent 1px 22px)",
                  }}
                />
              </div>
              <div className="relative flex justify-center">
                <HeroPhoneMockup />
              </div>
              <div className="hidden sm:block absolute right-10 bottom-20 bg-white rounded-xl shadow-[0_12px_30px_rgba(10,10,10,0.18)] px-4 py-3 text-left">
                <p className="text-[14px] font-bold text-ink m-0">5 min par jour, pas plus</p>
                <p className="text-[12px] text-ink-faint m-0">Rien ne part sans votre « Oui »</p>
              </div>
            </div>

            {/* Le plan gratuit, en second : sous le téléphone. */}
            <div className="relative -mt-8 mx-auto w-fit bg-white rounded-2xl shadow-[0_16px_40px_rgba(10,10,10,0.14)] border border-paper-border px-5 py-3 text-center">
              <TrackedLink
                ctaId="devenir_partenaire"
                ctaLocation="hero"
                audience="restaurateur"
                href="/become-a-partner"
                className="text-[15px] font-semibold text-ink hover:text-moss-dark transition-colors"
              >
                Pas besoin d&apos;audit ? Commencer gratuitement →
              </TrackedLink>
            </div>
            <p className="text-[12px] text-ink-faint text-center mt-3 mb-0">Écran d&apos;exemple, établissement imaginaire.</p>
          </div>
        </Reveal>
      </div>
    </section>
  );
}
