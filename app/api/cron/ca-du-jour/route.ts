import { NextResponse } from "next/server";
import { runCaReminders } from "@/lib/daily-revenue-reminders-runner";

// ADR 0087 §4 — rappels du CA du jour, toutes les heures (vercel.json, à 5 de
// l'heure). Les créneaux (soir après la fermeture, 10 h, 15 h, 18 h, dimanche
// 15 h) se décident à l'heure de Bruxelles dans lib/daily-revenue-reminders.ts :
// la tâche ne dépend pas du décalage UTC ni de l'heure d'été.
export async function GET(request: Request) {
  const authHeader = request.headers.get("authorization");
  if (!process.env.CRON_SECRET || authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Non autorisé." }, { status: 401 });
  }
  try {
    return NextResponse.json(await runCaReminders());
  } catch (e) {
    console.error("[cron/ca-du-jour]", e);
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
