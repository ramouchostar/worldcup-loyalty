import { NextResponse } from "next/server";
import { requireProvider } from "@/lib/providers";
import { getForProvider } from "@/lib/provider-missions";
import { icsResponse, missionIcs } from "@/lib/missions-ics";

// GET /api/prestataire/missions/[id]/ics — le tournage dans l'agenda du prestataire.
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const guard = await requireProvider();
  if (!guard.ok) return guard.response;

  const found = await getForProvider(id, guard.provider.id);
  if (!found.ok) return NextResponse.json({ error: "Indisponible pour le moment." }, { status: 503 });
  const m = found.mission;
  if (!m || !m.shoot_date) return NextResponse.json({ error: "Aucune date réservée pour cette mission." }, { status: 404 });
  const ics = missionIcs(m, { forWho: "provider", restaurantName: m.restaurant_name, providerName: guard.provider.display_name });
  if (!ics) return NextResponse.json({ error: "Aucune date réservée pour cette mission." }, { status: 404 });
  return icsResponse(ics, id);
}
