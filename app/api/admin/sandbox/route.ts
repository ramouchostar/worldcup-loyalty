import { NextResponse, type NextRequest } from "next/server";
import { requireAdmin } from "@/lib/admin-guard";
import { createAdminClient } from "@/lib/supabase";

export async function POST(request: NextRequest) {
  const body = (await request.json().catch(() => null)) ?? {};
  const { action, restaurantId } = body;
  if (typeof restaurantId !== "string" || !restaurantId) {
    return NextResponse.json({ error: "restaurantId requis." }, { status: 400 });
  }

  const guard = await requireAdmin(restaurantId);
  if (!guard.ok) return guard.response;

  const admin = createAdminClient();
  const now = new Date().toISOString();

  // ── Commande test : créée + validée instantanément ───────────────────────
  if (action === "test_order") {
    const { user_id, amount } = body;
    if (!user_id || !amount || Number(amount) <= 0) {
      return NextResponse.json({ error: "user_id et amount requis." }, { status: 400 });
    }

    // ADR 0015 — l'équipe du membre pour CET établissement vit dans
    // memberships, pas profiles.team_id (obsolète).
    const { data: membership } = await admin
      .from("memberships")
      .select("team_id")
      .eq("user_id", user_id)
      .eq("restaurant_id", restaurantId)
      .maybeSingle();

    if (!membership?.team_id) {
      return NextResponse.json({ error: "Utilisateur sans équipe dans cet établissement." }, { status: 400 });
    }

    const fakeKey = `SANDBOX-${Date.now()}`;
    const { data: order, error } = await admin
      .from("orders")
      .insert({
        user_id,
        team_id:       membership.team_id,
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

  // ── Déclencher le cron de notifications ──────────────────────────────────
  if (action === "trigger_notifications") {
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
      const res = await fetch(`${base}/api/cron/notifications`, {
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
export async function GET(request: NextRequest) {
  const restaurantId = request.nextUrl.searchParams.get("restaurantId");
  if (!restaurantId) return NextResponse.json({ error: "restaurantId requis." }, { status: 400 });

  const guard = await requireAdmin(restaurantId);
  if (!guard.ok) return guard.response;

  const admin = createAdminClient();

  const [membersResult, teamsResult] = await Promise.all([
    admin
      .from("memberships")
      .select("user_id, team_id, profiles!inner(display_name, email), teams!inner(name, flag_emoji)")
      .eq("restaurant_id", restaurantId)
      .not("team_id", "is", null)
      .order("display_name", { referencedTable: "profiles" }),
    admin
      .from("community_scores")
      .select("team_id, member_count, total_spent, score, teams(name, flag_emoji)")
      .eq("restaurant_id", restaurantId)
      .order("score", { ascending: false }),
  ]);

  const members = ((membersResult.data ?? []) as unknown as {
    user_id: string;
    team_id: string;
    profiles: { display_name: string; email: string };
    teams: { name: string; flag_emoji: string };
  }[]).map((m) => ({
    id: m.user_id,
    display_name: m.profiles.display_name,
    email: m.profiles.email,
    team_id: m.team_id,
    teams: m.teams,
  }));

  return NextResponse.json({
    members,
    scores: teamsResult.data ?? [],
  });
}
