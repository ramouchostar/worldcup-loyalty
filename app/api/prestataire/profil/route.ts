import { NextResponse } from "next/server";
import { requireProvider } from "@/lib/providers";
import { saveProfile } from "@/lib/providers-profile";
import { profileIssueText } from "@/lib/provider-profile";

// PUT /api/prestataire/profil — le prestataire enregistre SON profil (celui que lisent les restaurateurs).
// Body : { bio, does[], doesNot[], equipment, zone, languages[], works[{label,url}] }. Tout ou rien.
export async function PUT(req: Request) {
  const guard = await requireProvider();
  if (!guard.ok) return guard.response;

  const body = await req.json().catch(() => null);
  if (!body || typeof body !== "object") return NextResponse.json({ error: "Profil illisible." }, { status: 400 });

  const r = await saveProfile(guard.provider.id, body);
  if (r.ok) return NextResponse.json({ ok: true, profile: r.profile });
  if (r.reason === "invalid") {
    return NextResponse.json({ error: "Certains champs sont à corriger.", issues: r.issues.map((i) => ({ field: i.field, index: i.index ?? null, text: profileIssueText(i) })) }, { status: 422 });
  }
  return NextResponse.json({ error: "Le profil n'est pas disponible pour le moment. Réessaie plus tard." }, { status: 503 });
}
