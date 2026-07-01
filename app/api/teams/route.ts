import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient, createServerSupabaseClient } from "@/lib/supabase";
import { createTeam, isTeamType } from "@/lib/teams";

// GET /api/teams?restaurantId=... — équipes communautaires de l'établissement (pour parcourir / rejoindre).
export async function GET(request: NextRequest) {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Non authentifié." }, { status: 401 });

  const restaurantId = request.nextUrl.searchParams.get("restaurantId");
  if (!restaurantId) return NextResponse.json({ error: "restaurantId requis." }, { status: 400 });

  const admin = createAdminClient();
  const { data } = await admin
    .from("teams")
    .select("id, name, type, flag_emoji")
    .eq("restaurant_id", restaurantId)
    .eq("is_active", true)
    .order("name");

  return NextResponse.json(data ?? []);
}

// POST /api/teams — crée une équipe communautaire. Body : { name, type, restaurantId }.
export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  const name = typeof body?.name === "string" ? body.name : "";
  const restaurantId = typeof body?.restaurantId === "string" ? body.restaurantId : "";
  if (!isTeamType(body?.type)) {
    return NextResponse.json({ error: "Type d'équipe invalide." }, { status: 400 });
  }
  if (!restaurantId) {
    return NextResponse.json({ error: "restaurantId requis." }, { status: 400 });
  }

  const result = await createTeam(name, body.type, restaurantId);
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });
  return NextResponse.json(result.team, { status: 201 });
}
