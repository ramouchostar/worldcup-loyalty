"use client";

import { Reveal } from "./motion";
import { MemberAppMockup } from "./MemberAppMockup";

const FIDELITY_POINTS = [
  "Le cadeau ne peut jamais coûter plus que le CA qu'il a généré",
  "Les points sont valables uniquement chez toi — tes clients ne partent pas les dépenser ailleurs",
  "Le client scanne après avoir payé : ton comptoir ne ralentit jamais",
  "L'app porte ton nom, tes couleurs, ton logo",
];

const CLIENT_STEPS = [
  {
    n: "01",
    title: "Il paie normalement",
    desc: "Aucun changement à ta caisse, aucun matériel à installer.",
  },
  {
    n: "02",
    title: "Il scanne ton QR, puis son ticket",
    desc: "Après paiement, tranquillement. Aucune saisie de ta part.",
  },
  {
    n: "03",
    title: "Il cumule chez toi",
    desc: "Ses points ne sont valables que dans ton établissement.",
  },
  {
    n: "04",
    title: "Il revient chercher son cadeau",
    desc: "Tu connais son coût exact à l'avance.",
  },
];

export function FidelitySection() {
  return (
    <section id="fidelite" className="max-w-[1200px] mx-auto px-5 sm:px-8 pt-20 sm:pt-24 pb-24 scroll-mt-16">
      <div className="grid lg:grid-cols-[1.15fr_1fr] gap-10 lg:gap-14 items-center">
        <Reveal>
          <div>
            <p className="font-mono text-[11px] tracking-[0.12em] uppercase text-moss-dark mb-4">▶ Fidélité</p>
            <h2 className="font-display text-[34px] sm:text-[44px] lg:text-[54px] leading-[1.2] tracking-[-0.02em] font-bold text-ink text-pretty">
              Le cadeau n&apos;est pas une remise. C&apos;est un rendez-vous.
            </h2>
            <p className="font-landing text-base leading-[1.7] text-ink-muted mt-5">
              Une remise coûte de l&apos;argent sur une vente que tu allais faire de toute façon. Un cadeau
              Boosteats se débloque après un chiffre d&apos;affaires déjà encaissé, et son coût est calculé sur
              ton propre prix de revient. C&apos;est ce qui fait revenir un client une fois de plus dans le mois
              sans jamais entamer ta marge.
            </p>

            <div className="bg-white border-[1.5px] border-moss-tint2 rounded-xl px-5 py-[18px] mt-6">
              <p className="font-mono text-[10.5px] tracking-[0.12em] uppercase text-moss-dark m-0 mb-2.5">
                Chez Belchicken
              </p>
              <p className="text-[14.5px] text-ink-body m-0">Karim a dépensé 68 € ce mois-ci, en quatre passages.</p>
              <p className="text-[14.5px] text-ink-body mt-1 mb-0">Il débloque une part de churros.</p>
              <div className="flex gap-6 mt-3 pt-3 border-t border-paper-border">
                <div>
                  <p className="font-display text-lg font-bold m-0">0,42 €</p>
                  <p className="text-[11px] text-ink-faint mt-0.5 mb-0">coût matière</p>
                </div>
                <div>
                  <p className="font-display text-lg font-bold m-0">44,20 €</p>
                  <p className="text-[11px] text-ink-faint mt-0.5 mb-0">marge encaissée sur ces 4 visites</p>
                </div>
              </div>
            </div>

            <div className="flex flex-col gap-2.5 mt-6">
              {FIDELITY_POINTS.map((point) => (
                <p key={point} className="text-[14.5px] text-ink-body m-0">
                  <span className="font-mono text-moss">✓</span>&nbsp; {point}
                </p>
              ))}
            </div>

            <p className="text-xs text-ink-faint mt-5">
              Le programme fonctionne aujourd&apos;hui sur tes commandes sur place et à emporter. La prise de
              commande en direct arrive prochainement.
            </p>
          </div>
        </Reveal>

        <Reveal delay={120} y={28}>
          <div className="w-[260px] sm:w-[280px] mx-auto rounded-[32px] bg-night-raised border border-night-line p-[9px] shadow-[0_24px_64px_rgba(0,0,0,0.2)]">
            <MemberAppMockup />
          </div>
        </Reveal>
      </div>

      <Reveal delay={80}>
        <div className="mt-16 lg:mt-20">
          <h3 className="font-display text-xl font-bold text-ink text-center mb-8">
            Comment ça se passe pour ton client
          </h3>
          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-5">
            {CLIENT_STEPS.map((s) => (
              <div key={s.n} className="bg-white border border-paper-border rounded-xl p-6">
                <p className="font-mono text-[11px] tracking-[0.12em] text-moss mb-3">{s.n}</p>
                <p className="text-[15px] font-semibold text-ink mb-1.5">{s.title}</p>
                <p className="text-sm leading-relaxed text-ink-muted m-0">{s.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </Reveal>
    </section>
  );
}
