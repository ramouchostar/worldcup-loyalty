import { NextResponse } from "next/server";
import { getLead, LeadsUnavailable } from "@/lib/audit/leads";

// ADR 0071 — état d'une analyse, interrogé par la page toutes les ~1,2 s.
// Ne renvoie jamais le numéro, l'empreinte IP ni le coût.
export const dynamic = "force-dynamic";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  try {
    const lead = await getLead(id);
    if (!lead) return NextResponse.json({ error: "introuvable" }, { status: 404 });
    return NextResponse.json(
      {
        status: lead.scan_status,
        name: lead.name,
        address: lead.address,
        inBrussels: lead.in_brussels,
        scan: lead.scan,
        score: lead.score,
        phoneLeft: !!lead.phone,
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (e) {
    if (e instanceof LeadsUnavailable) return NextResponse.json({ error: "indisponible" }, { status: 503 });
    throw e;
  }
}
