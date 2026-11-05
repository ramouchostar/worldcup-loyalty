"use client";

import { Check } from "lucide-react";
import { Reveal } from "./motion";
import { Portrait } from "./Portrait";
import { assistant } from "./brigade";

// « Votre part du travail ? 5 minutes par jour. » (Brigade 17, maquette du
// 2026-11-04) : une carte d'idée telle que la montre l'écran « Idées du jour »
// de la console (ADR 0089 §2 et §5 : trois lignes quoi · pour qui · combien,
// une estimation en fourchette avec sa base, Oui / Non / Plus tard). Données
// d'illustration, marquées « exemple ». Jamais une promesse de gain (ADR 0064).

const STEPS = [
  { n: "1", title: "Une idée arrive sur le téléphone", desc: "Pas d'ordinateur, rien à installer." },
  { n: "2", title: "Trois lignes à lire", desc: "Ce qu'on fait, pour qui, combien ça coûte." },
  { n: "3", title: "Oui, Non ou Plus tard", desc: "Oui, c'est parti. Non, rien ne se passe, et la brigade retient pourquoi." },
];

const PROMISES = [
  "Rien ne part sans votre accord",
  "Aucun euro dépensé sans votre accord",
  "Trois idées par jour au plus",
];

export function FiveMinutesSection() {
  const hugo = assistant("hugo");
  return (
    <section id="cinq-minutes" className="max-w-[1200px] mx-auto px-5 sm:px-8 py-20 sm:py-24 scroll-mt-16">
      <div className="grid lg:grid-cols-[1.05fr_1fr] gap-12 lg:gap-16 items-center">
        <div>
          <Reveal>
            <p className="font-mono text-[11px] tracking-[0.12em] uppercase text-moss-dark mb-3.5">▶ Chaque matin</p>
            <h2 className="font-display text-[34px] sm:text-[44px] lg:text-[50px] leading-[1.15] tracking-[-0.02em] font-bold text-ink text-pretty">
              Votre part du travail ? 5 minutes par jour.
            </h2>
            <p className="font-landing text-[17px] leading-[1.65] text-ink-muted mt-4 mb-0 max-w-[560px] text-pretty">
              La brigade prépare tout. Vous lisez, vous répondez, vous retournez en cuisine.
            </p>
          </Reveal>

          <ol className="mt-9 space-y-5 list-none p-0">
            {STEPS.map((s, i) => (
              <Reveal key={s.n} as="li" delay={i * 90}>
                <div className="flex gap-4">
                  <span className="grid place-items-center w-9 h-9 rounded-full bg-ink text-moss-light font-display text-[15px] font-bold shrink-0">
                    {s.n}
                  </span>
                  <div>
                    <p className="text-[17px] font-semibold text-ink m-0">{s.title}</p>
                    <p className="text-[15px] text-ink-muted m-0 mt-0.5">{s.desc}</p>
                  </div>
                </div>
              </Reveal>
            ))}
          </ol>

          <Reveal delay={300}>
            <ul className="mt-8 flex flex-wrap gap-2.5 list-none p-0">
              {PROMISES.map((p) => (
                <li key={p} className="inline-flex items-center gap-1.5 bg-moss-tint text-ink text-[13.5px] font-semibold rounded-full px-3.5 py-1.5">
                  <Check className="w-4 h-4 text-moss-dark" strokeWidth={2.6} aria-hidden />
                  {p}
                </li>
              ))}
            </ul>
          </Reveal>
        </div>

        <Reveal delay={120} y={24}>
          <div className="relative max-w-[440px] mx-auto">
            <div className="absolute -inset-5 rounded-[28px] bg-gradient-to-br from-moss-dark via-moss to-moss-light opacity-90" aria-hidden />
            <div className="relative bg-white rounded-2xl shadow-[0_24px_60px_rgba(10,10,10,0.2)] p-5 space-y-3.5">
              <div className="flex items-center gap-2.5">
                <Portrait id="hugo" size={40} />
                <div className="flex-1 min-w-0">
                  <p className="text-[14px] font-semibold text-ink m-0">{hugo.name}</p>
                  <p className="text-[12px] text-ink-muted m-0 truncate">{hugo.post}</p>
                </div>
                <span className="text-[12px] text-ink-muted whitespace-nowrap">Avant mardi</span>
              </div>
              <div>
                <p className="text-[17px] font-semibold leading-snug text-ink m-0">Faire revenir 340 clients</p>
                <p className="text-[15px] text-ink-body m-0 mt-1">On leur offre une boisson mardi ?</p>
              </div>
              <dl className="grid grid-cols-[76px_minmax(0,1fr)] gap-x-2 gap-y-1.5 text-[13px] leading-snug m-0">
                <dt className="text-ink-muted">Quoi</dt>
                <dd className="text-ink-body m-0">Un message avec une boisson offerte mardi</dd>
                <dt className="text-ink-muted">Pour qui</dt>
                <dd className="text-ink-body m-0">Les clients pas revenus depuis un mois</dd>
                <dt className="text-ink-muted">Combien</dt>
                <dd className="text-ink-body m-0">Une boisson par client qui revient</dd>
              </dl>
              <div className="rounded-lg bg-moss-tint px-3 py-2.5">
                <p className="text-[13px] font-semibold text-ink m-0">Entre 15 et 30 clients de retour</p>
                <p className="text-[12px] text-ink-muted m-0">D&apos;après les relances déjà faites dans l&apos;établissement</p>
              </div>
              <div className="flex gap-2">
                <span className="flex-1 grid place-items-center min-h-[44px] rounded-xl bg-ink text-white text-[15px] font-semibold">Oui</span>
                <span className="grid place-items-center min-h-[44px] px-4 rounded-xl border border-paper-border text-[15px] font-medium text-ink">Non</span>
                <span className="grid place-items-center min-h-[44px] px-3 text-[14px] font-medium text-ink-muted">Plus tard</span>
              </div>
            </div>
            <p className="relative text-[12px] text-ink-faint text-center mt-9 mb-0">Exemple d&apos;idée, établissement imaginaire</p>
          </div>
        </Reveal>
      </div>
    </section>
  );
}
