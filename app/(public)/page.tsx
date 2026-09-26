import { RestaurateursLanding } from "@/components/restaurateurs/RestaurateursLanding";

// Landing publique dédiée aux restaurateurs prospects — distincte du
// formulaire d'inscription (/become-a-partner). Rôle : convaincre avant de
// faire remplir un formulaire.
//
// Devenue la racine du domaine (2026-08-08, ex /restaurateurs) : boosteats.tech
// s'adresse en priorité aux restaurateurs prospects. La landing membre/client
// a déménagé vers /membres (voir app/(public)/membres/page.tsx) — /restaurateurs
// redirige ici en 308 (next.config.mjs) pour ne pas casser les liens existants.
//
// Redesign m55 (2026-08-08), refondu le 2026-09-26 sur le modèle
// d'owner.com : peu de texte, un iPhone qui montre chaque fonctionnalité
// (visite guidée au défilement, components/restaurateurs/FeatureTour.tsx).
// - Refonte de copie 2026-08-29, offre clarifiée 2026-09-26 (ADR 0070) :
//   Gratuit (≤ 500 tickets/mois), Croissance 299 €/mois + 5 % des commandes
//   passées sur le site de commande, Pro 500 €/mois sans commission (3 mois
//   minimum) — voir PlansSection.tsx. Site de commande et référencement ne
//   sont pas encore livrés : présentés en « places pilotes ».
// - ADR 0007 ne s'applique pas ici (page B2B, pas client) — euros et
//   mécanique de marge peuvent être mentionnés explicitement. Les chiffres
//   affichés dans les mockups produit sont des données d'illustration
//   figées (établissement fictif "Belchicken"), pas des métriques réelles.
// - Page entièrement statique (pas de fetch serveur) : la preuve sociale du
//   Hero est un cas nommé (Belchicken, Uccle), pas un compteur réseau —
//   à vérifier/mettre à jour au fil de la croissance réelle du réseau.

export const revalidate = 300;

export const metadata = {
  title: "Fidélité, commande en ligne et Google pour ton restaurant",
  description:
    "Fais revenir tes clients avec une fidélité gratuite à vie, vends en direct sur ton propre site sans laisser 30 % à une plateforme, et sois trouvé sur Google. Tu vois chaque mois ce que ça t'a rapporté.",
};

export default function RestaurateursLandingPage() {
  return <RestaurateursLanding />;
}
