import { NextResponse } from "next/server";
import { runMissionReminders } from "@/lib/mission-reminders-runner";

// Passage quotidien des rappels de tournage (ADR 0084 §5) — 7 h UTC, soit 8 h à Bruxelles en hiver
// (9 h en été) : à la prise de service, pas la veille au soir. Gardé par CRON_SECRET comme les autres crons.
// Migration absente → 503 et RIEN n'est envoyé (jamais un rappel sans garde-fou de doublon).

export const maxDuration = 120;

export async function GET(request: Request) {
  const authHeader = request.headers.get("authorization");
  if (!process.env.CRON_SECRET || authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Non autorisé." }, { status: 401 });
  }
  const run = await runMissionReminders();
  if (!run.ok) return NextResponse.json({ error: "Rappels indisponibles : migration 20261012-1100 non appliquée ?" }, { status: 503 });
  return NextResponse.json(run);
}
