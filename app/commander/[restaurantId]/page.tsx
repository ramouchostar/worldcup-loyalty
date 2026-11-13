import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { OrderApp } from "@/components/commander/OrderApp";
import { siteOrdersAvailable } from "@/lib/site-orders/access";

// ADR 0099 §2 et §8 — la page de commande d'un restaurant (module de Nina : forfait Pro, en pilote). PUBLIQUE (pas de
// compte), mais FERMÉE : sans le drapeau SITE_ORDER_RESTAURANTS ET un forfait Pro actif, la page n'existe pas (404). Pas
// d'indexation : tant que c'est un pilote, on ne la montre pas à Google.
//
// Volontairement hors du futur site de Nina (Brigade 15, `<établissement>.boosteats.be`, ADR 0088) : cette page sera
// montée depuis son bouton « Commander » sans changer de contenu.

export const metadata: Metadata = {
  title: "Commander",
  robots: { index: false, follow: false },
};

export default async function CommanderPage({ params }: { params: Promise<{ restaurantId: string }> }) {
  const { restaurantId } = await params;
  if (!(await siteOrdersAvailable(restaurantId))) notFound();
  return <OrderApp restaurantId={restaurantId} />;
}
