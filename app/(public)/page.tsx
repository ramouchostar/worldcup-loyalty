import { createAdminClient } from "@/lib/supabase";
import { listLiveRestaurantIds } from "@/lib/demo";
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
// dynamique au scroll (cf. motion.tsx). Le contenu suit fidèlement la
// maquette — mêmes règles de conformité que l'ancienne version :
// - Aucun prix inventé : ADR 0029 acte le modèle (Gratuit/Croissance/Pro)
//   mais les montants et la mise en œuvre ne sont "pas encore implémentés" —
//   cette page ne vend donc que ce qui existe réellement aujourd'hui (le
//   plan Gratuit) et présente les plans payants comme une feuille de route,
//   jamais avec un chiffre.
// - ADR 0007 ne s'applique pas ici (page B2B, pas client) — euros et
//   mécanique de marge peuvent être mentionnés explicitement. Les chiffres
//   affichés dans les mockups produit sont des données d'illustration
//   figées (établissement fictif "Belchicken"), pas des métriques réelles.

export const revalidate = 300;

export const metadata = {
  title: "Fidélité qui protège ta marge, gratuite à vie",
  description:
    "Un programme de fidélité qui ne peut jamais coûter plus qu'il ne rapporte — cadeaux calculés sur ta marge, parrainage, tableau de bord. Gratuit à vie, 0% de commission.",
};

export default async function RestaurateursLandingPage() {
  // Preuve sociale best-effort : une landing publique ne doit jamais faire
  // échouer le build (prérendu + revalidate 300) à cause d'une env/DB
  // indisponible. Env Supabase absente ou requête en échec → on retombe sur
  // l'état "le réseau démarre" au lieu de casser le déploiement (incident
  // constaté sur PR #32 : Preview Vercel sans variables Supabase).
  // ADR 0033 §1 — la preuve sociale ne compte QUE le réseau réel : annoncer
  // des établissements de démonstration à un prospect serait un mensonge
  // commercial, et les adhésions fictives qui vont avec aussi.
  let restaurantCount = 0;
  let memberCount = 0;
  try {
    const admin = createAdminClient();
    const liveIds = await listLiveRestaurantIds(admin);
    restaurantCount = liveIds.length;
    if (liveIds.length > 0) {
      const { count } = await admin
        .from("memberships")
        .select("user_id", { count: "exact", head: true })
        .in("restaurant_id", liveIds);
      memberCount = count ?? 0;
    }
  } catch {
    // best-effort : compteurs à 0, la page rend quand même
  }

  return (
    <RestaurateursLanding
      hasNetwork={restaurantCount > 0}
      restaurantCount={restaurantCount}
      memberCount={memberCount}
    />
  );
}
