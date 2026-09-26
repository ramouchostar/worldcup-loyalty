"use client";

import { Reveal } from "./motion";

const QUESTIONS = [
  {
    q: "Ça ralentit mon comptoir ?",
    a: "Non. Le client photographie son ticket après avoir payé. Ta caisse ne change pas.",
  },
  {
    q: "Je dois valider les tickets ?",
    a: "Non, la lecture est automatique. Seuls les cas douteux remontent.",
  },
  {
    q: "Je suis sur Uber Eats. Je dois partir ?",
    a: "Non. Garde-les pour la livraison. Ton site sert à tes habitués, sans commission de plateforme.",
  },
  {
    q: "Le référencement, c'est quoi ?",
    a: "Ta place quand on cherche « snack près de moi » sur Google. On la fait monter, tu la vois chaque mois.",
  },
  {
    q: "Et au-delà de 500 tickets par mois ?",
    a: "Tes clients ne voient rien. Si ça dure deux mois, on te propose le plan Croissance.",
  },
  {
    q: "Comment vous gagnez de l'argent ?",
    a: "L'abonnement, et 5 % des commandes en ligne en Croissance. Rien sur le comptoir, aucune donnée revendue.",
  },
  {
    q: "Et si j'arrête ?",
    a: "Gratuit et Croissance : quand tu veux. Pro : 3 mois minimum. Ta liste de clients et ton domaine restent à toi.",
  },
  {
    q: "Mes clients dépensent leurs points ailleurs ?",
    a: "Non. Les points gagnés chez toi ne valent que chez toi.",
  },
];

export function FaqSection() {
  return (
    <section id="questions" className="max-w-[1200px] mx-auto px-5 sm:px-8 py-20 sm:py-24 scroll-mt-16">
      <Reveal>
        <p className="font-mono text-[11px] tracking-[0.12em] uppercase text-moss-dark mb-3.5">▶ Questions</p>
        <h2 className="font-display text-[34px] sm:text-[44px] lg:text-[54px] leading-[1.2] tracking-[-0.02em] font-bold text-ink max-w-[640px] text-pretty">
          Tes questions.
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
