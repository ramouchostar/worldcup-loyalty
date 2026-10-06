import { NextResponse } from "next/server";
import { syncSchoolHolidays } from "@/lib/signals/school-holidays-sync";

// ADR 0027 §5 (amendé 2026-10-06) — synchronisation hebdomadaire des vacances
// scolaires belges (FR / NL / DE) depuis OpenHolidays vers `reference_calendar`.
// Les dates bougent rarement : un passage par semaine suffit. Chaque passage
// écrit une ligne dans `signal_sync_runs`, réussi ou non.
export async function GET(request: Request) {
  const authHeader = request.headers.get("authorization");
  if (!process.env.CRON_SECRET || authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Non autorisé." }, { status: 401 });
  }

  const result = await syncSchoolHolidays();
  return NextResponse.json(result, { status: result.ok ? 200 : 502 });
}
