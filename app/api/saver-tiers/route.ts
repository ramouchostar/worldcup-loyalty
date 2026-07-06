import { NextResponse, type NextRequest } from "next/server";
import { createServerSupabaseClient, createAdminClient } from "@/lib/supabase";

// GET /api/saver-tiers?restaurantId=... — paliers de la réserve (ADR 0021)
// pour la page « Ma réserve ». Surface membre : renvoie UNIQUEMENT id,
// seuil en points et nom de l'article — jamais cost_price/menu_price
// (ADR 0007).
export async function GET(request: NextRequest) {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Non authentifié." }, { status: 401 });

  const restaurantId = request.nextUrl.searchParams.get("restaurantId");
  if (!restaurantId) return NextResponse.json({ error: "restaurantId requis." }, { status: 400 });

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("reward_tiers")
    .select("id, min_threshold, menu_items(name, is_active, reward_eligible)")
    .eq("restaurant_id", restaurantId)
    .eq("layer", "saver")
    .eq("is_active", true)
    .order("min_threshold", { ascending: true });

  if (error) return NextResponse.json({ error: "Erreur serveur." }, { status: 500 });

  type Embed = { name: string; is_active: boolean; reward_eligible: boolean };
  const tiers = (data ?? [])
    .map((row) => {
      const mi = Array.isArray(row.menu_items) ? row.menu_items[0] : (row.menu_items as Embed | null);
      if (!mi || !mi.is_active || !mi.reward_eligible) return null;
      return {
        id: row.id as string,
        min_threshold: Number(row.min_threshold),
        item_name: mi.name,
      };
    })
    .filter((t): t is { id: string; min_threshold: number; item_name: string } => t !== null);

  return NextResponse.json(tiers);
}
