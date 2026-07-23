import { NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase";
import { getCurrentConsents, recordConsents } from "@/lib/consent";
import type { ConsentPurpose } from "@/types";

// Finalités que le membre peut modifier lui-même (le « programme » est lié au
// contrat, pas révocable via ce toggle sans quitter le service).
const UPDATABLE: ConsentPurpose[] = ["marketing_push", "marketing_whatsapp", "insights_commerciaux", "zones"];

// GET /api/consents — consentements courants du membre connecté.
export async function GET() {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Non authentifié." }, { status: 401 });
  return NextResponse.json(await getCurrentConsents(user.id));
}

// POST /api/consents — met à jour un ou plusieurs consentements. Body :
// { consents: { marketing_push?: bool, insights_commerciaux?: bool, ... } }.
export async function POST(req: Request) {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Non authentifié." }, { status: 401 });

  const body = await req.json().catch(() => null);
  const input = body?.consents;
  if (!input || typeof input !== "object") {
    return NextResponse.json({ error: "consents requis." }, { status: 400 });
  }

  const entries: Partial<Record<ConsentPurpose, boolean>> = {};
  for (const p of UPDATABLE) {
    if (typeof input[p] === "boolean") entries[p] = input[p];
  }
  if (Object.keys(entries).length === 0) {
    return NextResponse.json({ error: "Aucun consentement valide." }, { status: 400 });
  }

  await recordConsents(user.id, entries, "settings");
  return NextResponse.json({ ok: true, consents: await getCurrentConsents(user.id) });
}
