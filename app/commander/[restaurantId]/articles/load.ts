// ADR 0111 §1 — la porte des pages d'articles : les MÊMES que la commande (drapeau SITE_ORDER_RESTAURANTS ET forfait
// Pro actif, établissement actif), sinon 404. Lecture sans compte. Serveur uniquement.

import { cache } from "react";
import { notFound } from "next/navigation";
import { restaurantName } from "@/lib/restaurant-posts/db";
import { siteOrdersAvailable } from "@/lib/site-orders/access";
import { readPublicMenu } from "@/lib/site-orders/menu-db";

export const openArticles = cache(async (restaurantId: string) => {
  if (!(await siteOrdersAvailable(restaurantId))) notFound();
  const name = await restaurantName(restaurantId);
  if (name === null) notFound();
  return { name };
});

/** La carte d'aujourd'hui. `null` si elle ne se lit pas : les blocs « plat » se cachent, l'article reste lisible. */
export const todaysMenu = cache(async (restaurantId: string) => {
  try {
    return await readPublicMenu(restaurantId);
  } catch (e) {
    console.error("[blog] carte illisible :", (e as Error).message);
    return null;
  }
});
