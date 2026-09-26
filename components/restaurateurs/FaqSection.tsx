"use client";

import { Reveal } from "./motion";

const QUESTIONS = [
  {
    q: "Le programme ralentit-il le comptoir ?",
    a: "Non. Le client photographie son ticket après avoir payé. La caisse ne change pas.",
  },
  {
    q: "Faut-il valider les tickets ?",
    a: "Non, la lecture est automatique. Seuls les cas douteux remontent.",
  },
  {
    q: "Faut-il quitter Uber Eats ?",
    a: "Non. Les plateformes restent utiles pour la livraison. Le site de commande sert aux habitués, sans commission de plateforme.",
  },
  {
    q: "Le référencement, c'est quoi ?",
    a: "La place de l'établissement quand on cherche « snack près de moi » sur Google. On la fait monter, et son évolution s'affiche chaque mois.",
  },
  {
    q: "Et au-delà de 500 tickets par mois ?",
    a: "Les clients ne voient aucune différence. Si cela dure deux mois, le plan Croissance est proposé.",
  },
  {
    q: "Et en cas d'arrêt ?",
    a: "Gratuit et Croissance : à tout moment. Pro : 3 mois minimum. La liste de clients et le nom de domaine restent la propriété de l'établissement.",
  },
  {
    q: "Les clients peuvent-ils dépenser leurs points ailleurs ?",
    a: "Non. Les points gagnés dans un établissement ne valent que là.",
  },
];

export function FaqSection() {
  return (
    <section id="questions" className="max-w-[1200px] mx-auto px-5 sm:px-8 py-20 sm:py-24 scroll-mt-16">
      <Reveal>
        <p className="font-mono text-[11px] tracking-[0.12em] uppercase text-moss-dark mb-3.5">▶ Questions</p>
        <h2 className="font-display text-[34px] sm:text-[44px] lg:text-[54px] leading-[1.2] tracking-[-0.02em] font-bold text-ink max-w-[640px] text-pretty">
          Les questions fréquentes.
        </h2>
      </Reveal>

      <div className="grid sm:grid-cols-2 gap-6 mt-10">
        {QUESTIONS.map((item, i) => (
          <Reveal key={item.q} delay={(i % 2) * 80}>
            <div className="bg-white border border-paper-border rounded-xl p-6 h-full">
              <p className="font-display text-[15px] font-bold text-ink mb-2">{item.q}</p>
              <p className="text-sm leading-relaxed text-ink-muted m-0">{item.a}</p>
            </div>
          </Reveal>
        ))}
      </div>
    </section>
  );
}
