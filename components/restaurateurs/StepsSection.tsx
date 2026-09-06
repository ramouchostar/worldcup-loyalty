"use client";

import { TrackedLink } from "@/components/analytics/TrackedLink";
import { Reveal, useParallaxOffset } from "./motion";
import { FloatingFoodIcon } from "./FloatingFoodIcon";

const STEPS = [
  {
    n: "01",
    title: "Présente ton établissement",
    desc: "Nom, ville, quartier, réseaux sociaux. Deux minutes.",
  },
  {
    n: "02",
    title: "Envoie ta carte, comme tu l'as",
    desc: "Une photo, un PDF, un fichier Excel : on prend ce que tu as et on s'occupe de la mise en forme. Tu n'as rien à préparer.",
  },
  {
    n: "03",
    title: "Complète tes coûts, si tu veux",
    desc: "Une page simple, produit par produit, que tu remplis à ton rythme. Tu peux la laisser vide : le programme tourne avec des marges estimées et se précisera quand tu la compléteras.",
    optional: true,
  },
  {
    n: "04",
    title: "Lance-toi",
    desc: "On valide ton établissement, ton QR code et tes supports imprimables sont prêts à présenter à tes clients.",
  },
];

export function StepsSection() {
  const blobRef = useParallaxOffset(0.12);

  return (
    <section id="demarrer" className="relative bg-ink overflow-hidden py-20 sm:py-24 scroll-mt-16">
      <div
        ref={blobRef}
        className="absolute -top-[200px] -right-36 w-[640px] h-[640px] pointer-events-none"
        style={{ background: "radial-gradient(circle, rgba(162,197,35,0.18), transparent 60%)" }}
      />

      <FloatingFoodIcon
        icon="burger"
        className="text-xl bottom-3 left-3 sm:text-3xl sm:bottom-6 sm:left-4 lg:text-5xl lg:bottom-10 lg:left-8 rotate-12"
      />

      <div className="relative max-w-[1200px] mx-auto px-5 sm:px-8">
        <Reveal>
          <p className="font-mono text-[11px] tracking-[0.12em] uppercase text-moss-light mb-3.5">▶ Démarrer</p>
          <h2 className="font-display text-[34px] sm:text-[44px] lg:text-[54px] leading-[1.2] tracking-[-0.02em] font-bold text-white max-w-[620px] text-pretty">
            Ton programme est prêt en quatre étapes.
          </h2>
        </Reveal>

        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-6 mt-11">
          {STEPS.map((s, i) => (
            <Reveal key={s.n} delay={i * 100}>
              <div className="bg-night-raised border border-night-line rounded-xl p-7 h-full">
                <div className="flex items-center justify-between">
                  <p className="font-mono text-[11px] tracking-[0.12em] text-moss">{s.n}</p>
                  {s.optional && (
                    <span className="font-mono text-[9.5px] tracking-[0.1em] uppercase text-moss-light bg-white/10 rounded-full px-2 py-0.5">
                      Optionnel
                    </span>
                  )}
                </div>
                <p className="text-lg font-semibold text-white mt-3.5 mb-1.5">{s.title}</p>
                <p className="text-sm leading-relaxed text-night-text m-0">{s.desc}</p>
              </div>
            </Reveal>
          ))}
        </div>

        <Reveal delay={420}>
          <div className="flex items-center gap-5 mt-11 flex-wrap">
            <TrackedLink
              ctaId="devenir_partenaire"
              ctaLocation="etapes"
              audience="restaurateur"
              href="/become-a-partner"
              className="bg-moss text-white text-[15px] font-bold px-[26px] py-[15px] rounded-lg hover:bg-moss-dark transition-colors"
            >
              Commencer le plan gratuit →
            </TrackedLink>
            <span className="font-mono text-[11px] tracking-[0.1em] uppercase text-night-faint">
              Aucune carte bancaire · aucun engagement
            </span>
          </div>
        </Reveal>
      </div>
    </section>
  );
}
