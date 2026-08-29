"use client";

import { TrackedLink } from "@/components/analytics/TrackedLink";
import { Reveal } from "./motion";

const FREE_FEATURES = [
  "Récompenses à marge protégée, calculées sur ta carte",
  "Parrainage et équipes, sans limite",
  "Lecture automatique des tickets",
  "Tableau de bord complet : CA généré, marge, gain net",
  "Supports imprimables à ta charte",
  "Visibilité sur la page réseau de ton secteur",
];

const GROWTH_FEATURES = [
  "Prévisions de CA et ventes par plat",
  "Opportunités calculées et promos programmées",
  "Segmentation par équipes et campagnes ciblées",
  "Réactivation automatique des clients dormants",
];

const PRO_FEATURES = [
  "Vue consolidée sur l'ensemble de tes points de vente",
  "Repères anonymisés de ton secteur et de ta zone",
  "Accompagnement dédié",
];

export function PlansSection() {
  return (
    <section id="plans" className="bg-paper-subtle py-20 sm:py-24 scroll-mt-16">
      <div className="max-w-[1200px] mx-auto px-5 sm:px-8">
        <Reveal>
          <p className="font-mono text-[11px] tracking-[0.12em] uppercase text-moss-dark mb-3.5">▶ Plans</p>
          <h2 className="font-display text-[28px] sm:text-[33px] lg:text-[39px] leading-[1.2] tracking-[-0.02em] font-bold text-ink max-w-[640px] text-pretty">
            Gratuit pour démarrer. Puis un prix simple, par établissement.
          </h2>
        </Reveal>

        <div className="grid lg:grid-cols-3 gap-6 mt-10 items-start">
          <Reveal delay={80}>
            <div className="bg-white border-[1.5px] border-moss rounded-xl p-8 h-full flex flex-col">
              <h3 className="font-display text-[22px] font-bold">Gratuit — pour toujours</h3>
              <p className="text-sm text-ink-muted mb-5">Le moteur complet du programme, sans limite de durée.</p>
              <div className="flex flex-col gap-3 flex-1">
                {FREE_FEATURES.map((f) => (
                  <p key={f} className="text-[14.5px] text-ink-body m-0">
                    <span className="font-mono text-moss">✓</span>&nbsp; {f}
                  </p>
                ))}
              </div>
              <TrackedLink
                ctaId="devenir_partenaire"
                ctaLocation="plans_gratuit"
                audience="restaurateur"
                href="/become-a-partner"
                className="mt-6 text-center bg-moss text-white text-sm font-bold rounded-lg px-5 py-3 hover:bg-moss-dark transition-colors"
              >
                Commencer gratuitement
              </TrackedLink>
            </div>
          </Reveal>

          <Reveal delay={160}>
            <div className="bg-white border border-paper-border rounded-xl p-8 h-full flex flex-col">
              <h3 className="font-display text-[22px] font-bold">Croissance</h3>
              <p className="font-display text-2xl font-bold text-ink mt-1 mb-0">
                199 €<span className="text-sm font-normal text-ink-muted">/mois par établissement</span>
              </p>
              <p className="text-sm text-ink-muted mt-2 mb-5">
                Tout le plan gratuit, plus l&apos;analytique qui pilote tes ventes.
              </p>
              <div className="flex flex-col gap-3">
                {GROWTH_FEATURES.map((f) => (
                  <p key={f} className="text-[14.5px] text-ink-body m-0">
                    <span className="font-mono text-moss">✓</span>&nbsp; {f}
                  </p>
                ))}
              </div>
              <div className="bg-moss-tint rounded-lg px-4 py-3.5 mt-6">
                <p className="text-[13.5px] font-semibold text-moss-dark m-0">
                  199 €, c&apos;est environ 20 tickets de plus dans le mois.
                </p>
                <p className="text-[13px] text-ink-body mt-1 mb-0">Moins d&apos;un client supplémentaire par jour.</p>
                <p className="text-[11px] text-ink-faint mt-1.5 mb-0">
                  Sur la base d&apos;un ticket moyen de 14,80 € et d&apos;une marge brute de 65 %.
                </p>
              </div>
            </div>
          </Reveal>

          <Reveal delay={240}>
            <div className="bg-white border border-paper-border rounded-xl p-8 h-full flex flex-col">
              <h3 className="font-display text-[22px] font-bold">Pro</h3>
              <p className="font-display text-2xl font-bold text-ink mt-1 mb-0">
                500 €<span className="text-sm font-normal text-ink-muted">/mois par établissement</span>
              </p>
              <p className="text-sm text-ink-muted mt-2 mb-5">
                Pour les enseignes multi-sites qui veulent tout piloter au même endroit.
              </p>
              <div className="flex flex-col gap-3">
                {PRO_FEATURES.map((f) => (
                  <p key={f} className="text-[14.5px] text-ink-body m-0">
                    <span className="font-mono text-moss">✓</span>&nbsp; {f}
                  </p>
                ))}
              </div>
              <div className="bg-moss-tint rounded-lg px-4 py-3.5 mt-6">
                <p className="text-[13.5px] font-semibold text-moss-dark m-0">
                  500 €, c&apos;est environ 52 tickets de plus dans le mois.
                </p>
                <p className="text-[13px] text-ink-body mt-1 mb-0">
                  Moins de deux clients supplémentaires par jour.
                </p>
              </div>
            </div>
          </Reveal>
        </div>

        <Reveal delay={320}>
          <p className="text-[13px] text-ink-faint text-center max-w-[560px] mx-auto mt-8">
            Les premiers restaurants du réseau bénéficient du tarif fondateur, conservé à vie. Aucune fonctionnalité
            gratuite d&apos;aujourd&apos;hui ne passera jamais derrière un paywall.
          </p>
        </Reveal>
      </div>
    </section>
  );
}
