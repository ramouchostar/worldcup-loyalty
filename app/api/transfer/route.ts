import { NextResponse, type NextRequest } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase";

export async function POST(request: NextRequest) {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Non authentifié." }, { status: 401 });

  const body = await request.json();
  const { to_team_id } = body;

  if (!to_team_id || typeof to_team_id !== "string") {
    return NextResponse.json({ error: "Équipe cible manquante." }, { status: 400 });
  }

  // Récupère le profil actuel
  const { data: profile } = await supabase
    .from("profiles")
    .select("team_id")
    .eq("id", user.id)
    .single();

  const currentTeamId = (profile as { team_id: string | null } | null)?.team_id ?? null;

  if (currentTeamId === to_team_id) {
    return NextResponse.json({ error: "Tu es déjà dans cette équipe." }, { status: 409 });
  }

  // Vérifie que l'équipe cible est active
  const { data: targetTeam } = await supabase
    .from("teams")
    .select("id, name, is_active")
    .eq("id", to_team_id)
    .single();

  const team = targetTeam as { id: string; name: string; is_active: boolean } | null;

  if (!team) {
    return NextResponse.json({ error: "Équipe introuvable." }, { status: 404 });
  }
  if (!team.is_active) {
    return NextResponse.json({ error: "Cette équipe est éliminée." }, { status: 422 });
  }

  // Enregistre le transfert dans l'historique
  const { error: transferError } = await supabase.from("transfers").insert({
    user_id: user.id,
    from_team_id: currentTeamId,
    to_team_id,
  });

  if (transferError) {
    return NextResponse.json({ error: "Erreur lors de l'enregistrement du transfert." }, { status: 500 });
  }

  // Met à jour le profil — déclenche les triggers PostgreSQL de recomptage
  const { error: profileError } = await supabase
    .from("profiles")
    .update({ team_id: to_team_id })
    .eq("id", user.id);

  if (profileError) {
    return NextResponse.json({ error: "Erreur lors du changement d'équipe." }, { status: 500 });
  }

  return NextResponse.json({ success: true, team_name: team.name }, { status: 200 });
}

export async function GET() {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Non authentifié." }, { status: 401 });

  const { data } = await supabase
    .from("transfers")
    .select(`
      id,
      from_team_id,
      to_team_id,
      transferred_at,
      from_team:teams!transfers_from_team_id_fkey (name, flag_emoji),
      to_team:teams!transfers_to_team_id_fkey (name, flag_emoji)
    `)
    .eq("user_id", user.id)
    .order("transferred_at", { ascending: false });

  return NextResponse.json(data ?? []);
}
