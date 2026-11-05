"use client";

import { TrackedLink } from "@/components/analytics/TrackedLink";
import { whatsappUrl } from "@/lib/contact";

// Questions (Brigade 17, maquette du 2026-11-04) : celles de la maquette, plus
// celles de l'ancienne FAQ qui restent vraies (caisse, avis, 500 tickets,
// arrêt, points). Nina et Max en pilote, Louis avec l'équipe (ADR 0070).

const QUESTIONS = [
  {
    q: "Qu'y a-t-il dans Boosteats ?",
    a: "Une brigade de sept assistants marketing. Léa inscrit les clients et gère les cadeaux, Hugo les relance, Chloé suit les chiffres, Emma lance et gère les publicités en ligne, Louis répond aux avis Google. Nina (le site) et Max (Google) sont en pilote dans le forfait Pro. Le nombre d'assistants dépend du forfait.",
  },
  {
    q: "Combien de temps cela prend-il vraiment ?",
    a: "Cinq à dix minutes par jour. La brigade prépare ses idées, trois au plus, et le gérant répond Oui, Non ou Plus tard depuis son téléphone. Rien ne part et aucun euro n'est dépensé sans son accord.",
  },
  {
    q: "Et si une idée ne convient pas ?",
    a: "On répond Non et on choisit pourquoi : pas le moment, trop cher, déjà fait… La brigade s'en souvient et ne repropose pas la même idée avant un moment.",
  },
  {
    q: "J'ai déjà un site internet. Faut-il en changer ?",
    a: "Non. Les messages d'Hugo et la pub d'Emma peuvent mener au site actuel. Le site de Nina, en pilote dans le forfait Pro, est pensé pour Google et fait depuis la carte de l'établissement ; son bouton « Commander » mène au site de commande existant.",
  },
  {
    q: "Quelles commissions ?",
    a: "Aucune commission sur les commandes. Seul l'abonnement se paie (0 €, 150 € ou 500 € HTVA par mois). La pub a des frais de service, calculés sur le budget choisi : 20 % en Gratuit, 15 % en Croissance, 5 % en Pro.",
  },
  {
    q: "Faut-il arrêter Uber Eats et Deliveroo ?",
    a: "Non. Ils amènent des clients. Le but est que ces clients reviennent ensuite au comptoir ou commandent en direct, sans commission de plateforme.",
  },
  {
    q: "Les clients doivent-ils installer une appli ?",
    a: "Non. Ils prennent leur ticket de caisse en photo avec leur téléphone, depuis une page web. Rien à installer, ni pour eux ni pour l'établissement.",
  },
  {
    q: "Faut-il changer de caisse ?",
    a: "Non. Rien ne s'installe sur la caisse et rien n'y est écrit : le client photographie le ticket qu'elle a imprimé. Le programme démarre en un jour, avec le QR code et les affiches.",
  },
  {
    q: "Combien vont coûter les cadeaux ?",
    a: "Ce que l'établissement décide : un taux entre 4 et 12 %, et chaque cadeau est calculé sur ce qu'il coûte vraiment. Le total ne dépasse jamais une limite mensuelle.",
  },
  {
    q: "Les avis sont-ils récompensés ?",
    a: "Jamais. Google interdit toute contrepartie à un avis et peut sanctionner la fiche. En Croissance et en Pro, Louis et l'équipe répondent aux avis, sans jamais en acheter.",
  },
  {
    q: "Et au-delà de 500 tickets par mois ?",
    a: "Les clients ne voient aucune différence. Si cela dure deux mois, le forfait Croissance est proposé.",
  },
  {
    q: "Y a-t-il un engagement ?",
    a: "Le Gratuit l'est pour toujours, sans carte bancaire. Croissance est sans engagement. Pro demande 3 mois au départ, puis se paie au mois. On change de forfait quand on veut, et la liste de clients reste la propriété de l'établissement.",
  },
];

export function FaqSection() {
  return (
    <section id="questions" className="max-w-[1200px] mx-auto px-5 sm:px-8 py-16 sm:py-24 scroll-mt-16">
      <>
        <p className="bx-kicker mb-4">Questions</p>
        <h2 className="text-[32px] sm:text-[44px] leading-[1.1] tracking-[-0.025em] font-semibold text-ink max-w-[640px] text-balance m-0">
          Vos questions.
        </h2>
        <p className="text-[17px] text-ink-muted mt-4 mb-0">
          Une autre question ?{" "}
          <TrackedLink
            ctaId="whatsapp"
            ctaLocation="faq"
            audience="restaurateur"
            href={whatsappUrl()}
            className="font-semibold text-boost-olive-dark underline decoration-transparent underline-offset-[3px] hover:decoration-current transition-colors"
          >
            Écrivez-nous sur WhatsApp
          </TrackedLink>
          , on répond vite.
        </p>
      </>

      <div className="grid sm:grid-cols-2 gap-x-12 mt-12">
        {QUESTIONS.map((item) => (
          <div key={item.q}>
            <div className="border-t border-paper-border py-6 h-full">
              <h3 className="text-[17px] font-semibold text-ink m-0 mb-2">{item.q}</h3>
              <p className="text-[15px] leading-relaxed text-ink-muted m-0">{item.a}</p>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
