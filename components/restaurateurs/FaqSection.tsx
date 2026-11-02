"use client";

import { Reveal } from "./motion";

const QUESTIONS = [
  {
    q: "Le programme ralentit-il le comptoir ?",
    a: "Non. Le client photographie son ticket après avoir payé. La caisse ne change pas.",
  },
  {
    q: "Faut-il valider les tickets ?",
    a: "Non, les tickets se valident seuls. Seuls les cas douteux remontent.",
  },
  {
    q: "Faut-il changer de caisse ?",
    a: "Non. Rien ne s'installe sur la caisse et rien n'y est écrit : le client photographie le ticket qu'elle a imprimé.",
  },
  {
    q: "Qui écrit les messages ?",
    a: "L'établissement les écrit, en quelques lignes : une offre du soir, un nouveau plat, une fête. Deux messages partent tout seuls : l'anniversaire, et le rappel quand un habitué ne revient plus.",
  },
  {
    q: "Faut-il quitter Uber Eats ?",
    a: "Non. Les plateformes restent utiles pour la livraison. Le programme fait revenir les clients au comptoir.",
  },
  {
    q: "Les avis sont-ils récompensés ?",
    a: "Jamais. Google interdit toute contrepartie à un avis et peut sanctionner la fiche. Avec Croissance et Pro, on répond à vos avis pour vous, sans jamais en acheter.",
  },
  {
    q: "Le référencement, c'est quoi ?",
    a: "La place de l'établissement quand on cherche « snack près de moi » sur Google. L'analyse gratuite la mesure depuis neuf points autour du restaurant et dit quoi corriger sur la fiche.",
  },
  {
    q: "Et au-delà de 500 tickets par mois ?",
    a: "Les clients ne voient aucune différence. Si cela dure deux mois, le plan Croissance est proposé.",
  },
  {
    q: "Et en cas d'arrêt ?",
    a: "Gratuit et Croissance : à tout moment. Pro : 3 mois minimum. La liste de clients reste la propriété de l'établissement.",
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
