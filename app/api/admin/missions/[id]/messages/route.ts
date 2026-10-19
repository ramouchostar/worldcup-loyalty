import { NextResponse } from "next/server";
import { sendMessage } from "@/lib/missions-messages";
import { respondSend } from "@/lib/missions-messages-http";
import { requireMarketplace } from "@/lib/missions-guard";

// POST /api/admin/missions/[id]/messages — le restaurateur écrit au prestataire, dans la mission.
// Body : { restaurantId, body }. Tant que le travail n'a pas commencé, numéros, e-mails et liens de messagerie sont masqués.
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await req.json().catch(() => null);
  const restaurantId = typeof body?.restaurantId === "string" ? body.restaurantId : "";
  if (!restaurantId) return NextResponse.json({ error: "restaurantId requis." }, { status: 400 });
  const guard = await requireMarketplace(restaurantId);
  if (!guard.ok) return guard.response;
  return respondSend(await sendMessage({ kind: "restaurant", restaurantId, userId: guard.userId }, id, body));
}
