"use server";

import { cookies } from "next/headers";

// ADR 0040 — un visiteur a photographié son ticket et part se connecter
// (OAuth, signup ou login). Ces cookies font revenir la session directement
// sur l'écran de scan (`?resume=1`) au lieu de la vitrine — même mécanique
// que `pending_restaurant_id` (déjà lue par login/register/callback).
export async function rememberPendingTicket(restaurantId: string) {
  const cookieStore = await cookies();
  const opts = {
    httpOnly: true,
    maxAge: 60 * 30, // aligné sur l'expiration de la photo (lib/pending-ticket)
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production",
    path: "/",
  };
  cookieStore.set("pending_restaurant_id", restaurantId, opts);
  cookieStore.set("pending_ticket", "1", opts);
}
