import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin-guard";
import { createAdminClient } from "@/lib/supabase";
import { addFeedbackMessage } from "@/lib/feedback";

// POST /api/admin/feedback/[id]/reply — l'établissement répond à un retour,
// via le fil MÉDIÉ par la plateforme (il n'a jamais le contact du membre).
// Body : { restaurantId, body?: string, resolve?: bool }
export async function POST(req: Request, { params }: { params: { id: string } }) {
  const body = await req.json().catch(() => null);
  const restaurantId = typeof body?.restaurantId === "string" ? body.restaurantId : "";
  const text = typeof body?.body === "string" ? body.body : "";
  const resolve = body?.resolve === true;

  if (!restaurantId) return NextResponse.json({ error: "restaurantId requis." }, { status: 400 });

  const guard = await requireAdmin(restaurantId);
  if (!guard.ok) return guard.response;

  const admin = createAdminClient();
  // Le retour doit appartenir à CET établissement (borne resto + owner).
  const { data: fb } = await admin
    .from("quality_feedback")
    .select("id, restaurant_id")
    .eq("id", params.id)
    .maybeSingle();
  const row = fb as { restaurant_id: string } | null;
  if (!row || row.restaurant_id !== restaurantId) {
    return NextResponse.json({ error: "Retour introuvable." }, { status: 404 });
  }

  if (!text.trim() && !resolve) {
    return NextResponse.json({ error: "Rien à faire." }, { status: 400 });
  }

  if (text.trim()) {
    const res = await addFeedbackMessage(
      { feedbackId: params.id, restaurantId, sender: "establishment", body: text },
      admin
    );
    if (!res.ok) return NextResponse.json({ error: res.reason }, { status: 400 });
  }
  if (resolve) {
    await admin.from("quality_feedback").update({ status: "resolved" }).eq("id", params.id);
  }
  return NextResponse.json({ ok: true });
}
