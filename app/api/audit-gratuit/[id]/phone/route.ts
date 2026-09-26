import { NextResponse, after } from "next/server";
import { getLead, LeadsUnavailable, updateLead } from "@/lib/audit/leads";
import { normalizePhone } from "@/lib/audit/quick-score";
import { createAudit, recentAuditFor } from "@/lib/audit/store";
import { runAudit } from "@/lib/audit/run";

// ADR 0071 §1 — le numéro débloque le rapport : on le garde avec son
// consentement, puis on lance l'audit complet (ADR 0069) sur la même fiche.
// Hors Bruxelles : le numéro est gardé, sans audit (la zone n'est pas couverte).
export const dynamic = "force-dynamic";
// L'audit complet tourne en tâche de fond : il hérite de cette durée (comme /platform/audit).
export const maxDuration = 300;

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = (await req.json().catch(() => null)) as { phone?: string; consent?: boolean } | null;
  const phone = normalizePhone(String(body?.phone ?? ""));
  if (!phone) return NextResponse.json({ error: "numero_invalide" }, { status: 400 });
  if (body?.consent !== true) return NextResponse.json({ error: "consentement" }, { status: 400 });

  try {
    const lead = await getLead(id);
    if (!lead) return NextResponse.json({ error: "introuvable" }, { status: 404 });
    // Idempotent : un second envoi met le numéro à jour sans relancer d'audit.
    await updateLead(lead.id, { phone, consent_at: new Date().toISOString() });

    if (lead.in_brussels && !lead.audit_id) {
      // Un audit complet de cette fiche de moins de 7 jours est rattaché, pas relancé :
      // deux demandes pour le même établissement ne coûtent qu'un audit.
      const existing = await recentAuditFor(lead.place_id, 7);
      if (existing) {
        await updateLead(lead.id, { audit_id: existing.id });
      } else {
        const audit = await createAudit({ name: lead.name, placeId: lead.place_id, address: lead.address, postalCode: lead.postal_code });
        await updateLead(lead.id, { audit_id: audit.id });
        after(() => runAudit(audit.id, { placeId: lead.place_id }));
      }
    }
    return NextResponse.json({ ok: true });
  } catch (e) {
    if (e instanceof LeadsUnavailable) return NextResponse.json({ error: "indisponible" }, { status: 503 });
    console.error("[audit-gratuit] numéro :", e);
    return NextResponse.json({ error: "echec" }, { status: 502 });
  }
}
