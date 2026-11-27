// ADR 0112 — le plat montré avec un article automatique : un plat proposé à la commande aujourd'hui, pris parmi les
// repas (jamais une boisson, un dessert, une sauce ou un accompagnement seul), avec photo de préférence. Le choix
// change d'un jour à l'autre, sans hasard. PUR, testé. Son nom et son prix sont lus sur la carte à l'affichage.

import { classifyArticle, type Family } from "../../menu-options/families";
import type { PublicMenu } from "../../site-orders/menu";

const NOT_A_MEAL: ReadonlySet<Family> = new Set(["boisson", "dessert", "sauce", "accompagnement", "promo"]);

export function pickDish(menu: Pick<PublicMenu, "categories">, day: string): string | null {
  const meals = menu.categories.flatMap((c) =>
    c.items.filter((i) => !NOT_A_MEAL.has(classifyArticle({ name: i.name, category: c.name }))),
  );
  const withPhoto = meals.filter((i) => i.imageUrl !== null);
  const pool = withPhoto.length > 0 ? withPhoto : meals;
  if (pool.length === 0) return null; // pas de repas reconnu : l'article part sans plat
  const n = Math.floor(Date.parse(`${day}T00:00:00Z`) / 86_400_000);
  return pool[n % pool.length].id;
}
