import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin-guard";
import { sendBroadcast, type BroadcastTarget } from "@/lib/broadcast";
import { isTeamType } from "@/lib/teams";

// POST /api/admin/broadcast — envoie une notification ciblée (ADR 0014).
// Body : { restaurantId, message, target: { kind: "all" } | { kind: "teams", teamIds } | { kind: "types", types } }.
export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  const restaurantId = body?.restaurantId;
  if (typeof restaurantId !== "string" || !restaurantId) {
    return NextResponse.json({ error: "restaurantId requis." }, { status: 400 });
  }

  const guard = await requireAdmin(restaurantId);
  if (!guard.ok) return guard.response;

  const message = typeof body?.message === "string" ? body.message.trim() : "";
  if (message.length < 3 || message.length > 280) {
    return NextResponse.json({ error: "Message de 3 à 280 caractères." }, { status: 400 });
  }

  const kind = body?.target?.kind;
  let target: BroadcastTarget;
  if (kind === "all") {
    target = { kind: "all" };
  } else if (kind === "teams") {
    const teamIds = Array.isArray(body.target.teamIds)
      ? body.target.teamIds.filter((x: unknown): x is string => typeof x === "string")
      : [];
    if (teamIds.length === 0) return NextResponse.json({ error: "Aucune équipe sélectionnée." }, { status: 400 });
    target = { kind: "teams", teamIds };
  } else if (kind === "types") {
    const types = Array.isArray(body.target.types) ? body.target.types.filter(isTeamType) : [];
    if (types.length === 0) return NextResponse.json({ error: "Aucun type sélectionné." }, { status: 400 });
    target = { kind: "types", types };
  } else {
    return NextResponse.json({ error: "Cible invalide." }, { status: 400 });
  }

  const result = await sendBroadcast(message, target, restaurantId);
  return NextResponse.json({ ok: true, ...result });
}
