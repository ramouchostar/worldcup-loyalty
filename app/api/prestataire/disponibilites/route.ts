import { NextResponse } from "next/server";
import { requireProvider } from "@/lib/providers";
import { editUnavailability } from "@/lib/missions-dates";

// POST /api/prestataire/disponibilites — le prestataire bloque ou libère des jours.
// Body : { action: "block" | "free", days: ["2026-10-20", …] }. Un jour déjà réservé ne se bloque pas.
export async function POST(req: Request) {
  const guard = await requireProvider();
  if (!guard.ok) return guard.response;

  const body = await req.json().catch(() => null);
  const action = body?.action === "free" ? "free" : body?.action === "block" ? "block" : null;
  if (!action) return NextResponse.json({ error: "Action inconnue." }, { status: 400 });

  const r = await editUnavailability(guard.provider.id, body?.days, action);
  if (!r.ok) {
    return r.reason === "invalid"
      ? NextResponse.json({ error: "Ces jours ne sont pas valables : choisis des jours à venir, dans les 12 prochaines semaines." }, { status: 422 })
      : NextResponse.json({ error: "Le calendrier n'est pas disponible pour le moment. Réessaie plus tard." }, { status: 503 });
  }
  return NextResponse.json({ ok: true, changed: r.changed, refused: r.refused });
}
