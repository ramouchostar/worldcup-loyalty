import { NextResponse, type NextRequest } from "next/server";
import { requireAdmin } from "@/lib/admin-guard";
import { createAdminClient } from "@/lib/supabase";
import { sendPush } from "@/lib/notifications";
import { createPendingReward } from "@/lib/rewards";
import { incrementProgramRevenue } from "@/lib/budget";

// receipt_url stocke un chemin storage (bucket privé — ADR 0003).
// Les anciennes lignes contiennent encore une URL publique complète :
// on en extrait le chemin pour pouvoir les signer aussi.
function toStoragePath(value: string): string | null {
  if (!value.startsWith("http")) return value;
  return value.split("/receipts/")[1] ?? null;
}

export async function GET(request: NextRequest) {
  const restaurantId = request.nextUrl.searchParams.get("restaurantId");
  if (!restaurantId) return NextResponse.json({ error: "restaurantId requis." }, { status: 400 });

  const guard = await requireAdmin(restaurantId);
  if (!guard.ok) return guard.response;

  const admin = createAdminClient();

  const { data, error } = await admin
    .from("orders")
    .select(`
      id,
      user_id,
      amount,
      order_date,
      order_time,
      order_number,
      receipt_url,
      ocr_amount,
      ocr_confidence,
      flag_reasons,
      status,
      rejection_reason,
      submitted_at,
      validated_at,
      team_id,
      profiles!orders_user_id_fkey (display_name, email),
      teams!orders_team_id_fkey (name, flag_emoji)
    `)
    .eq("restaurant_id", restaurantId)
    .order("submitted_at", { ascending: true });

  if (error) return NextResponse.json({ error: "Erreur serveur." }, { status: 500 });

  // Remplace les chemins storage par des URLs signées temporaires (1h)
  const orders = data ?? [];
  const paths = orders.map((o) => (o.receipt_url ? toStoragePath(o.receipt_url) : null));
  const validPaths = Array.from(new Set(paths.filter((p): p is string => p !== null)));

  if (validPaths.length > 0) {
    const { data: signed } = await admin.storage
      .from("receipts")
      .createSignedUrls(validPaths, 3600);
    const signedByPath = new Map(
      (signed ?? []).filter((s) => s.signedUrl).map((s) => [s.path, s.signedUrl])
    );
    orders.forEach((o, i) => {
      const p = paths[i];
      o.receipt_url = p ? signedByPath.get(p) ?? null : null;
    });
  }

  return NextResponse.json(orders);
}

export async function PATCH(request: NextRequest) {
  const body = await request.json();
  const { id, ids, action, rejection_reason, restaurantId } = body;

  if (typeof restaurantId !== "string" || !restaurantId) {
    return NextResponse.json({ error: "restaurantId requis." }, { status: 400 });
  }

  const guard = await requireAdmin(restaurantId);
  if (!guard.ok) return guard.response;

  if (!action || !["validate", "reject", "batch_validate"].includes(action)) {
    return NextResponse.json({ error: "Action invalide." }, { status: 400 });
  }
  if (action === "reject" && !rejection_reason?.trim()) {
    return NextResponse.json({ error: "Motif de rejet requis." }, { status: 400 });
  }
  if (action === "batch_validate" && (!Array.isArray(ids) || ids.length === 0)) {
    return NextResponse.json({ error: "Liste d'IDs requise." }, { status: 400 });
  }
  if ((action === "validate" || action === "reject") && !id) {
    return NextResponse.json({ error: "ID requis." }, { status: 400 });
  }

  const admin = createAdminClient();
  const now = new Date().toISOString();

  if (action === "batch_validate") {
    const { data: updated, error } = await admin
      .from("orders")
      .update({ status: "validated", validated_at: now, rejection_reason: null })
      .in("id", ids)
      .eq("status", "pending")
      .eq("restaurant_id", restaurantId) // ADR sécurité F1 — jamais muter une commande d'un autre établissement
      .select("id, user_id, amount, team_id");

    if (error) return NextResponse.json({ error: "Erreur lors de la validation." }, { status: 500 });

    // Récompenses 3 couches + notifications (best-effort, non-bloquant)
    void Promise.allSettled(
      (updated ?? []).map(async o => {
        await incrementProgramRevenue(restaurantId, Number(o.amount));
        await createPendingReward(o.id, o.user_id, o.team_id, restaurantId, Number(o.amount)).catch(() => {});
        await sendPush(o.user_id, restaurantId,
          `✅ Ta commande de ${Number(o.amount).toLocaleString("fr-BE", { style: "currency", currency: "EUR" })} a été validée ! Tes récompenses t'attendent.`
        );
      })
    );

    return NextResponse.json({ updated: updated?.length ?? 0 });
  }

  // Single validate or reject
  const update =
    action === "validate"
      ? { status: "validated", validated_at: now, rejection_reason: null }
      : { status: "rejected", rejection_reason: rejection_reason.trim(), validated_at: null };

  const { data: updated, error } = await admin
    .from("orders")
    .update(update)
    .eq("id", id)
    .eq("restaurant_id", restaurantId) // ADR sécurité F1 — la commande doit appartenir à CET établissement
    .select("user_id, amount, team_id")
    .single();

  if (error) return NextResponse.json({ error: "Erreur lors de la mise à jour." }, { status: 500 });

  if (updated) {
    const msg = action === "validate"
      ? `✅ Ta commande de ${Number(updated.amount).toLocaleString("fr-BE", { style: "currency", currency: "EUR" })} a été validée ! Tes récompenses t'attendent.`
      : `❌ Ta commande a été rejetée : ${rejection_reason.trim()}`;
    void sendPush(updated.user_id, restaurantId, msg);

    if (action === "validate") {
      void incrementProgramRevenue(restaurantId, Number(updated.amount))
        .then(() => createPendingReward(id, updated.user_id, updated.team_id, restaurantId, Number(updated.amount)))
        .catch(() => {});
    }
  }

  return NextResponse.json({ success: true });
}
