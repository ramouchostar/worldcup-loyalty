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
// Redesign m55 (2026-08-08) : remplace l'ancienne page par le design Claude
// "Landing Restaurateurs" (import via claude_design MCP), reconstruit en
// composants React sous components/restaurateurs/ avec mise en scène
// dynamique au scroll (cf. motion.tsx).
// - Refonte de copie 2026-08-29 : les plans Croissance (199€/mois) et Pro
//   (500€/mois) affichent désormais un vrai tarif par établissement, ancré
//   sur un seuil de rentabilité (voir PlansSection.tsx) — ÉCART ASSUMÉ avec
//   le statut "montants pas encore implémentés" d'ADR 0029 initial, à faire
//   acter par un ADR dédié (/new-adr) tant que ce n'est pas encore fait.
// - ADR 0007 ne s'applique pas ici (page B2B, pas client) — euros et
//   mécanique de marge peuvent être mentionnés explicitement. Les chiffres
//   affichés dans les mockups produit sont des données d'illustration
//   figées (établissement fictif "Belchicken"), pas des métriques réelles.
// - Page entièrement statique (pas de fetch serveur) : la preuve sociale du
//   Hero est un cas nommé (Belchicken, Uccle), pas un compteur réseau —
//   à vérifier/mettre à jour au fil de la croissance réelle du réseau.

export const revalidate = 300;

export const metadata = {
  title: "Fidélité qui protège ta marge, gratuite à vie",
  description:
    "Un programme de fidélité qui ne peut jamais coûter plus qu'il ne rapporte — cadeaux calculés sur ta marge, parrainage, tableau de bord. Gratuit à vie, 0% de commission.",
};

export default function RestaurateursLandingPage() {
  return <RestaurateursLanding />;
}
