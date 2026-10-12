import { NextResponse } from "next/server";
import { runMissionReminders } from "@/lib/mission-reminders-runner";
import { runAutoValidation } from "@/lib/mission-validation-runner";

// Passage quotidien du module Prestataires (ADR 0084) — 7 h UTC, soit 8 h à Bruxelles en hiver
// (9 h en été) : à la prise de service, pas la veille au soir. Gardé par CRON_SECRET comme les autres crons.
// Deux travaux indépendants : les rappels de tournage (J-7, J-2, veille) et la validation automatique des
// livraisons restées sans réponse (rappels à J+3 et J+5, validation à J+7). L'un en panne (migration
// absente) n'arrête pas l'autre ; 503 seulement si les deux sont à l'arrêt, et RIEN n'est alors envoyé.

export const maxDuration = 120;

export async function GET(request: Request) {
  const authHeader = request.headers.get("authorization");
  if (!process.env.CRON_SECRET || authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Non autorisé." }, { status: 401 });
  }
  const [reminders, validation] = await Promise.all([runMissionReminders(), runAutoValidation()]);
  if (!reminders.ok && !validation.ok) {
    return NextResponse.json({ error: "Module Prestataires indisponible : migrations non appliquées ?", reminders, validation }, { status: 503 });
  }
  return NextResponse.json({ reminders, validation });
}
