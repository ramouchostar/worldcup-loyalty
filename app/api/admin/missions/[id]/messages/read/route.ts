import { NextResponse } from "next/server";
import { markRead } from "@/lib/missions-messages";
import { requireMarketplace } from "@/lib/missions-guard";

// POST /api/admin/missions/[id]/messages/read — le restaurateur a lu le fil (plus de « non lu », plus d'e-mail de relance).
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await req.json().catch(() => null);
  const restaurantId = typeof body?.restaurantId === "string" ? body.restaurantId : "";
  if (!restaurantId) return NextResponse.json({ error: "restaurantId requis." }, { status: 400 });
  const guard = await requireMarketplace(restaurantId);
  if (!guard.ok) return guard.response;
  const r = await markRead({ kind: "restaurant", restaurantId, userId: guard.userId }, id);
  return r.ok ? NextResponse.json({ ok: true }) : NextResponse.json({ error: "Impossible pour le moment.", reason: r.reason }, { status: r.reason === "not_found" ? 404 : 503 });
}
