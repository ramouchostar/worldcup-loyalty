"use client";

import { Reveal } from "./motion";

const BENEFITS = [
  {
    title: "Une acquisition qui ne te coûte rien",
    desc: "Chaque équipe recrute pour toi. Un salarié qui inscrit huit collègues, c'est huit clients réguliers acquis sans un euro de publicité.",
  },
  {
    title: "Des segments enfin lisibles",
    desc: "Tu ne vois plus « 128 clients ». Tu vois l'équipe du bureau d'en face qui déjeune du lundi au jeudi entre 12 h et 13 h, les étudiants du soir, le groupe du week-end. Trois comportements différents, trois façons de leur parler.",
  },
  {
    title: "Un ciblage qui devient possible",
    desc: "Un mardi creux se remplit en s'adressant à l'équipe qui vient déjà en semaine — pas en arrosant toute ta base d'une remise dont tu n'as pas besoin.",
  },
];

export function ParrainageSection() {
  return (
    <section id="parrainage" className="bg-paper-subtle py-20 sm:py-24 scroll-mt-16">
      <div className="max-w-[1200px] mx-auto px-5 sm:px-8">
        <Reveal>
          <p className="font-mono text-[11px] tracking-[0.12em] uppercase text-moss-dark mb-3.5">▶ Parrainage</p>
          <h2 className="font-display text-[28px] sm:text-[33px] lg:text-[39px] leading-[1.2] tracking-[-0.02em] font-bold text-ink max-w-[720px] text-pretty">
            Tes clients ne viennent plus seuls. Et tu sais enfin qui ils sont.
          </h2>
          <p className="font-landing text-base leading-[1.7] text-ink-muted mt-5 max-w-[640px]">
            Sur l&apos;app, tes clients créent des équipes — leur bureau, leur classe, leur salle de sport. Chaque
            membre qui rejoint amène les suivants. Tu ne gagnes pas un client, tu gagnes un groupe qui déjeune
            ensemble, au même endroit, aux mêmes horaires.
          </p>
        </Reveal>

        <Reveal delay={80}>
          <p className="font-display font-bold text-ink mt-10 mb-6">Ce que ça t&apos;apporte concrètement</p>
        </Reveal>

        <div className="grid sm:grid-cols-3 gap-6">
          {BENEFITS.map((b, i) => (
            <Reveal key={b.title} delay={i * 100}>
              <div className="bg-white border border-paper-border rounded-xl p-6 h-full">
                <p className="text-[15px] font-semibold text-ink mb-2">{b.title}</p>
                <p className="text-sm leading-relaxed text-ink-muted m-0">{b.desc}</p>
              </div>
            </Reveal>
          ))}
        </div>

        <Reveal delay={200}>
          <div className="bg-white border-[1.5px] border-moss-tint2 rounded-xl px-6 py-5 mt-8 max-w-[640px]">
            <p className="font-mono text-[10.5px] tracking-[0.12em] uppercase text-moss-dark m-0 mb-2.5">
              Chez Belchicken
            </p>
            <p className="text-[14.5px] text-ink-body m-0">
              L&apos;équipe « Bureau Louise » : 11 membres, 34 passages sur le mois, ticket moyen 16,20 €.
            </p>
            <p className="text-[14.5px] text-ink-body mt-1.5 mb-0">
              Un seul message envoyé à ce groupe a rempli deux mardis soirs.
            </p>
          </div>
        </Reveal>
      </div>
    </section>
  );
}
