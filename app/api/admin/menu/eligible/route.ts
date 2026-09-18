import { NextResponse, type NextRequest } from "next/server";
import { requireAdmin } from "@/lib/admin-guard";
import { createAdminClient } from "@/lib/supabase";

// ADR 0061 — le restaurateur règle son catalogue de points : un article
// « cadeau possible » apparaît au catalogue (prix en points calculé), un
// article « hors cadeau » n'y apparaît pas. Même garde que la photo : l'article
// doit appartenir à l'établissement (ADR 0015 §7).
//
// PATCH /api/admin/menu/eligible — { restaurantId, menuItemId, rewardEligible }
export async function PATCH(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const restaurantId = typeof body?.restaurantId === "string" ? body.restaurantId : "";
  const menuItemId = typeof body?.menuItemId === "string" ? body.menuItemId : "";
  const rewardEligible = body?.rewardEligible;
  if (!restaurantId || !menuItemId || typeof rewardEligible !== "boolean") {
    return NextResponse.json({ error: "Requête invalide." }, { status: 400 });
  }

  const guard = await requireAdmin(restaurantId);
  if (!guard.ok) return guard.response;

  const { data, error } = await createAdminClient()
    .from("menu_items")
    .update({ reward_eligible: rewardEligible })
    .eq("id", menuItemId)
    .eq("restaurant_id", restaurantId)
    .select("id, reward_eligible")
    .maybeSingle();

  if (error) return NextResponse.json({ error: "Erreur serveur." }, { status: 500 });
  if (!data) return NextResponse.json({ error: "Article introuvable." }, { status: 404 });
  return NextResponse.json(data);
}
