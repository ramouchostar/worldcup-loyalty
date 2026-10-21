import { NextResponse } from "next/server";
import { runMissionReminders } from "@/lib/mission-reminders-runner";
import { runAutoValidation } from "@/lib/mission-validation-runner";
import { runProposalsPass } from "@/lib/missions-proposals";
import { cleanupFiles } from "@/lib/missions-files";
import { runChangesPass } from "@/lib/missions-changes";
import { runStudioReminders } from "@/lib/missions-studio-reminders";

// Passage quotidien du module Prestataires (ADR 0084) — 7 h UTC, soit 8 h à Bruxelles en hiver
// (9 h en été) : à la prise de service, pas la veille au soir. Gardé par CRON_SECRET comme les autres crons.
// Trois travaux indépendants : les rappels de tournage (J-7, J-2, veille), la validation automatique des
// livraisons restées sans réponse (rappels à J+3 et J+5, validation à J+7) et les propositions créatives
// (rappels, idée retenue d'office à J-2). L'un en panne (migration absente) n'arrête pas les autres ;
// 503 seulement si les trois sont à l'arrêt, et RIEN n'est alors envoyé.

export const maxDuration = 120;

export async function GET(request: Request) {
  const authHeader = request.headers.get("authorization");
  if (!process.env.CRON_SECRET || authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Non autorisé." }, { status: 401 });
  }
  const [reminders, validation, proposals, files, changes, studio] = await Promise.all([runMissionReminders(), runAutoValidation(), runProposalsPass(), cleanupFiles(), runChangesPass(), runStudioReminders()]);
  if (!reminders.ok && !validation.ok && !proposals.ok) {
    return NextResponse.json({ error: "Module Prestataires indisponible : migrations non appliquées ?", reminders, validation, proposals }, { status: 503 });
  }
  return NextResponse.json({ reminders, validation, proposals, files, changes, studio });
}
