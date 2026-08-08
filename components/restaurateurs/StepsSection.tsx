"use client";

import Link from "next/link";
import { Reveal, useParallaxOffset } from "./motion";

const STEPS = [
  {
    n: "01",
    title: "Présente ton établissement",
    desc: "Nom, ville, quartier, réseaux sociaux — 2 minutes.",
  },
  {
    n: "02",
    title: "Envoie ta carte",
    desc: "Un fichier avec tes prix — les récompenses se calibrent seules sur tes marges.",
  },
  {
    n: "03",
    title: "Lance-toi",
    desc: "On valide ton établissement, puis ton QR est prêt à imprimer.",
  },
];

export function StepsSection() {
  const blobRef = useParallaxOffset(0.12);

  return (
    <section id="demarrer" className="relative bg-ink overflow-hidden py-20 sm:py-24 scroll-mt-16">
      <div
        ref={blobRef}
        className="absolute -top-[200px] -right-36 w-[640px] h-[640px] pointer-events-none"
        style={{ background: "radial-gradient(circle, rgba(122,143,63,0.18), transparent 60%)" }}
      />

      <div className="relative max-w-[1200px] mx-auto px-5 sm:px-8">
        <Reveal>
          <p className="font-mono text-[11px] tracking-[0.12em] uppercase text-moss-light mb-3.5">▶ Démarrer</p>
          <h2 className="font-display text-[28px] sm:text-[33px] lg:text-[39px] leading-[1.2] tracking-[-0.02em] font-bold text-white max-w-[620px] text-pretty">
            En ligne en trois étapes.
          </h2>
        </Reveal>

        <div className="grid sm:grid-cols-3 gap-6 mt-11">
          {STEPS.map((s, i) => (
            <Reveal key={s.n} delay={i * 100}>
              <div className="bg-night-raised border border-night-line rounded-xl p-7 h-full">
                <p className="font-mono text-[11px] tracking-[0.12em] text-moss">{s.n}</p>
                <p className="text-lg font-semibold text-white mt-3.5 mb-1.5">{s.title}</p>
                <p className="text-sm leading-relaxed text-night-text m-0">{s.desc}</p>
              </div>
            </Reveal>
          ))}
        </div>

        <Reveal delay={320}>
          <div className="flex items-center gap-5 mt-11 flex-wrap">
            <Link
              href="/become-a-partner"
              className="bg-moss text-white text-[15px] font-bold px-[26px] py-[15px] rounded-lg hover:bg-moss-dark transition-colors"
            >
              Devenir partenaire gratuitement →
            </Link>
            <span className="font-mono text-[11px] tracking-[0.1em] uppercase text-night-faint">
              Aucune carte bancaire · aucun engagement
            </span>
          </div>
        </Reveal>
      </div>
    </section>
  );
}
