"use client";

import { Reveal } from "./motion";

const QUESTIONS = [
  {
    q: "Est-ce que ça ralentit mon comptoir ?",
    a: "Non. Ton client photographie son ticket après avoir payé, sur place ou une fois assis. Ta caisse et ton service ne changent pas d'un pouce, et ton équipe n'a rien à manipuler.",
  },
  {
    q: "Mes clients peuvent-ils dépenser leurs points ailleurs ?",
    a: "Non. Les points qu'un client cumule chez toi sont valables uniquement chez toi. Boosteats ne mutualise pas les clients entre établissements — tu ne finances jamais la fidélité du resto d'en face.",
  },
  {
    q: "Dois-je valider des tickets tous les jours ?",
    a: "Non. La lecture des tickets est automatique. Seuls les cas ambigus remontent, et ils se valident tout seuls après un délai si tu n'y touches pas. Le programme ne se bloque jamais, même si tu pars deux semaines.",
  },
  {
    q: "Dois-je vous donner mes prix d'achat ?",
    a: "Non, ils sont optionnels. Le programme démarre avec des marges estimées. Si tu nous donnes tes prix de revient, les cadeaux se calibrent au centime près sur tes vrais coûts — c'est un gain de précision, pas une condition d'accès. Ces données ne sont visibles que par toi.",
  },
  {
    q: "Comment vous gagnez de l'argent ?",
    a: "Par abonnement sur les plans payants, plus 5 % sur les commandes passées sur ton site en plan Croissance. Jamais rien sur tes ventes au comptoir, aucune marge prise sur tes produits, et nous ne revendons aucune donnée. En plan Pro : zéro commission. Le plan gratuit est financé par les plans payants.",
  },
  {
    q: "Je suis déjà sur Uber Eats ou Deliveroo. Je dois partir ?",
    a: "Non. Garde-les pour la livraison et pour les nouveaux clients qu'ils t'amènent. Ton site de commande sert à tes habitués : ceux qui te connaissent déjà n'ont aucune raison de te coûter un tiers de leur commande.",
  },
  {
    q: "Le référencement, c'est quoi concrètement ?",
    a: "C'est ta place quand quelqu'un cherche sur Google ou Google Maps : « snack près de moi », « poulet frit Kraainem ». On améliore ton site et ta fiche Google, on t'aide à récolter des avis, et chaque mois tu vois ta place. Si elle ne bouge pas, on te dit pourquoi.",
  },
  {
    q: "Et si je dépasse 500 tickets par mois en Gratuit ?",
    a: "Tes clients ne voient rien : leurs tickets passent toujours. On te prévient, et si ça se répète deux mois de suite, on te propose le plan Croissance. C'est plutôt une bonne nouvelle : ton programme marche.",
  },
  {
    q: "Et si j'arrête ?",
    a: "Gratuit et Croissance : aucun engagement, tu arrêtes quand tu veux. Pro : 3 mois minimum, le temps que le référencement porte ses fruits, puis au mois. Dans tous les cas, tu récupères ta liste de clients en export, et ton nom de domaine reste à toi.",
  },
];

export function FaqSection() {
  return (
    <section id="questions" className="max-w-[1200px] mx-auto px-5 sm:px-8 py-20 sm:py-24 scroll-mt-16">
      <Reveal>
        <p className="font-mono text-[11px] tracking-[0.12em] uppercase text-moss-dark mb-3.5">▶ Objections</p>
        <h2 className="font-display text-[34px] sm:text-[44px] lg:text-[54px] leading-[1.2] tracking-[-0.02em] font-bold text-ink max-w-[640px] text-pretty">
          Ce que tu veux savoir avant de signer.
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
