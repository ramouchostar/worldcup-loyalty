import { NextResponse } from "next/server";
import { purgeReport } from "@/lib/missions-purge";
import { PURGE_MONTHS } from "@/lib/mission-purge";

// ADR 0084 §5 quaterdecies — Rapport hebdomadaire de purge des missions : ce qu'on effacerait douze mois après la fin d'une mission.
// À BLANC : il compte, il n'efface rien (interrupteur volontairement absent tant que le juriste n'a pas validé durée et liste).
export async function GET(request: Request) {
  const authHeader = request.headers.get("authorization");
  if (!process.env.CRON_SECRET || authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Non autorisé." }, { status: 401 });
  }
  const report = await purgeReport();
  return NextResponse.json({ ok: true, retention_months: PURGE_MONTHS, ...report });
}
