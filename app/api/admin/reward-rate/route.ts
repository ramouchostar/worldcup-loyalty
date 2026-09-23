import { NextResponse, type NextRequest } from "next/server";
import { requireEstablishmentManager } from "@/lib/admin-guard";
import { createAdminClient } from "@/lib/supabase";
import { isValidRate } from "@/lib/reward-rate";

// ADR 0068 — le restaurateur choisit son taux cadeaux (4 à 12 %). Réservé au
// gérant/manager, comme les seuils et les réglages : c'est une décision
// d'argent. Le taux ET l'ajustement des soldes des clients sont appliqués
// dans la même transaction SQL (`set_reward_pct`, migration 20260923-1200) —
// jamais un taux changé sans que les soldes suivent.
//
// PUT /api/admin/reward-rate — { restaurantId, pct }
export async function PUT(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const restaurantId = typeof body?.restaurantId === "string" ? body.restaurantId : "";
  const pct = Number(body?.pct);
  if (!restaurantId || !isValidRate(pct)) {
    return NextResponse.json({ error: "Taux invalide : entre 4 % et 12 %." }, { status: 400 });
  }

  const guard = await requireEstablishmentManager(restaurantId);
  if (!guard.ok) return guard.response;

  const { data, error } = await createAdminClient().rpc("set_reward_pct", {
    p_restaurant_id: restaurantId,
    p_pct: pct,
    p_actor: guard.userId,
  });

  if (error) {
    if (error.message.includes("rate_out_of_range")) {
      return NextResponse.json({ error: "Taux invalide : entre 4 % et 12 %." }, { status: 400 });
    }
    // Migration pas encore appliquée : on le dit, plutôt qu'un échec muet.
    console.error("[reward-rate] set_reward_pct:", error.message);
    return NextResponse.json({ error: "Enregistrement impossible pour le moment." }, { status: 500 });
  }

  const row = (Array.isArray(data) ? data[0] : data) as
    | { old_pct: number; new_pct: number; members_adjusted: number; points_adjusted: number }
    | null;
  return NextResponse.json({
    oldPct: Number(row?.old_pct ?? 0),
    newPct: Number(row?.new_pct ?? pct),
    membersAdjusted: Number(row?.members_adjusted ?? 0),
    pointsAdjusted: Number(row?.points_adjusted ?? 0),
  });
}
