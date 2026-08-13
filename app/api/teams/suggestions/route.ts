import { NextResponse } from "next/server";
import {
  declineTeamSuggestions,
  joinTeamBySuggestion,
  snoozeTeamPrompt,
} from "@/lib/teams";

// POST /api/teams/suggestions — réponses au « te reconnais-tu ? » (ADR 0031).
// Body : { restaurantId, action, suggestionId?, suggestionIds? }
//   join    → matérialise l'équipe si besoin et y affecte le membre
//   decline → « aucune de ces équipes » : mémorise les propositions affichées
//             (la relance en proposera d'autres) et arme la relance à 7 jours
//   later   → relance à 7 jours sans rien refuser (« Passer »)
export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  const restaurantId = typeof body?.restaurantId === "string" ? body.restaurantId : "";
  const action = typeof body?.action === "string" ? body.action : "";
  const suggestionId = typeof body?.suggestionId === "string" ? body.suggestionId : "";
  const suggestionIds = Array.isArray(body?.suggestionIds)
    ? body.suggestionIds.filter((v: unknown): v is string => typeof v === "string")
    : [];

  if (!restaurantId) {
    return NextResponse.json({ error: "restaurantId requis." }, { status: 400 });
  }

  if (action === "later") {
    const result = await snoozeTeamPrompt(restaurantId);
    if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });
    return NextResponse.json({ ok: true });
  }

  if (action === "decline") {
    const result = await declineTeamSuggestions(suggestionIds, restaurantId);
    if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });
    return NextResponse.json({ ok: true });
  }

  if (action === "join") {
    if (!suggestionId) {
      return NextResponse.json({ error: "suggestionId requis." }, { status: 400 });
    }
    const result = await joinTeamBySuggestion(suggestionId, restaurantId);
    if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });
    return NextResponse.json({ team: result.team, becameCaptain: result.becameCaptain });
  }

  return NextResponse.json({ error: "Action inconnue." }, { status: 400 });
}
