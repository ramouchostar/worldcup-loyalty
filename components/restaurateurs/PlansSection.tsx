"use client";

import { TrackedLink } from "@/components/analytics/TrackedLink";
import type { AssistantId } from "@/lib/agents/types";
import { Portrait } from "./Portrait";
import { Check } from "@/components/icons";
import { whatsappUrl } from "@/lib/contact";

// Plans, prix HTVA par établissement (remise à plat du 2026-11-02,
// .claude/product-marketing.md) : Gratuit (≤ 500 tickets/mois, le client n'est
// jamais bloqué) · Croissance 150 €/mois sans engagement · Pro 500 €/mois,
// 3 mois minimum. Brigade 17 (maquette du 2026-11-04) : chaque forfait dit
// quels assistants il met au travail (ADR 0089 §1). Nina et Max portent « en
// pilote », Louis répond aux avis AVEC l'équipe (pas de publication
// automatique) — ADR 0070, jamais une fonction non livrée au présent. Pas de
// calcul « X € = N tickets » (décision du 2026-11-01). Les forfaits payants se
// prennent en parlant avec nous (WhatsApp), pas par un paiement en ligne.

type Feature = { text: string; who?: AssistantId; pilot?: boolean };

const FREE_FEATURES: Feature[] = [
  { who: "lea", text: "Léa inscrit vos clients et gère les cadeaux" },
  { who: "hugo", text: "Hugo relance vos clients" },
  { who: "chloe", text: "Chloé suit votre chiffre du jour et le coût de chaque plat" },
  { who: "emma", text: "Emma prépare une pub de quartier quand vous voulez (20 % de frais)" },
  { text: "Rien à brancher : le ticket de caisse suffit" },
  { text: "Des cadeaux calculés sur ce qu'ils vous coûtent, au taux que vous choisissez" },
  { text: "Jusqu'à 500 tickets par mois" },
];

const GROWTH_FEATURES: Feature[] = [
  { text: "Tickets illimités" },
  { who: "louis", text: "Louis répond à vos avis Google, avec l'équipe" },
  { who: "chloe", text: "Chloé suit vos ventes plat par plat et prévoit les jours à venir" },
  { text: "Votre chiffre comparé jour par jour, et la part qui vient de vos clients inscrits" },
  { text: "Des messages programmés à l'avance" },
  { text: "Pub de quartier à 15 % de frais" },
];

const PRO_FEATURES: Feature[] = [
  { text: "Toute la brigade" },
  { who: "nina", text: "Nina crée un site qui donne envie de commander", pilot: true },
  { who: "max", text: "Max améliore votre visibilité sur Google", pilot: true },
  { text: "Votre fiche Google tenue à jour, sur invitation" },
  { text: "Un rapport chaque mois, et un point avec nous" },
  { text: "Tous vos établissements au même endroit" },
  { text: "Pub de quartier à 5 % de frais" },
];

export function PlansSection() {
  return (
    <section id="plans" className="bx-band py-16 sm:py-24 scroll-mt-16">
      <div className="max-w-[1200px] mx-auto px-5 sm:px-8">
        <>
          <p className="bx-kicker mb-4">Tarifs</p>
          <h2 className="text-[32px] sm:text-[44px] leading-[1.1] tracking-[-0.025em] font-semibold text-ink max-w-[720px] text-balance m-0">
            Commencez gratuitement. Agrandissez la brigade quand vous voulez.
          </h2>
        </>

        <div className="grid lg:grid-cols-3 gap-6 mt-12 items-stretch">
          <>
            <PlanCard
              name="Gratuit"
              price="0 €"
              priceNote="pour toujours"
              commission="Aucune carte bancaire"
              pitch="Quatre assistants pour inscrire les clients et les faire revenir."
              intro={null}
              features={FREE_FEATURES}
              highlighted
              cta={
                <TrackedLink
                  ctaId="devenir_partenaire"
                  ctaLocation="plans_gratuit"
                  audience="restaurateur"
                  href="/become-a-partner"
                  className="mt-8 text-center bg-boost-olive text-white text-[15px] font-semibold rounded-lg px-5 py-3 min-h-[48px] inline-flex items-center justify-center hover:bg-boost-olive-dark active:bg-boost-night transition-colors"
                >
                  Commencer gratuitement
                </TrackedLink>
              }
            />
          </>

          <>
            <PlanCard
              name="Croissance"
              price="150 €"
              priceNote="HTVA / mois"
              commission="Sans engagement."
              pitch="Pour suivre vos chiffres et ne plus laisser un avis sans réponse."
              intro="Tout le Gratuit, plus :"
              includes={["lea", "hugo", "chloe", "emma"]}
              features={GROWTH_FEATURES}
              cta={
                <TrackedLink
                  ctaId="whatsapp"
                  ctaLocation="plans_croissance"
                  audience="restaurateur"
                  href={whatsappUrl("Bonjour, je voudrais en savoir plus sur le forfait Croissance pour mon restaurant.")}
                  className="mt-8 text-center border-[1.5px] border-boost-olive text-boost-olive-dark text-[15px] font-semibold rounded-lg px-5 py-3 min-h-[48px] inline-flex items-center justify-center hover:bg-boost-cream active:bg-[#e3e7d2] transition-colors"
                >
                  En parler sur WhatsApp
                </TrackedLink>
              }
            />
          </>

          <>
            <PlanCard
              name="Pro"
              price="500 €"
              priceNote="HTVA / mois"
              commission="3 mois minimum, puis au mois."
              pitch="Pour que le marketing soit pensé et fait à la place de l'établissement."
              intro="Tout Croissance, plus :"
              includes={["lea", "hugo", "chloe", "emma", "louis"]}
              features={PRO_FEATURES}
              cta={
                <TrackedLink
                  ctaId="whatsapp"
                  ctaLocation="plans_pro"
                  audience="restaurateur"
                  href={whatsappUrl("Bonjour, je voudrais en savoir plus sur le forfait Pro pour mon restaurant.")}
                  className="mt-8 text-center border-[1.5px] border-boost-olive text-boost-olive-dark text-[15px] font-semibold rounded-lg px-5 py-3 min-h-[48px] inline-flex items-center justify-center hover:bg-boost-cream active:bg-[#e3e7d2] transition-colors"
                >
                  En parler sur WhatsApp
                </TrackedLink>
              }
            />
          </>
        </div>

        <>
          <p className="text-[13px] text-ink-muted text-center max-w-[640px] mx-auto mt-8">
            Prix hors TVA, par établissement. Aucune commission, ni au comptoir ni en ligne. Les premiers
            restaurants du réseau bénéficient du tarif fondateur, conservé à vie. Aucune fonctionnalité
            gratuite d&apos;aujourd&apos;hui ne passera jamais derrière un paywall.
          </p>
        </>
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
  includes = [],
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
  /** Assistants des forfaits inférieurs, compris dans celui-ci : montrés à côté de « Tout le …, plus ». */
  includes?: AssistantId[];
  features: Feature[];
  cta: React.ReactNode;
  highlighted?: boolean;
}) {
  return (
    <div
      className={`bg-white rounded-lg p-8 h-full flex flex-col ${
        highlighted ? "border-[1.5px] border-boost-olive" : "border border-paper-border"
      }`}
    >
      <h3 className="text-[24px] font-semibold tracking-[-0.02em] text-ink m-0">{name}</h3>
      <p className="text-[32px] font-semibold tracking-[-0.025em] tabular-nums text-ink mt-2 mb-0">
        {price}
        <span className="text-[15px] font-normal tracking-normal text-ink-muted"> {priceNote}</span>
      </p>
      <p className="text-[15px] font-semibold text-boost-olive-dark mt-2 mb-0">{commission}</p>
      <p className="text-[15px] text-ink-muted mt-4 mb-6">{pitch}</p>
      {intro && (
        <div className="flex items-center gap-3 mb-4">
          {includes.length > 0 && (
            <span className="flex shrink-0" aria-hidden>
              {includes.map((id, k) => (
                <Portrait key={id} id={id} size={28} className={`ring-2 ring-white ${k > 0 ? "-ml-2" : ""}`} />
              ))}
            </span>
          )}
          <p className="text-[15px] font-semibold text-ink m-0">{intro}</p>
        </div>
      )}
      <ul className="flex flex-col gap-3 flex-1 list-none p-0 m-0">
        {features.map((f) => (
          <li key={f.text} className="flex items-start gap-3 text-[15px] text-ink-body">
            {f.who ? (
              <Portrait id={f.who} size={24} className="mt-px" />
            ) : (
              <Check size={20} className="text-boost-olive-dark shrink-0 mx-0.5 mt-px" />
            )}
            <span>
              {f.text}
              {f.pilot && (
                <span className="ml-2 text-[13px] font-semibold text-white bg-ink rounded-md px-2 py-0.5 whitespace-nowrap">
                  En pilote
                </span>
              )}
            </span>
          </li>
        ))}
      </ul>
      {cta}
    </div>
  );
}
