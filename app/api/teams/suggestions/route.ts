import { NextResponse } from "next/server";
import {
  declineTeamSuggestion,
  joinTeamBySuggestion,
  snoozeTeamPrompt,
} from "@/lib/teams";

// POST /api/teams/suggestions — réponses au « te reconnais-tu ? » (ADR 0031).
// Body : { restaurantId, action: 'join' | 'decline' | 'later', suggestionId? }
//   join    → matérialise l'équipe si besoin et y affecte le membre
//   decline → mémorise le refus (on lui en proposera d'autres à la relance)
//   later   → relance dans une semaine, sans rien refuser
export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  const restaurantId = typeof body?.restaurantId === "string" ? body.restaurantId : "";
  const action = typeof body?.action === "string" ? body.action : "";
  const suggestionId = typeof body?.suggestionId === "string" ? body.suggestionId : "";

  if (!restaurantId) {
    return NextResponse.json({ error: "restaurantId requis." }, { status: 400 });
  }

  if (action === "later") {
    const result = await snoozeTeamPrompt(restaurantId);
    if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });
    return NextResponse.json({ ok: true });
  }

  if (!suggestionId) {
    return NextResponse.json({ error: "suggestionId requis." }, { status: 400 });
  }

  if (action === "decline") {
    const result = await declineTeamSuggestion(suggestionId, restaurantId);
    if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });
    return NextResponse.json({ ok: true, exhausted: result.exhausted });
  }

  if (action === "join") {
    const result = await joinTeamBySuggestion(suggestionId, restaurantId);
    if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });
    return NextResponse.json({ team: result.team, becameCaptain: result.becameCaptain });
  }

  return NextResponse.json({ error: "Action inconnue." }, { status: 400 });
}
