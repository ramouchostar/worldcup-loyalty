import { NextResponse } from "next/server";
import { requireProvider } from "@/lib/providers";
import { markRead } from "@/lib/missions-messages";

// POST /api/prestataire/missions/[id]/messages/read — le prestataire a lu le fil.
export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const guard = await requireProvider();
  if (!guard.ok) return guard.response;
  const r = await markRead({ kind: "provider", provider: guard.provider }, id);
  return r.ok ? NextResponse.json({ ok: true }) : NextResponse.json({ error: "Impossible pour le moment.", reason: r.reason }, { status: r.reason === "not_found" ? 404 : 503 });
}
