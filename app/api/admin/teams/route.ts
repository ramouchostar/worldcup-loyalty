import { NextResponse, type NextRequest } from "next/server";
import { requireAdmin } from "@/lib/admin-guard";
import { renameTeam, setTeamActive, deleteTeam } from "@/lib/teams-admin";

// ADR 0035 — actions de gestion d'équipe pour le restaurateur. POST unique
// avec un champ `action` (même forme que /api/admin/orders) : renommer,
// archiver, réactiver, supprimer. La lecture se fait côté page (Server
// Component), il n'y a donc pas de GET ici.
export async function POST(request: NextRequest) {
  const body = (await request.json().catch(() => null)) ?? {};
  const { action, restaurantId, teamId, name } = body as {
    action?: string;
    restaurantId?: string;
    teamId?: string;
    name?: string;
  };

  if (typeof restaurantId !== "string" || !restaurantId) {
    return NextResponse.json({ error: "restaurantId requis." }, { status: 400 });
  }
  if (typeof teamId !== "string" || !teamId) {
    return NextResponse.json({ error: "teamId requis." }, { status: 400 });
  }

  const guard = await requireAdmin(restaurantId);
  if (!guard.ok) return guard.response;

  let result;
  switch (action) {
    case "rename":
      result = await renameTeam(restaurantId, teamId, typeof name === "string" ? name : "");
      break;
    case "archive":
      result = await setTeamActive(restaurantId, teamId, false);
      break;
    case "restore":
      result = await setTeamActive(restaurantId, teamId, true);
      break;
    case "delete":
      result = await deleteTeam(restaurantId, teamId);
      break;
    default:
      return NextResponse.json({ error: "Action inconnue." }, { status: 400 });
  }

  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 422 });
  return NextResponse.json({ success: true });
}
