import { NextResponse, type NextRequest } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase";
import { recordAppOpen, APP_PLATFORMS, type AppPlatform } from "@/lib/app-install";
import { recordFunnelStep } from "@/lib/funnel";

// POST /api/me/app-install — balise envoyée par le client quand l'app tourne
// en mode installé (complément ADR 0038). Authentifié ; best-effort : une
// table absente ne renvoie jamais d'erreur au client (fail-open).
export async function POST(request: NextRequest) {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Non authentifié." }, { status: 401 });

  const body = (await request.json().catch(() => null)) ?? {};
  const platform: AppPlatform = APP_PLATFORMS.includes(body.platform) ? body.platform : "other";
  const ua = request.headers.get("user-agent");

  const recorded = await recordAppOpen(user.id, platform, ua);

  // Entonnoir (ADR 0037) — étage « App installée ». Compté ici parce que
  // c'est ici que le fait est constaté, et sous session authentifiée : cet
  // étage n'a donc pas à passer par la liste close de `/api/funnel`. Déjà
  // dédoublonné une fois par session d'onglet côté balise.
  if (typeof body.restaurantId === "string" && body.restaurantId) {
    await recordFunnelStep(body.restaurantId, "install_completed");
  }

  return NextResponse.json({ ok: true, recorded });
}
