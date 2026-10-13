import { NextResponse } from "next/server";
import { getMission, getProviderName } from "@/lib/missions";
import { requireMarketplace } from "@/lib/missions-guard";
import { icsResponse, missionIcs } from "@/lib/missions-ics";
import { createAdminClient } from "@/lib/supabase";

// GET /api/admin/missions/[id]/ics?restaurantId=… — le tournage dans l'agenda du restaurateur.
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const restaurantId = new URL(req.url).searchParams.get("restaurantId") ?? "";
  if (!restaurantId) return NextResponse.json({ error: "restaurantId requis." }, { status: 400 });
  const guard = await requireMarketplace(restaurantId);
  if (!guard.ok) return guard.response;

  const found = await getMission(id, restaurantId);
  if (!found.ok) return NextResponse.json({ error: "Indisponible pour le moment." }, { status: 503 });
  const m = found.mission;
  if (!m || !m.shoot_date) return NextResponse.json({ error: "Aucune date réservée pour cette mission." }, { status: 404 });

  const { data: r } = await createAdminClient().from("restaurants").select("name").eq("id", restaurantId).maybeSingle();
  const ics = missionIcs(m, { forWho: "restaurant", restaurantName: (r as { name: string } | null)?.name ?? "ton restaurant", providerName: (await getProviderName(m.provider_id)) ?? "ton prestataire" });
  if (!ics) return NextResponse.json({ error: "Aucune date réservée pour cette mission." }, { status: 404 });
  return icsResponse(ics, id);
}
