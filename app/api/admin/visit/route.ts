import { NextResponse, type NextRequest } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase";
import { getAdminAccess } from "@/lib/admin-guard";
import { recordConsoleVisit } from "@/lib/send-timing-data";

// ADR 0077 §4 — une ouverture de la console, comptée par heure (au plus une
// par personne et par heure : le navigateur filtre). Aucun identifiant n'est
// gardé. Le super-admin en visite (mode plateforme) ne compte pas : on mesure
// quand les GÉRANTS sont disponibles.

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null);
  const restaurantId = typeof body?.restaurantId === "string" ? body.restaurantId : "";
  if (!restaurantId) return NextResponse.json({ ok: false }, { status: 400 });

  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ ok: false }, { status: 401 });

  const access = await getAdminAccess(user.id, restaurantId);
  const isStaff = access.isOwner || access.isLegacyAdmin || access.seatRole !== null;
  if (isStaff) await recordConsoleVisit(restaurantId);
  return NextResponse.json({ ok: true });
}
