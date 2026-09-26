"use client";

import { Reveal } from "./motion";

const QUESTIONS = [
  {
    q: "Le programme ralentit-il le comptoir ?",
    a: "Non. Le client photographie son ticket après avoir payé, sur place ou une fois assis. La caisse et le service ne changent pas d'un pouce, et l'équipe n'a rien à manipuler.",
  },
  {
    q: "Les clients peuvent-ils dépenser leurs points ailleurs ?",
    a: "Non. Les points cumulés dans un établissement n'y sont valables que là. Boosteats ne mutualise pas les clients entre établissements — personne ne finance la fidélité du restaurant d'en face.",
  },
  {
    q: "Faut-il valider des tickets tous les jours ?",
    a: "Non. La lecture des tickets est automatique. Seuls les cas ambigus remontent, et ils se valident tout seuls après un délai sans intervention. Le programme ne se bloque jamais, même pendant deux semaines d'absence.",
  },
  {
    q: "Faut-il communiquer ses prix d'achat ?",
    a: "Non, ils sont optionnels. Le programme démarre avec des marges estimées. Une fois les prix de revient renseignés, les cadeaux se calibrent au centime près sur les coûts réels — un gain de précision, pas une condition d'accès. Ces données ne sont visibles que par l'établissement.",
  },
  {
    q: "Et en cas d'arrêt ?",
    a: "Aucun engagement, aucune durée minimum. La base client complète est récupérable en export, et l'arrêt est possible à tout moment.",
  },
];

export function FaqSection() {
  return (
    <section id="questions" className="max-w-[1200px] mx-auto px-5 sm:px-8 py-20 sm:py-24 scroll-mt-16">
      <Reveal>
        <p className="font-mono text-[11px] tracking-[0.12em] uppercase text-moss-dark mb-3.5">▶ Objections</p>
        <h2 className="font-display text-[34px] sm:text-[44px] lg:text-[54px] leading-[1.2] tracking-[-0.02em] font-bold text-ink max-w-[640px] text-pretty">
          Les questions à se poser avant de signer.
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
