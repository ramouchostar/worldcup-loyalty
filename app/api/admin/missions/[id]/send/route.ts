import { NextResponse } from "next/server";
import { sendBrief } from "@/lib/missions";
import { requireMarketplace } from "@/lib/missions-guard";

// POST /api/admin/missions/[id]/send — verrouille le brief et l'envoie au prestataire.
// Body : { restaurantId, answers? } (les dernières réponses de l'écran, jugées avant l'envoi).
// Un refus dit pourquoi : champs manquants (issues), aucun prestataire disponible, déjà envoyé.
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await req.json().catch(() => null);
  const restaurantId = typeof body?.restaurantId === "string" ? body.restaurantId : "";
  if (!restaurantId) return NextResponse.json({ error: "restaurantId requis." }, { status: 400 });

  const guard = await requireMarketplace(restaurantId);
  if (!guard.ok) return guard.response;

  const r = await sendBrief(id, restaurantId, guard.userId, body?.answers);
  if (r.ok) return NextResponse.json({ ok: true });

  switch (r.reason) {
    case "invalid_brief":
      return NextResponse.json({ error: "Il manque des réponses.", reason: r.reason, issues: r.issues }, { status: 422 });
    case "no_provider":
      return NextResponse.json(
        { error: "Aucun vidéaste n'est disponible pour le moment. Ton brief est gardé : réessaie bientôt.", reason: r.reason },
        { status: 409 }
      );
    case "not_a_draft":
      return NextResponse.json({ error: "Ce brief est déjà envoyé.", reason: r.reason }, { status: 409 });
    case "not_found":
      return NextResponse.json({ error: "Brief introuvable.", reason: r.reason }, { status: 404 });
    default:
      return NextResponse.json({ error: "Envoi impossible pour le moment. Réessaie.", reason: r.reason }, { status: 503 });
  }
}
