import { NextResponse } from "next/server";
import { createServerSupabaseClient, createAdminClient } from "@/lib/supabase";
import { addFeedbackMessage } from "@/lib/feedback";

// POST /api/feedback/[id]/reply — le membre répond dans SON fil de retour.
// Body : { body: string }
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Non authentifié." }, { status: 401 });

  const body = await req.json().catch(() => null);
  const text = typeof body?.body === "string" ? body.body : "";
  if (!text.trim()) return NextResponse.json({ error: "Message vide." }, { status: 400 });

  const admin = createAdminClient();
  const { data: fb } = await admin
    .from("quality_feedback")
    .select("id, user_id, restaurant_id")
    .eq("id", id)
    .maybeSingle();
  const row = fb as { user_id: string; restaurant_id: string } | null;
  if (!row || row.user_id !== user.id) {
    return NextResponse.json({ error: "Retour introuvable." }, { status: 404 });
  }

  const res = await addFeedbackMessage(
    { feedbackId: id, restaurantId: row.restaurant_id, sender: "member", body: text },
    admin
  );
  if (!res.ok) return NextResponse.json({ error: res.reason }, { status: 400 });
  return NextResponse.json({ ok: true });
}
