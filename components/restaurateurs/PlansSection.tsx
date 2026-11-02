"use client";

import { TrackedLink } from "@/components/analytics/TrackedLink";
import { Reveal } from "./motion";
import { whatsappUrl } from "@/lib/contact";

// Plans, prix HTVA par établissement (remise à plat du 2026-11-02,
// .claude/product-marketing.md) : Forfait gratuit (≤ 500 tickets/mois, le
// client n'est jamais bloqué) · Croissance 150 €/mois sans engagement · Pro
// 500 €/mois, 3 mois minimum. Seulement des fonctions LIVRÉES (ADR 0070) ; plus
// de calcul « X € = N tickets » (décision du 2026-11-01). Les forfaits payants
// se prennent en parlant avec nous (WhatsApp), pas par un paiement en ligne.

const FREE_FEATURES = [
  "Un programme de fidélité au nom et aux couleurs de l'établissement",
  "Rien à brancher : le ticket de caisse suffit",
  "Des cadeaux calculés sur ce qu'ils vous coûtent, au taux que vous choisissez",
  "La liste de vos clients inscrits",
  "Des messages à vos clients, et deux qui partent tout seuls (anniversaire, habitué qui décroche)",
  "Parrainage par WhatsApp, QR et affiches prêts à imprimer",
  "Votre chiffre du jour et le coût de chaque plat",
  "Jusqu'à 500 tickets par mois",
];

const GROWTH_FEATURES = [
  "Tickets illimités",
  "Votre chiffre comparé jour par jour, et la part qui vient de vos clients inscrits",
  "Les prévisions des jours à venir et les ventes par plat",
  "Des messages programmés à l'avance",
  "On répond à vos avis Google pour vous",
  "Pub de quartier à 15 % de frais (au lieu de 20 %)",
];

const PRO_FEATURES = [
  "Votre fiche Google tenue à jour, sur invitation",
  "Un rapport chaque mois, et un point avec nous",
  "Comparaison anonyme avec les restaurants du secteur",
  "Tous vos établissements au même endroit",
  "Pub de quartier à 5 % de frais",
];


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
              name="Forfait gratuit"
              price="0 €"
              priceNote="pour toujours"
              commission="Aucune carte bancaire"
              pitch="Inscrire les clients et les faire revenir."
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
              price="150 €"
              priceNote="/mois"
              commission="Sans engagement."
              pitch="Pour suivre vos chiffres et ne plus laisser un avis sans réponse."
              intro="Tout le forfait gratuit, plus :"
              features={GROWTH_FEATURES}
              cta={
                <TrackedLink
                  ctaId="whatsapp"
                  ctaLocation="plans_croissance"
                  audience="restaurateur"
                  href={whatsappUrl("Bonjour, je voudrais en savoir plus sur le forfait Croissance pour mon restaurant.")}
                  className="mt-6 text-center border-[1.5px] border-moss text-moss-dark text-sm font-bold rounded-lg px-5 py-3 hover:bg-moss-tint transition-colors"
                >
                  En parler sur WhatsApp
                </TrackedLink>
              }
            />
          </Reveal>

          <Reveal delay={240}>
            <PlanCard
              name="Pro"
              price="500 €"
              priceNote="/mois"
              commission="3 mois minimum, puis au mois."
              pitch="Pour que le marketing soit pensé et fait à la place de l'établissement."
              intro="Tout le plan Croissance, plus :"
              features={PRO_FEATURES}
              cta={
                <TrackedLink
                  ctaId="whatsapp"
                  ctaLocation="plans_pro"
                  audience="restaurateur"
                  href={whatsappUrl("Bonjour, je voudrais en savoir plus sur le forfait Pro pour mon restaurant.")}
                  className="mt-6 text-center border-[1.5px] border-moss text-moss-dark text-sm font-bold rounded-lg px-5 py-3 hover:bg-moss-tint transition-colors"
                >
                  En parler sur WhatsApp
                </TrackedLink>
              }
            />
          </Reveal>
        </div>

        <Reveal delay={300}>
          <div className="bg-white border-[1.5px] border-moss-tint2 rounded-xl px-6 py-5 mt-8 max-w-[760px] mx-auto">
            <p className="font-display text-[15px] font-bold text-ink m-0 mb-1.5">Et le site de commande ?</p>
            <p className="text-[14.5px] leading-relaxed text-ink-body m-0">
              Il reste celui de l&apos;établissement, relié à sa caisse : Boosteats ne prend aucune commande et aucune
              commission. On vérifie que le bouton « Commander » de votre fiche Google mène bien chez vous.
            </p>
          </div>
        </Reveal>

        <Reveal delay={340}>
          <p className="text-[13px] text-ink-faint text-center max-w-[640px] mx-auto mt-8">
            Prix hors TVA, par établissement. Aucune commission, ni au comptoir ni en ligne. Les premiers
            restaurants du réseau bénéficient du tarif fondateur, conservé à vie. Aucune fonctionnalité
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
}) {
  return (
    <div
      className={`bg-white rounded-xl p-8 h-full flex flex-col ${
        highlighted ? "border-[1.5px] border-moss" : "border border-paper-border"
      }`}
    >
      <div className="flex items-center justify-between gap-3">
        <h3 className="font-display text-[22px] font-bold m-0">{name}</h3>
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
      {cta}
    </div>
  );
}
