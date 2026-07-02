import { NextResponse, type NextRequest } from "next/server";
import { requireAdmin } from "@/lib/admin-guard";
import { createAdminClient } from "@/lib/supabase";

type ProfileRow = { id: string; display_name: string; email: string };

export async function GET(request: NextRequest) {
  const restaurantId = request.nextUrl.searchParams.get("restaurantId");
  if (!restaurantId) return NextResponse.json({ error: "restaurantId requis." }, { status: 400 });

  const guard = await requireAdmin(restaurantId);
  if (!guard.ok) return guard.response;

  const admin = createAdminClient();

  const { data: referrals, error } = await admin
    .from("referrals")
    .select("id, referrer_id, referee_id, referred_at")
    .eq("restaurant_id", restaurantId)
    .order("referred_at", { ascending: false });

  if (error) return NextResponse.json({ error: "Erreur serveur." }, { status: 500 });

  const list = referrals ?? [];

  const allIds = list.map((r) => r.referrer_id).concat(list.map((r) => r.referee_id));
  const userIds = allIds.filter((id, i) => allIds.indexOf(id) === i);

  const profileMap: Record<string, { display_name: string; email: string }> = {};
  if (userIds.length > 0) {
    const { data: profiles } = await admin
      .from("profiles")
      .select("id, display_name, email")
      .in("id", userIds);
    for (const p of (profiles ?? []) as ProfileRow[]) {
      profileMap[p.id] = { display_name: p.display_name, email: p.email };
    }
  }

  return NextResponse.json(
    list.map((r) => ({
      id: r.id,
      referred_at: r.referred_at,
      referrer_id: r.referrer_id,
      referrer: profileMap[r.referrer_id] ?? null,
      referee: profileMap[r.referee_id] ?? null,
    }))
  );
}
