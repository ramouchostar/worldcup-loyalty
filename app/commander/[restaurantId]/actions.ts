"use server";

import { cookies } from "next/headers";
import { siteOrdersAvailable } from "@/lib/site-orders/access";
import { PENDING_SITE_ORDER_COOKIE } from "@/lib/site-orders/account";

// ADR 0108 §2 — un client a rempli son panier et part se connecter (Google, inscription ou connexion) pour l'envoyer. Ces
// cookies le ramènent à `/commander/<établissement>` au lieu de la page de l'établissement : même mécanique que le ticket
// photographié en visiteur (ADR 0040), lue par `login`, `register` et `auth/callback` (lib/site-orders/account.ts).
// Le panier, lui, attend dans le navigateur (components/commander/OrderApp.tsx) : ce cookie ne porte que « d'où il vient ».
// Fermé comme le reste : sans le drapeau ET le forfait, rien n'est posé.
export async function rememberPendingSiteOrder(restaurantId: string) {
  if (!restaurantId || !(await siteOrdersAvailable(restaurantId))) return;
  const cookieStore = await cookies();
  const opts = {
    httpOnly: true,
    maxAge: 2 * 60 * 60, // une connexion prend des minutes, pas des jours : un panier vieux de deux heures n'est plus celui du client
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production",
    path: "/",
  };
  cookieStore.set("pending_restaurant_id", restaurantId, opts);
  cookieStore.set(PENDING_SITE_ORDER_COOKIE, "1", opts);
  // Un ticket photographié plus tôt ne doit pas l'emporter sur la commande que le client vient de commencer.
  cookieStore.set("pending_ticket", "", { maxAge: 0, path: "/" });
}
