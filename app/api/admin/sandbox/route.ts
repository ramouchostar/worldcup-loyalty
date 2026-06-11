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

  // ── Déclencher un cron (notifications ou sync) ───────────────────────────
  if (action === "trigger_notifications" || action === "trigger_sync") {
    const path = action === "trigger_notifications"
      ? "/api/cron/notifications"
      : "/api/cron/sync-wc2026";

    // Préférer VERCEL_PROJECT_PRODUCTION_URL (alias fixe) sinon VERCEL_URL (déploiement)
    const host = process.env.VERCEL_PROJECT_PRODUCTION_URL
      ?? process.env.VERCEL_URL
      ?? "localhost:3000";
    const protocol = host.startsWith("localhost") ? "http" : "https";
    const base = `${protocol}://${host}`;

    let data: Record<string, unknown>;
    let status: number;
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 9_000); // 9s max
      const res = await fetch(`${base}${path}`, {
        method: "GET",
        headers: { Authorization: `Bearer ${process.env.CRON_SECRET ?? ""}` },
        signal: controller.signal,
      });
      clearTimeout(timeout);
      const text = await res.text();
      try { data = JSON.parse(text); } catch { data = { raw: text }; }
      status = res.status;
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      return NextResponse.json({ error: `fetch échoué : ${msg}` }, { status: 500 });
    }
    return NextResponse.json(data, { status });
  }

  // ── Reset test : log notifs + last_notified_at + orders à -7h ───────────
  if (action === "reset_test") {
    const { user_id } = body;
    if (!user_id) return NextResponse.json({ error: "user_id requis." }, { status: 400 });

    const sevenHoursAgo = new Date(Date.now() - 7 * 3_600_000).toISOString();

    const [logDel, profileUp, ordersUp] = await Promise.all([
      admin.from("notification_log").delete().eq("user_id", user_id),
      admin.from("profiles").update({ last_notified_at: null }).eq("id", user_id),
      admin.from("orders")
        .update({ submitted_at: sevenHoursAgo, validated_at: sevenHoursAgo })
        .eq("user_id", user_id)
        .eq("status", "validated"),
    ]);

    const err = logDel.error ?? profileUp.error ?? ordersUp.error;
    if (err) return NextResponse.json({ error: err.message }, { status: 500 });
    return NextResponse.json({ ok: true, reset: "log + last_notified_at + orders → -7h" });
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
