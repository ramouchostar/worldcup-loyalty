import { NextResponse } from "next/server";
import { runMemberSequences } from "@/lib/sequence-runner";

// Passage quotidien des séquences (ADR 0063, PR 3) — 16 h UTC, soit 18 h à
// Bruxelles en été (17 h en hiver) : le moment du « lendemain 18 h » des
// séquences membres. Gardé par CRON_SECRET comme les autres crons.

export const maxDuration = 300;

export async function GET(request: Request) {
  const authHeader = request.headers.get("authorization");
  if (!process.env.CRON_SECRET || authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Non autorisé." }, { status: 401 });
  }
  const members = await runMemberSequences();
  return NextResponse.json({ members });
}
