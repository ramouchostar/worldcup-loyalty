import { NextResponse } from "next/server";
import { runProSequences } from "@/lib/pro-sequence-runner";
import { getTiming } from "@/lib/send-timing-data";

// Séquences restaurateur (ADR 0077) — toutes les 30 minutes : chaque envoi
// part au premier passage après son créneau (9 h, 11 h, 15 h, 17 h 30 à
// Bruxelles). Entre deux créneaux, le passage ne fait que lire et repartir.
// Gardé par CRON_SECRET comme les autres crons.

export const maxDuration = 300;

export async function GET(request: Request) {
  const authHeader = request.headers.get("authorization");
  if (!process.env.CRON_SECRET || authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Non autorisé." }, { status: 401 });
  }
  // Heure fixée par la plateforme (« Meilleures heures »), sinon rotation.
  const restaurants = await runProSequences(new Date(), await getTiming());
  return NextResponse.json({ restaurants });
}
