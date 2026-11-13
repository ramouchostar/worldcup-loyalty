import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase";
import { authorizeUrl, hubriseCredentials } from "@/lib/hubrise/api";
import { signState } from "@/lib/hubrise/model";
import { superAdminId } from "@/lib/hubrise/guard";

// ADR 0102 §1 — lance l'autorisation HubRise pour un établissement. Super-admin
// seulement pendant le pilote. Le `state` signé porte l'établissement et
// l'utilisateur : le retour ne fait confiance à rien d'autre.
export async function GET(request: Request) {
  const url = new URL(request.url);
  const userId = await superAdminId();
  if (!userId) return NextResponse.redirect(new URL("/login?next=/platform/ca", url.origin));

  const cred = hubriseCredentials();
  const r = url.searchParams.get("r") ?? "";
  const back = (erreur: string) => NextResponse.redirect(new URL(`/platform/ca?${new URLSearchParams({ r, erreur })}`, url.origin));
  if (!cred) return back("HubRise n'est pas configuré : HUBRISE_CLIENT_ID et HUBRISE_CLIENT_SECRET manquent dans Vercel.");

  const { data: restaurant } = await createAdminClient().from("restaurants").select("id, name").eq("id", r).maybeSingle();
  if (!restaurant) return back("Établissement inconnu.");

  const state = signState({ r: restaurant.id as string, u: userId, t: Date.now() }, cred.clientSecret);
  return NextResponse.redirect(
    authorizeUrl({
      clientId: cred.clientId,
      redirectUri: `${url.origin}/api/hubrise/callback`,
      state,
      locationName: restaurant.name as string,
    }),
  );
}
