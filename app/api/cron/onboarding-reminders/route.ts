import { NextResponse } from "next/server";
import { runOnboardingReminders } from "@/lib/onboarding-reminder-runner";

// Relance d'inscription restaurateur (ADR 0075) — passe toutes les heures,
// n'envoie qu'à 11 h (1re relance) et 19 h (2de) heure de Bruxelles : les
// règles (lib/onboarding-reminder-rules.ts) décident, l'heure d'été suit
// toute seule. Cron à part : en fin du cron de notifications, coupé vers
// 5 min, la relance ne partait jamais. Le résultat dit ce qui est parti, ce
// qui attend et quels restaurateurs passent à l'équipe — jamais silencieux.

export const maxDuration = 60;

export async function GET(request: Request) {
  const authHeader = request.headers.get("authorization");
  if (!process.env.CRON_SECRET || authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Non autorisé." }, { status: 401 });
  }
  const result = await runOnboardingReminders();
  return NextResponse.json(result, { status: result.ok ? 200 : 503 });
}
