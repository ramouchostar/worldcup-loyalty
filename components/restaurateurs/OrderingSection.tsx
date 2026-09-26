"use client";

import { Reveal } from "./motion";

// ADR 0070 §2 (Croissance) — site de commande à la marque du resto et origine
// des commandes. Pas encore livré : présenté en « places pilotes ». Les
// chiffres des deux cartes sont des exemples d'illustration, signalés comme
// tels (même règle que les mockups Belchicken du reste de la page).

const POINTS = [
  "À ton nom, à tes couleurs, avec ton logo : ton client commande chez toi, pas sur une plateforme",
  "Le paiement arrive directement sur ton compte (Bancontact, carte, Apple Pay, Google Pay)",
  "Ton client gagne ses points tout seul, sans photo de ticket",
  "Aucun autre restaurant n'apparaît sur ta page",
];

// Commande de 25 € : ce que le restaurateur laisse sur la vente.
const COMPARISON = [
  { label: "Plateforme de livraison", note: "souvent 25 à 35 %", amount: "≈ 7,50 €", highlight: false },
  { label: "Boosteats Croissance", note: "5 %", amount: "1,25 €", highlight: false },
  { label: "Boosteats Pro", note: "0 %", amount: "0 €", highlight: true },
];

const SOURCES = [
  { label: "Instagram et Facebook", orders: 84, revenue: "1 932 €", width: "100%" },
  { label: "Google", orders: 61, revenue: "1 403 €", width: "73%" },
  { label: "QR code en salle", orders: 47, revenue: "1 081 €", width: "56%" },
  { label: "WhatsApp et lien direct", orders: 22, revenue: "506 €", width: "26%" },
];

export function OrderingSection() {
  return (
    <section id="commande" className="max-w-[1200px] mx-auto px-5 sm:px-8 pt-20 sm:pt-24 pb-24 scroll-mt-16">
      <div className="grid lg:grid-cols-[1.15fr_1fr] gap-10 lg:gap-14 items-center">
        <Reveal>
          <div>
            <p className="font-mono text-[11px] tracking-[0.12em] uppercase text-moss-dark mb-4">
              ▶ Commande en ligne · places pilotes
            </p>
            <h2 className="font-display text-[34px] sm:text-[44px] lg:text-[54px] leading-[1.2] tracking-[-0.02em] font-bold text-ink text-pretty">
              Ton site de commande. Ton nom. Ton argent.
            </h2>
            <p className="font-landing text-base leading-[1.7] text-ink-muted mt-5">
              Tes habitués te connaissent déjà : ils n&apos;ont aucune raison de te coûter un tiers de leur commande
              sur une plateforme. Avec Boosteats, ils commandent à emporter sur ton propre site, et tu gardes la
              relation avec eux.
            </p>
            <div className="flex flex-col gap-2.5 mt-6">
              {POINTS.map((point) => (
                <p key={point} className="text-[14.5px] text-ink-body m-0">
                  <span className="font-mono text-moss">✓</span>&nbsp; {point}
                </p>
              ))}
            </div>
          </div>
        </Reveal>

        <Reveal delay={120} y={28}>
          <div className="bg-white border-[1.5px] border-moss-tint2 rounded-xl p-6">
            <p className="font-mono text-[10.5px] tracking-[0.12em] uppercase text-moss-dark m-0 mb-1">
              Sur une commande de 25 €
            </p>
            <p className="text-[14.5px] text-ink-body m-0 mb-4">Ce que tu laisses à l&apos;intermédiaire :</p>
            <div className="flex flex-col gap-2">
              {COMPARISON.map((row) => (
                <div
                  key={row.label}
                  className={`flex items-center justify-between gap-4 rounded-lg px-4 py-3 ${
                    row.highlight ? "bg-moss-tint" : "bg-paper-subtle"
                  }`}
                >
                  <div>
                    <p className="text-[14.5px] font-semibold text-ink m-0">{row.label}</p>
                    <p className="text-xs text-ink-faint m-0">{row.note}</p>
                  </div>
                  <p
                    className={`font-display text-xl font-bold m-0 ${row.highlight ? "text-moss-dark" : "text-ink"}`}
                  >
                    {row.amount}
                  </p>
                </div>
              ))}
            </div>
            <p className="text-[11px] text-ink-faint mt-3 mb-0">
              Les frais de paiement par carte (environ 1,5 %) s&apos;ajoutent partout, comme pour tout paiement par
              carte.
            </p>
          </div>
        </Reveal>
      </div>

      <div className="grid lg:grid-cols-[1fr_1.15fr] gap-10 lg:gap-14 items-center mt-20">
        <Reveal y={28} className="order-2 lg:order-1">
          <div className="bg-white border border-paper-border rounded-xl p-6">
            <div className="flex items-baseline justify-between gap-3 mb-4">
              <p className="font-display text-[15px] font-bold text-ink m-0">D&apos;où viennent tes commandes</p>
              <p className="font-mono text-[10px] tracking-[0.1em] uppercase text-ink-faint m-0">Exemple · ce mois</p>
            </div>
            <div className="flex flex-col gap-3.5">
              {SOURCES.map((s) => (
                <div key={s.label}>
                  <div className="flex items-baseline justify-between gap-3">
                    <p className="text-[14px] text-ink-body m-0">{s.label}</p>
                    <p className="text-[13px] text-ink-muted m-0">
                      {s.orders} commandes · <span className="font-semibold text-ink">{s.revenue}</span>
                    </p>
                  </div>
                  <div className="h-2 rounded-full bg-paper-subtle mt-1.5 overflow-hidden">
                    <div className="h-full rounded-full bg-moss" style={{ width: s.width }} />
                  </div>
                </div>
              ))}
            </div>
          </div>
        </Reveal>

        <Reveal delay={120} className="order-1 lg:order-2">
          <div>
            <p className="font-mono text-[11px] tracking-[0.12em] uppercase text-moss-dark mb-4">
              ▶ Ce que te rapporte ta pub
            </p>
            <h3 className="font-display text-[28px] sm:text-[36px] leading-[1.2] tracking-[-0.02em] font-bold text-ink text-pretty">
              Tu paies de la pub ? Tu sais enfin ce qu&apos;elle te ramène.
            </h3>
            <p className="font-landing text-base leading-[1.7] text-ink-muted mt-5">
              Chaque commande garde en mémoire d&apos;où vient le client : une pub Instagram, une recherche Google, ton
              QR code en salle, un message WhatsApp. Tu vois combien de commandes et combien d&apos;euros chaque canal
              t&apos;a apportés. Tu gardes ce qui marche, tu coupes ce qui ne marche pas.
            </p>
            <p className="text-[14.5px] text-ink-body mt-4 mb-0">
              <span className="font-mono text-moss">✓</span>&nbsp; Si une agence gère ta pub, elle voit les mêmes
              chiffres que toi : plus besoin de la croire sur parole.
            </p>
          </div>
        </Reveal>
      </div>
    </section>
  );
}
