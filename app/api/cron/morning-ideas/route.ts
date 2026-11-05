import { NextResponse } from "next/server";
import { runMorningIdeas } from "@/lib/agents/morning";

// Le passage du matin de la brigade (ADR 0089, Brigade 05). Appelé à 7 h et
// 8 h UTC : n'agit qu'à 9 h à Bruxelles (l'heure d'été suit toute seule). Le
// résultat dit, établissement par établissement, ce que chaque assistant a
// proposé, ce qui a été écarté et pourquoi, et si le gérant a été prévenu.
//
// `?only=<id>` : un seul établissement, à n'importe quelle heure (essai).

export const maxDuration = 300;

export async function GET(request: Request) {
  const authHeader = request.headers.get("authorization");
  if (!process.env.CRON_SECRET || authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Non autorisé." }, { status: 401 });
  }
  const only = new URL(request.url).searchParams.get("only") ?? undefined;
  const result = await runMorningIdeas(new Date(), { only });
  return NextResponse.json(result, { status: result.ok ? 200 : 503 });
}
