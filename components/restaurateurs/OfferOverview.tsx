"use client";

import Link from "next/link";
import { Reveal } from "./motion";

// ADR 0070 — l'offre en trois gestes, avant le détail de chaque section.
// Langage de restaurateur : « référencement », pas « SEO » ; « savoir d'où
// viennent tes commandes », pas « attribution ». Les deux fonctions pas
// encore livrées portent un badge « places pilotes » — jamais présentées
// comme disponibles.
const PILLARS = [
  {
    n: "01",
    plan: "Gratuit",
    pilot: false,
    title: "Faire revenir tes clients",
    desc: "Ton client photographie son ticket, gagne des points et revient chercher son cadeau. Chaque cadeau est calculé pour ne jamais te coûter plus que ce qu'il t'a rapporté.",
    href: "#fidelite",
    link: "Voir la fidélité",
  },
  {
    n: "02",
    plan: "Croissance",
    pilot: true,
    title: "Vendre en direct, sans laisser 30 % à une plateforme",
    desc: "Un site de commande à emporter à ton nom et à tes couleurs. L'argent arrive sur ton compte, et tu vois d'où vient chaque commande : Instagram, Google, ton QR code…",
    href: "#commande",
    link: "Voir la commande en ligne",
  },
  {
    n: "03",
    plan: "Pro",
    pilot: true,
    title: "Être trouvé sur Google",
    desc: "Quand quelqu'un cherche « snack près de moi », c'est ton resto qui doit sortir. On s'occupe de ton référencement, et chaque mois tu vois ta place.",
    href: "#google",
    link: "Voir le référencement",
  },
];

export function OfferOverview() {
  return (
    <section id="offre" className="bg-paper-subtle py-20 sm:py-24 scroll-mt-16">
      <div className="max-w-[1200px] mx-auto px-5 sm:px-8">
        <Reveal>
          <p className="font-mono text-[11px] tracking-[0.12em] uppercase text-moss-dark mb-3.5">▶ L&apos;offre</p>
          <h2 className="font-display text-[34px] sm:text-[44px] lg:text-[54px] leading-[1.2] tracking-[-0.02em] font-bold text-ink max-w-[720px] text-pretty">
            Trois choses que Boosteats fait pour toi.
          </h2>
          <p className="font-landing text-base leading-[1.7] text-ink-muted mt-5 max-w-[640px]">
            Pas besoin d&apos;être un pro du marketing. Tu commences gratuitement avec la fidélité, et tu ajoutes le
            reste quand tu en as besoin.
          </p>
        </Reveal>

        <div className="grid md:grid-cols-3 gap-6 mt-10">
          {PILLARS.map((p, i) => (
            <Reveal key={p.n} delay={i * 100}>
              <div className="bg-white border border-paper-border rounded-xl p-7 h-full flex flex-col">
                <div className="flex items-center justify-between gap-3">
                  <p className="font-mono text-[11px] tracking-[0.12em] text-moss m-0">{p.n}</p>
                  <span className="font-mono text-[10px] tracking-[0.1em] uppercase text-moss-dark bg-moss-tint rounded-full px-2.5 py-1">
                    {p.plan}
                    {p.pilot && " · places pilotes"}
                  </span>
                </div>
                <p className="font-display text-xl font-bold text-ink mt-4 mb-2 text-pretty">{p.title}</p>
                <p className="text-sm leading-relaxed text-ink-muted m-0 flex-1">{p.desc}</p>
                <Link href={p.href} className="text-sm font-semibold text-moss-dark hover:underline mt-5">
                  {p.link} →
                </Link>
              </div>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}
