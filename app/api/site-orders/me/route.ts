import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient, createServerSupabaseClient } from "@/lib/supabase";
import { siteOrdersAvailable } from "@/lib/site-orders/access";
import { accountFirstName } from "@/lib/site-orders/account";

// ADR 0108 §2 — « suis-je connecté, et quel prénom proposer ? » pour la page de commande. FERMÉE comme le reste (404 sans le
// drapeau ET le forfait). Ne rend QUE le prénom du compte (jamais l'adresse e-mail, ni le nom de famille, ni l'identifiant) :
// la page s'en sert pour préremplir « Ton prénom » et savoir si la connexion sera demandée à l'envoi.
//
// GET /api/site-orders/me?restaurantId=…  →  { signedIn: boolean, firstName: string }

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const restaurantId = req.nextUrl.searchParams.get("restaurantId") ?? "";
  if (!restaurantId || !(await siteOrdersAvailable(restaurantId))) return NextResponse.json({ error: "Introuvable." }, { status: 404 });

  const headers = { "cache-control": "no-store" };
  try {
    const supabase = await createServerSupabaseClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ signedIn: false, firstName: "" }, { headers });
    const { data } = await createAdminClient().from("profiles").select("display_name").eq("id", user.id).maybeSingle();
    return NextResponse.json({ signedIn: true, firstName: accountFirstName((data as { display_name?: string } | null)?.display_name) }, { headers });
  } catch {
    // Une panne ne bloque pas la page : on dit « pas connecté », et le serveur redemandera la connexion à l'envoi s'il le faut.
    return NextResponse.json({ signedIn: false, firstName: "" }, { headers });
  }
}
