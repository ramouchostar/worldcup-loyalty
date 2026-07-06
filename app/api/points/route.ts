import { NextResponse, type NextRequest } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase";
import { getPointsBalance } from "@/lib/points";

// GET /api/points?restaurantId=... — solde « Ma réserve » + mouvements du
// membre (ADR 0021). Deltas en points uniquement, jamais d'euros ni de
// coûts (ADR 0007) — les mouvements sont lus via RLS own-read.
export async function GET(request: NextRequest) {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Non authentifié." }, { status: 401 });

  const restaurantId = request.nextUrl.searchParams.get("restaurantId");
  if (!restaurantId) return NextResponse.json({ error: "restaurantId requis." }, { status: 400 });

  const [balance, { data: transactions, error }] = await Promise.all([
    getPointsBalance(user.id, restaurantId),
    supabase
      .from("point_transactions")
      .select("id, delta, reason, created_at")
      .eq("user_id", user.id)
      .eq("restaurant_id", restaurantId)
      .order("created_at", { ascending: false })
      .limit(50),
  ]);

  if (error) return NextResponse.json({ error: "Erreur serveur." }, { status: 500 });
  return NextResponse.json({ balance, transactions: transactions ?? [] });
}
