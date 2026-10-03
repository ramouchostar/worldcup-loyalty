import { NextResponse, type NextRequest } from "next/server";
import { requireAdmin } from "@/lib/admin-guard";
import { createAdminClient } from "@/lib/supabase";

// ADR 0077 §2 — abonner (POST) ou désabonner (DELETE) ce téléphone aux
// alertes de la console d'un établissement. Accès console vérifié avant
// toute écriture ; la table est en service-role seulement.

type Body = { restaurantId?: unknown; endpoint?: unknown; keys?: { p256dh?: unknown; auth?: unknown } };

export async function POST(request: NextRequest) {
  const body = (await request.json().catch(() => null)) as Body | null;
  const restaurantId = typeof body?.restaurantId === "string" ? body.restaurantId : "";
  const endpoint = typeof body?.endpoint === "string" ? body.endpoint : "";
  const p256dh = typeof body?.keys?.p256dh === "string" ? body.keys.p256dh : "";
  const auth = typeof body?.keys?.auth === "string" ? body.keys.auth : "";
  if (!restaurantId || !endpoint.startsWith("https://") || !p256dh || !auth) {
    return NextResponse.json({ error: "Abonnement invalide." }, { status: 400 });
  }
  const guard = await requireAdmin(restaurantId);
  if (!guard.ok) return guard.response;

  const { error } = await createAdminClient()
    .from("console_push_subscriptions")
    .upsert({ user_id: guard.userId, restaurant_id: restaurantId, endpoint, p256dh, auth }, { onConflict: "user_id,restaurant_id,endpoint" });
  if (error) {
    console.error("[admin/push] abonnement:", error.message);
    return NextResponse.json({ error: "Activation impossible pour l'instant." }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}

export async function DELETE(request: NextRequest) {
  const body = (await request.json().catch(() => null)) as Body | null;
  const restaurantId = typeof body?.restaurantId === "string" ? body.restaurantId : "";
  const endpoint = typeof body?.endpoint === "string" ? body.endpoint : "";
  if (!restaurantId || !endpoint) return NextResponse.json({ error: "Paramètres invalides." }, { status: 400 });
  const guard = await requireAdmin(restaurantId);
  if (!guard.ok) return guard.response;
  await createAdminClient()
    .from("console_push_subscriptions")
    .delete()
    .eq("user_id", guard.userId)
    .eq("restaurant_id", restaurantId)
    .eq("endpoint", endpoint);
  return NextResponse.json({ ok: true });
}
