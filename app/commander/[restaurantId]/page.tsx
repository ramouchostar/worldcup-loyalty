import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { OrderApp } from "@/components/commander/OrderApp";
import { getRestaurantBranding } from "@/lib/restaurant";
import { siteOrdersAvailable } from "@/lib/site-orders/access";
import { commanderStyle } from "@/lib/site-orders/theme";

// ADR 0099 §2 et §8 — la page de commande d'un restaurant (module de Nina : forfait Pro, en pilote). PUBLIQUE (pas de
// compte), mais FERMÉE : sans le drapeau SITE_ORDER_RESTAURANTS ET un forfait Pro actif, la page n'existe pas (404). Pas
// d'indexation : tant que c'est un pilote, on ne la montre pas à Google.
//
// ADR 0108 §4 — l'espace est à l'image du restaurant : ses couleurs et sa police sont posées ici, côté serveur.

export const metadata: Metadata = {
  title: "Commander",
  robots: { index: false, follow: false },
};

export default async function CommanderPage({ params }: { params: Promise<{ restaurantId: string }> }) {
  const { restaurantId } = await params;
  if (!(await siteOrdersAvailable(restaurantId))) notFound();
  const branding = await getRestaurantBranding(restaurantId);
  return (
    <div data-app="commander" className="min-h-screen bg-white font-brand" style={commanderStyle(branding)}>
      <OrderApp restaurantId={restaurantId} />
    </div>
  );
}
