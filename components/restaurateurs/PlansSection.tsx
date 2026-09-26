"use client";

import { TrackedLink } from "@/components/analytics/TrackedLink";
import { Reveal } from "./motion";

// ADR 0070 — trois plans, prix HTVA par établissement :
// Gratuit (≤ 500 tickets/mois) · Croissance 299 € + 5 % des commandes en
// ligne · Pro 500 € sans commission, 3 mois minimum. Le site de commande et
// le référencement ne sont pas encore livrés : les plans payants se
// réservent en « place pilote » (e-mail), pas par un paiement en ligne.
// Rentabilité : ticket moyen 14,80 € × marge brute 65 % ≈ 9,62 € par ticket.

const FREE_FEATURES = [
  "Un programme de fidélité au nom et aux couleurs de l'établissement",
  "Jusqu'à 500 tickets par mois",
  "Des cadeaux calculés pour protéger la marge",
  "Parrainage et équipes, sans limite",
  "Des messages aux clients, envoyés par l'établissement",
  "QR codes et affiches prêts à imprimer",
];

const GROWTH_FEATURES = [
  "Tickets illimités",
  "Un site de commande à emporter, au nom de l'établissement",
  "D'où vient chaque commande, et ce que rapporte chaque pub",
  "Prévisions de ventes et ventes par plat",
  "Des idées de promos chiffrées, et des messages programmés",
  "Relance automatique des clients qui ne viennent plus",
];

const PRO_FEATURES = [
  "0 % de commission sur les commandes",
  "Le site sur un nom de domaine propre",
  "Référencement Google pris en charge",
  "La fiche Google tenue à jour, avec le bouton « Commander »",
  "Un rapport clair chaque mois, et un point avec nous",
  "Comparaison anonyme avec les restaurants du secteur",
  "Tous les établissements au même endroit",
];

const PILOT_MAILTO = (plan: string) =>
  `mailto:contact@boosteats.tech?subject=${encodeURIComponent(`Place pilote — plan ${plan}`)}`;

export function PlansSection() {
  return (
    <section id="plans" className="bg-paper-subtle py-20 sm:py-24 scroll-mt-16">
      <div className="max-w-[1200px] mx-auto px-5 sm:px-8">
        <Reveal>
          <p className="font-mono text-[11px] tracking-[0.12em] uppercase text-moss-dark mb-3.5">▶ Plans</p>
          <h2 className="font-display text-[34px] sm:text-[44px] lg:text-[54px] leading-[1.2] tracking-[-0.02em] font-bold text-ink max-w-[680px] text-pretty">
            Gratuit pour démarrer. Puis un prix simple, par établissement.
          </h2>
        </Reveal>

        <div className="grid lg:grid-cols-3 gap-6 mt-10 items-stretch">
          <Reveal delay={80}>
            <PlanCard
              name="Gratuit"
              price="0 €"
              priceNote="pour toujours"
              commission="Aucune commission"
              pitch="La fidélité complète, pour faire revenir les clients."
              intro={null}
              features={FREE_FEATURES}
              highlighted
              cta={
                <TrackedLink
                  ctaId="devenir_partenaire"
                  ctaLocation="plans_gratuit"
                  audience="restaurateur"
                  href="/become-a-partner"
                  className="mt-6 text-center bg-moss text-white text-sm font-bold rounded-lg px-5 py-3 hover:bg-moss-dark transition-colors"
                >
                  Commencer gratuitement
                </TrackedLink>
              }
            />
          </Reveal>

          <Reveal delay={160}>
            <PlanCard
              name="Croissance"
              price="299 €"
              priceNote="/mois"
              commission="+ 5 % sur les commandes passées sur le site. Rien sur les ventes au comptoir."
              pitch="Pour vendre en direct et savoir ce que rapporte chaque pub."
              intro="Tout le plan Gratuit, plus :"
              features={GROWTH_FEATURES}
              pilot
              roi={{
                title: "299 €, c'est environ 31 tickets de plus dans le mois.",
                sub: "À peu près un client de plus par jour.",
              }}
              cta={
                <TrackedLink
                  ctaId="place_pilote"
                  ctaLocation="plans_croissance"
                  audience="restaurateur"
                  href={PILOT_MAILTO("Croissance")}
                  className="mt-6 text-center border-[1.5px] border-moss text-moss-dark text-sm font-bold rounded-lg px-5 py-3 hover:bg-moss-tint transition-colors"
                >
                  Réserver une place pilote
                </TrackedLink>
              }
            />
          </Reveal>

          <Reveal delay={240}>
            <PlanCard
              name="Pro"
              price="500 €"
              priceNote="/mois"
              commission="0 % de commission. 3 mois minimum, puis au mois."
              pitch="Pour être trouvé sur Google et tout piloter au même endroit."
              intro="Tout le plan Croissance, plus :"
              features={PRO_FEATURES}
              pilot
              roi={{
                title: "500 €, c'est environ 52 tickets de plus dans le mois.",
                sub: "Moins de deux clients de plus par jour.",
              }}
              cta={
                <TrackedLink
                  ctaId="place_pilote"
                  ctaLocation="plans_pro"
                  audience="restaurateur"
                  href={PILOT_MAILTO("Pro")}
                  className="mt-6 text-center border-[1.5px] border-moss text-moss-dark text-sm font-bold rounded-lg px-5 py-3 hover:bg-moss-tint transition-colors"
                >
                  Réserver une place pilote
                </TrackedLink>
              }
            />
          </Reveal>
        </div>

        <Reveal delay={300}>
          <div className="bg-white border-[1.5px] border-moss-tint2 rounded-xl px-6 py-5 mt-8 max-w-[760px] mx-auto">
            <p className="font-display text-[15px] font-bold text-ink m-0 mb-1.5">Croissance ou Pro ?</p>
            <p className="text-[14.5px] leading-relaxed text-ink-body m-0">
              Au-delà d&apos;environ <strong>4 000 € de commandes en ligne par mois</strong>, le plan Pro revient
              moins cher que Croissance, et le référencement Google est inclus. Le tableau de bord le signale : aucun
              calcul à faire.
            </p>
          </div>
        </Reveal>

        <Reveal delay={340}>
          <p className="text-[13px] text-ink-faint text-center max-w-[640px] mx-auto mt-8">
            Prix hors TVA, par établissement. Les ventes au comptoir ne sont jamais soumises à commission. Les
            premiers restaurants du réseau bénéficient du tarif fondateur, conservé à vie. Aucune fonctionnalité
            gratuite d&apos;aujourd&apos;hui ne passera jamais derrière un paywall.
          </p>
        </Reveal>
      </div>
    </section>
  );
}

function PlanCard({
  name,
  price,
  priceNote,
  commission,
  pitch,
  intro,
  features,
  cta,
  highlighted = false,
  pilot = false,
  roi,
}: {
  name: string;
  price: string;
  priceNote: string;
  commission: string;
  pitch: string;
  intro: string | null;
  features: string[];
  cta: React.ReactNode;
  highlighted?: boolean;
  pilot?: boolean;
  roi?: { title: string; sub: string };
}) {
  return (
    <div
      className={`bg-white rounded-xl p-8 h-full flex flex-col ${
        highlighted ? "border-[1.5px] border-moss" : "border border-paper-border"
      }`}
    >
      <div className="flex items-center justify-between gap-3">
        <h3 className="font-display text-[22px] font-bold m-0">{name}</h3>
        {pilot && (
          <span className="font-mono text-[10px] tracking-[0.1em] uppercase text-moss-dark bg-moss-tint rounded-full px-2.5 py-1">
            Places pilotes
          </span>
        )}
      </div>
      <p className="font-display text-3xl font-bold text-ink mt-2 mb-0">
        {price}
        <span className="text-sm font-normal text-ink-muted"> {priceNote}</span>
      </p>
      <p className="text-[13px] font-semibold text-moss-dark mt-1.5 mb-0">{commission}</p>
      <p className="text-sm text-ink-muted mt-3 mb-5">{pitch}</p>
      {intro && <p className="text-[13px] font-semibold text-ink mb-3 mt-0">{intro}</p>}
      <div className="flex flex-col gap-3 flex-1">
        {features.map((f) => (
          <p key={f} className="text-[14.5px] text-ink-body m-0">
            <span className="font-mono text-moss">✓</span>&nbsp; {f}
          </p>
        ))}
      </div>
      {roi && (
        <div className="bg-moss-tint rounded-lg px-4 py-3.5 mt-6">
          <p className="text-[13.5px] font-semibold text-moss-dark m-0">{roi.title}</p>
          <p className="text-[13px] text-ink-body mt-1 mb-0">{roi.sub}</p>
          <p className="text-[11px] text-ink-faint mt-1.5 mb-0">
            Sur la base d&apos;un ticket moyen de 14,80 € et d&apos;une marge brute de 65 %.
          </p>
        </div>
      )}
      {cta}
    </div>
  );
}
