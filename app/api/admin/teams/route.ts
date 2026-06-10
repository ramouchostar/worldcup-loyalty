import { NextResponse, type NextRequest } from "next/server";
import { requireAdmin } from "@/lib/admin-guard";
import { createAdminClient } from "@/lib/supabase";

const VALID_ROUNDS = [
  "group_stage",
  "round_of_32",
  "round_of_16",
  "quarter_final",
  "semi_final",
  "final",
  "winner",
] as const;

export async function GET() {
  const guard = await requireAdmin();
  if (!guard.ok) return guard.response;

  const admin = createAdminClient();

  const { data, error } = await admin
    .from("teams")
    .select(`
      id, name, flag_emoji, country_code, is_active, round_reached, eliminated_at,
      community_scores (member_count, total_spent, score)
    `)
    .order("name");

  if (error) return NextResponse.json({ error: "Erreur serveur." }, { status: 500 });
  return NextResponse.json(data ?? []);
}

export async function PATCH(request: NextRequest) {
  const guard = await requireAdmin();
  if (!guard.ok) return guard.response;

  const body = await request.json();
  const { id, is_active, round_reached } = body;

  if (!id) return NextResponse.json({ error: "ID équipe manquant." }, { status: 400 });

  const update: Record<string, unknown> = {};

  if (typeof is_active === "boolean") {
    update.is_active = is_active;
    if (!is_active) {
      update.eliminated_at = new Date().toISOString();
    } else {
      update.eliminated_at = null;
    }
  }

  if (round_reached !== undefined) {
    if (!VALID_ROUNDS.includes(round_reached)) {
      return NextResponse.json({ error: "Stade invalide." }, { status: 400 });
    }
    update.round_reached = round_reached;
    // Set round_advanced_at to activate the ×1.5 score bonus (ADR 0002)
    if (round_reached !== "group_stage") {
      update.round_advanced_at = new Date().toISOString();
    }
  }

  if (Object.keys(update).length === 0) {
    return NextResponse.json({ error: "Rien à mettre à jour." }, { status: 400 });
  }

  const admin = createAdminClient();
  const { error } = await admin.from("teams").update(update).eq("id", id);

  if (error) return NextResponse.json({ error: "Erreur lors de la mise à jour." }, { status: 500 });
  return NextResponse.json({ success: true });
}
