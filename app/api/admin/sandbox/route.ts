import { NextResponse, type NextRequest } from "next/server";
import { requireAdmin } from "@/lib/admin-guard";
import { createAdminClient } from "@/lib/supabase";
import { getRestaurantId } from "@/lib/restaurant";

export async function POST(request: NextRequest) {
  const guard = await requireAdmin();
  if (!guard.ok) return guard.response;

  const body = await request.json();
  const { action } = body;
  const admin = createAdminClient();
  const restaurantId = getRestaurantId();
  const now = new Date().toISOString();

  // ── Commande test : créée + validée instantanément ───────────────────────
  if (action === "test_order") {
    const { user_id, amount } = body;
    if (!user_id || !amount || Number(amount) <= 0) {
      return NextResponse.json({ error: "user_id et amount requis." }, { status: 400 });
    }

    const { data: profile } = await admin
      .from("profiles")
      .select("team_id")
      .eq("id", user_id)
      .single();

    if (!profile?.team_id) {
      return NextResponse.json({ error: "Utilisateur sans équipe." }, { status: 400 });
    }

    const fakeKey = `SANDBOX-${Date.now()}`;
    const { data: order, error } = await admin
      .from("orders")
      .insert({
        user_id,
        team_id:       profile.team_id,
        restaurant_id: restaurantId,
        amount:        Number(amount),
        order_date:    now.split("T")[0],
        order_number:  fakeKey,
        duplicate_key: fakeKey,
        status:        "validated",
        validated_at:  now,
        submitted_at:  now,
        ocr_confidence: 100,
      })
      .select("id, amount, team_id")
      .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    // The pending_rewards DB trigger (m12) fires on INSERT with status=validated automatically.
    // But update_community_score only fires on UPDATE, so we increment total_spent manually.
    const { data: cs } = await admin
      .from("community_scores")
      .select("total_spent")
      .eq("team_id", order.team_id)
      .eq("restaurant_id", restaurantId)
      .single();

    if (cs) {
      await admin
        .from("community_scores")
        .update({
          total_spent:  Number(cs.total_spent) + Number(order.amount),
          last_updated: now,
        })
        .eq("team_id", order.team_id)
        .eq("restaurant_id", restaurantId);
    }

    return NextResponse.json({ ok: true, order_id: order.id, amount: order.amount });
  }

  // ── Modifier le score communautaire directement ───────────────────────────
  if (action === "set_score") {
    const { team_id, member_count, total_spent } = body;
    if (member_count == null || total_spent == null) {
      return NextResponse.json({ error: "member_count et total_spent requis." }, { status: 400 });
    }

    const query = admin
      .from("community_scores")
      .update({ member_count: Number(member_count), total_spent: Number(total_spent), last_updated: now })
      .eq("restaurant_id", restaurantId);

    const { error } = team_id ? await query.eq("team_id", team_id) : await query;
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    return NextResponse.json({
      ok: true,
      score: Number(member_count) * Number(total_spent),
    });
  }

  // ── Déclencher le cron notifications ─────────────────────────────────────
  if (action === "trigger_notifications") {
    const base = process.env.VERCEL_URL
      ? `https://${process.env.VERCEL_URL}`
      : "http://localhost:3000";
    const res = await fetch(`${base}/api/cron/notifications`, {
      headers: { Authorization: `Bearer ${process.env.CRON_SECRET ?? ""}` },
    });
    const data = await res.json();
    return NextResponse.json(data, { status: res.status });
  }

  // ── Déclencher le cron sync WC2026 ───────────────────────────────────────
  if (action === "trigger_sync") {
    const base = process.env.VERCEL_URL
      ? `https://${process.env.VERCEL_URL}`
      : "http://localhost:3000";
    const res = await fetch(`${base}/api/cron/sync-wc2026`, {
      headers: { Authorization: `Bearer ${process.env.CRON_SECRET ?? ""}` },
    });
    const data = await res.json();
    return NextResponse.json(data, { status: res.status });
  }

  // ── Reset scores à 0 ─────────────────────────────────────────────────────
  if (action === "reset_scores") {
    const { error } = await admin
      .from("community_scores")
      .update({ member_count: 0, total_spent: 0 })
      .eq("restaurant_id", restaurantId);

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ error: "Action inconnue." }, { status: 400 });
}

// ── Liste des membres + équipes (pour les sélecteurs de la sandbox) ──────────
export async function GET() {
  const guard = await requireAdmin();
  if (!guard.ok) return guard.response;

  const admin = createAdminClient();
  const restaurantId = getRestaurantId();

  const [membersResult, teamsResult] = await Promise.all([
    admin
      .from("profiles")
      .select("id, display_name, email, team_id, teams(name, flag_emoji)")
      .eq("restaurant_id", restaurantId)
      .not("team_id", "is", null)
      .order("display_name"),
    admin
      .from("community_scores")
      .select("team_id, member_count, total_spent, score, teams(name, flag_emoji)")
      .eq("restaurant_id", restaurantId)
      .order("score", { ascending: false }),
  ]);

  return NextResponse.json({
    members: membersResult.data ?? [],
    scores:  teamsResult.data ?? [],
  });
}
