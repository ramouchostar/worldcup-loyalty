import { NextResponse } from "next/server";
import { joinTeamByCode, joinTeamById } from "@/lib/teams";

// POST /api/teams/join — rejoindre une équipe.
// Body : { restaurantId, code } (invitation, ADR 0014)
//     ou { restaurantId, teamId } (découverte par zone, ADR 0018).
export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  const code = typeof body?.code === "string" ? body.code : "";
  const teamId = typeof body?.teamId === "string" ? body.teamId : "";
  const restaurantId = typeof body?.restaurantId === "string" ? body.restaurantId : "";

  if (!restaurantId) {
    return NextResponse.json({ error: "restaurantId requis." }, { status: 400 });
  }
  if (!code && !teamId) {
    return NextResponse.json({ error: "code ou teamId requis." }, { status: 400 });
  }

  const result = teamId
    ? await joinTeamById(teamId, restaurantId)
    : await joinTeamByCode(code, restaurantId);
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });
  return NextResponse.json(result.team);
}
