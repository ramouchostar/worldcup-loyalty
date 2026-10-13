import { NextResponse } from "next/server";
import { requireProvider } from "@/lib/providers";
import { submitReport } from "@/lib/missions-dayof";

// POST /api/prestataire/missions/[id]/report — le compte-rendu du tournage.
// Body : { arrival: "09:30", end: "11:45", missing: [...], note }. Modifiable tant que le restaurateur n'a pas répondu.
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const guard = await requireProvider();
  if (!guard.ok) return guard.response;

  const body = await req.json().catch(() => null);
  const r = await submitReport(id, guard.provider, body);
  if (r.ok) return NextResponse.json({ ok: true });
  switch (r.reason) {
    case "invalid":
      return NextResponse.json({ error: "Il manque des informations dans ton compte-rendu.", reason: r.reason, issues: r.issues }, { status: 422 });
    case "locked":
      return NextResponse.json({ error: "Le restaurateur a déjà répondu à ton compte-rendu : il ne se modifie plus.", reason: r.reason }, { status: 409 });
    case "not_started":
      return NextResponse.json({ error: "Démarre d'abord le tournage (« Je suis arrivé »).", reason: r.reason }, { status: 409 });
    case "not_found":
      return NextResponse.json({ error: "Mission introuvable.", reason: r.reason }, { status: 404 });
    default:
      return NextResponse.json({ error: "Impossible pour le moment. Réessaie.", reason: r.reason }, { status: 503 });
  }
}
