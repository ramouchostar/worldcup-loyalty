import { NextResponse } from "next/server";
import { createDraft } from "@/lib/missions";
import { requireMarketplace } from "@/lib/missions-guard";

// POST /api/admin/missions — ouvre (ou rouvre) le brouillon d'un métier.
// Body : { restaurantId, metier: "video" }
export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  const restaurantId = typeof body?.restaurantId === "string" ? body.restaurantId : "";
  const metier = body?.metier;
  if (!restaurantId) return NextResponse.json({ error: "restaurantId requis." }, { status: 400 });
  if (metier !== "video" && metier !== "photo" && metier !== "design" && metier !== "impression") {
    return NextResponse.json({ error: "Métier inconnu." }, { status: 400 });
  }

  const guard = await requireMarketplace(restaurantId);
  if (!guard.ok) return guard.response;

  const r = await createDraft(restaurantId, guard.userId, metier);
  if (!r.ok) {
    return NextResponse.json(
      { error: r.reason === "metier_not_open" ? "Ce service ouvre bientôt." : "Le service n'est pas disponible pour le moment. Réessaie plus tard." },
      { status: r.reason === "metier_not_open" ? 409 : 503 }
    );
  }
  return NextResponse.json({ ok: true, missionId: r.missionId });
}
