import { NextResponse } from "next/server";
import { requireProvider } from "@/lib/providers";
import { startShoot } from "@/lib/missions-dayof";

// POST /api/prestataire/missions/[id]/start — « je suis arrivé » (à partir du jour du tournage).
export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const guard = await requireProvider();
  if (!guard.ok) return guard.response;

  const r = await startShoot(id, guard.provider);
  if (r.ok) return NextResponse.json({ ok: true });
  switch (r.reason) {
    case "too_early":
      return NextResponse.json({ error: "Tu pourras démarrer le jour du tournage.", reason: r.reason }, { status: 409 });
    case "not_booked":
      return NextResponse.json({ error: "Cette mission n'a pas de tournage à démarrer.", reason: r.reason }, { status: 409 });
    case "not_found":
      return NextResponse.json({ error: "Mission introuvable.", reason: r.reason }, { status: 404 });
    default:
      return NextResponse.json({ error: "Impossible pour le moment. Réessaie.", reason: r.reason }, { status: 503 });
  }
}
