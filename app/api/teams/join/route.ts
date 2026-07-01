import { NextResponse } from "next/server";
import { joinTeamByCode } from "@/lib/teams";

// POST /api/teams/join — rejoindre une équipe via son code. Body : { code, restaurantId }.
export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  const code = typeof body?.code === "string" ? body.code : "";
  const restaurantId = typeof body?.restaurantId === "string" ? body.restaurantId : "";

  if (!restaurantId) {
    return NextResponse.json({ error: "restaurantId requis." }, { status: 400 });
  }

  const result = await joinTeamByCode(code, restaurantId);
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });
  return NextResponse.json(result.team);
}
