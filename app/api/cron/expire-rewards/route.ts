import { NextResponse } from "next/server";
import { expireStaleRewards, REWARD_CLAIM_WINDOW_HOURS } from "@/lib/reward-expiry";

// ADR 0011 — le job horaire qui fait expirer les cadeaux non récupérés.
// Prévu par l'ADR, jamais construit : un cadeau restait donc `available`
// indéfiniment et bloquait, via l'index un-seul-actif, tout cadeau suivant
// du même membre. Horaire parce que la fenêtre est de 48 h : une granularité
// quotidienne laisserait traîner jusqu'à 72 h de cadeau fantôme.
//
// La garde à la demande vit dans `POST /api/redemption/generate` : c'est elle
// qui rend le refus déterministe. Ce cron n'a pas à courir après la seconde,
// il nettoie l'état pour que le slot du membre se libère.
export async function GET(request: Request) {
  const authHeader = request.headers.get("authorization");
  if (!process.env.CRON_SECRET || authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Non autorisé." }, { status: 401 });
  }

  const result = await expireStaleRewards();
  return NextResponse.json({ ok: true, window_hours: REWARD_CLAIM_WINDOW_HOURS, ...result });
}
