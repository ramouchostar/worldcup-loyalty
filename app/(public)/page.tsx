import { RestaurateursLanding } from "@/components/restaurateurs/RestaurateursLanding";
import { SITE_ORIGIN } from "@/lib/site";

// Landing publique dédiée aux restaurateurs prospects — distincte du
// formulaire d'inscription (/become-a-partner). Rôle : convaincre avant de
// faire remplir un formulaire.
//
// Devenue la racine du domaine (2026-08-08, ex /restaurateurs) : boosteats.be
// s'adresse en priorité aux restaurateurs prospects. La landing membre/client
// a déménagé vers /membres (voir app/(public)/membres/page.tsx) — /restaurateurs
// redirige ici en 308 (next.config.mjs) pour ne pas casser les liens existants.
//
// Redesign m55 (2026-08-08), refondu le 2026-09-26 sur le modèle
// d'owner.com : peu de texte, un iPhone qui montre le produit. Depuis le
// 2026-11-05 (Brigade 17), la page présente la brigade (ADR 0089).
// - Refonte de copie 2026-08-29, offre repositionnée 2026-09-29 (ADR 0074 :
//   outil marketing, pas d'exploitation) : Gratuit (≤ 500 tickets/mois),
//   Croissance 150 €/mois (2026-11-01), Pro 500 €/mois (copilote, Google, site de commande
//   d'un partenaire), 3 mois minimum — voir PlansSection.tsx. Les fonctions
//   payantes ne sont pas encore livrées : présentées en « places pilotes ».
// - ADR 0007 ne s'applique pas ici (page B2B, pas client) — euros et
//   mécanique de marge peuvent être mentionnés explicitement. Les chiffres
//   affichés dans les mockups produit sont des données d'illustration
//   figées (établissement fictif "Belchicken"), pas des métriques réelles.
// - Page entièrement statique (pas de fetch serveur) : la preuve sociale du
//   Hero est un cas nommé (Belchicken, Uccle), pas un compteur réseau —
//   à vérifier/mettre à jour au fil de la croissance réelle du réseau.

export const revalidate = 300;

// Titre et description (2026-11-01, docs/strategie/seo-et-pages.md) : les mots
// que tapent les restaurateurs, et seulement des fonctions livrées.
const TITLE = "Programme de fidélité et pub pour restaurants";
const DESCRIPTION =
  "Faites revenir vos clients et faites venir le quartier. Rien à brancher : le ticket de caisse suffit. Analyse gratuite de votre restaurant en une minute.";

// L'aperçu de partage (WhatsApp, LinkedIn) reprenait sinon celui du layout
// racine, écrit pour les membres (« Rejoins ton équipe… ») : la landing
// prospects a le sien, en impersonnel (CONTEXT.md, registre de la landing).
export const metadata = {
  title: { absolute: `${TITLE} — Boosteats` },
  description: DESCRIPTION,
  alternates: { canonical: "/" },
  // `images` est redonné : un openGraph de page remplace celui du layout, image comprise.
  openGraph: { title: `Boosteats — ${TITLE}`, description: DESCRIPTION, url: SITE_ORIGIN, siteName: "Boosteats", locale: "fr_BE", type: "website", images: ["/opengraph-image"] },
  twitter: { card: "summary_large_image", title: `Boosteats — ${TITLE}`, description: DESCRIPTION, images: ["/opengraph-image"] },
};

// Données structurées (schema.org) : qui nous sommes et ce qu'on vend, prix
// HTVA par établissement (Croissance 150 € depuis le 2026-11-01). Aucune note
// ni avis inventé : on n'en ajoute qu'avec de vrais avis publiés.
const STRUCTURED_DATA = {
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "Organization",
      "@id": `${SITE_ORIGIN}/#organisation`,
      name: "Boosteats",
      url: SITE_ORIGIN,
      logo: `${SITE_ORIGIN}/icons/icon-boosteats.png`,
      areaServed: { "@type": "City", name: "Bruxelles" },
    },
    {
      "@type": "SoftwareApplication",
      name: "Boosteats",
      url: SITE_ORIGIN,
      applicationCategory: "BusinessApplication",
      operatingSystem: "Web",
      inLanguage: "fr-BE",
      description: DESCRIPTION,
      publisher: { "@id": `${SITE_ORIGIN}/#organisation` },
      offers: [
        { "@type": "Offer", name: "Gratuit", price: "0", priceCurrency: "EUR" },
        { "@type": "Offer", name: "Croissance", price: "150", priceCurrency: "EUR", description: "Par mois et par établissement, HTVA, sans engagement" },
        { "@type": "Offer", name: "Pro", price: "500", priceCurrency: "EUR", description: "Par mois et par établissement, HTVA, 3 mois minimum" },
      ],
    },
  ],
};

export default function RestaurateursLandingPage() {
  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(STRUCTURED_DATA) }} />
      <RestaurateursLanding />
    </>
  );
}
