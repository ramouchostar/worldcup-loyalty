import { NextResponse } from "next/server";
import { requireProvider } from "@/lib/providers";
import { acceptAsProvider } from "@/lib/missions-rules";
import { RULES_REFUSAL_TEXT } from "@/lib/mission-rules";

// POST /api/prestataire/rules/accept — le prestataire accepte les règles du jeu (une fois par version).
// Body : { accepted: true, version }. Une autre version que celle en vigueur est refusée : il relit d'abord.
export async function POST(req: Request) {
  const guard = await requireProvider();
  if (!guard.ok) return guard.response;
  const body = await req.json().catch(() => null);

  const r = await acceptAsProvider(guard.provider.id, body);
  if (r.ok) return NextResponse.json({ ok: true });
  if (r.reason === "unavailable") return NextResponse.json({ error: "Impossible pour le moment. Réessaie.", reason: r.reason }, { status: 503 });
  return NextResponse.json({ error: RULES_REFUSAL_TEXT[r.reason], reason: r.reason }, { status: 422 });
}
