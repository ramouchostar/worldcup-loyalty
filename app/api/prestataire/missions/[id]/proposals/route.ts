import { NextResponse } from "next/server";
import { requireProvider } from "@/lib/providers";
import { submitProposals } from "@/lib/missions-proposals";

// POST /api/prestataire/missions/[id]/proposals — une série de 2 ou 3 idées de tournage (la 1re est la recommandée).
// Body : { proposals: [{ title, idea, onsite, link }] }. Une première série, puis une seule nouvelle si le restaurateur la refuse.
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const guard = await requireProvider();
  if (!guard.ok) return guard.response;

  const body = await req.json().catch(() => null);
  const r = await submitProposals(id, guard.provider, body);
  if (r.ok) return NextResponse.json({ ok: true, round: r.round });
  switch (r.reason) {
    case "invalid":
      return NextResponse.json({ error: "Tes idées ne sont pas complètes.", reason: r.reason, issues: r.issues }, { status: 422 });
    case "too_late":
      return NextResponse.json({ error: "Il est trop tard pour déposer des idées : appelle Boosteats.", reason: r.reason }, { status: 409 });
    case "not_expected":
      return NextResponse.json({ error: "Cette mission n'attend pas d'idées pour le moment.", reason: r.reason }, { status: 409 });
    case "not_found":
      return NextResponse.json({ error: "Mission introuvable.", reason: r.reason }, { status: 404 });
    default:
      return NextResponse.json({ error: "Impossible pour le moment. Réessaie.", reason: r.reason }, { status: 503 });
  }
}
