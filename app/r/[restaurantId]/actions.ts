"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";

// QR code / lien direct vers un établissement (page publique /r/[restaurantId]).
// Un visiteur anonyme qui clique "Rejoindre gratuitement" doit atterrir sur CET
// établissement une fois connecté — pas sur /join (liste générique) ni sur son
// dernier établissement rejoint. Même mécanique que pending_join_code.
export async function redirectToLogin(restaurantId: string) {
  const cookieStore = await cookies();
  cookieStore.set("pending_restaurant_id", restaurantId, {
    httpOnly: true,
    maxAge: 60 * 15,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
  });
  redirect("/login");
}
