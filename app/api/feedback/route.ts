import { NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase";
import { recordFeedback, FEEDBACK_DIMENSIONS } from "@/lib/feedback";
import type { FeedbackDimension, FeedbackSentiment } from "@/types";

// POST /api/feedback — le membre dépose un retour (ADR 0023).
// Body : { restaurantId, sentiment: "encouragement"|"incident",
//          dimensions?: string[], comment?: string,
//          contactOptIn?: bool (incident), forceAnonymous?: bool (encouragement) }
export async function POST(req: Request) {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Non authentifié." }, { status: 401 });

  const body = await req.json().catch(() => null);
  const restaurantId = typeof body?.restaurantId === "string" ? body.restaurantId : "";
  const sentiment = body?.sentiment as FeedbackSentiment;

  if (!restaurantId) return NextResponse.json({ error: "restaurantId requis." }, { status: 400 });
  if (sentiment !== "encouragement" && sentiment !== "incident") {
    return NextResponse.json({ error: "Type de retour invalide." }, { status: 400 });
  }

  const dimensions: FeedbackDimension[] = Array.isArray(body?.dimensions)
    ? body.dimensions.filter(
        (d: unknown): d is FeedbackDimension => typeof d === "string" && (FEEDBACK_DIMENSIONS as string[]).includes(d)
      )
    : [];

  const result = await recordFeedback({
    userId: user.id,
    restaurantId,
    sentiment,
    dimensions,
    comment: typeof body?.comment === "string" ? body.comment : null,
    contactOptIn: body?.contactOptIn === true,
    forceAnonymous: body?.forceAnonymous === true,
  });

  if (!result.ok) {
    const conflict = result.reason === "not_eligible" || result.reason === "already_submitted";
    return NextResponse.json({ error: result.reason }, { status: conflict ? 409 : 400 });
  }
  return NextResponse.json({ ok: true, id: result.id });
}
