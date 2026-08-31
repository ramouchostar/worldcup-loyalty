import { NextResponse } from "next/server";
import { listBacklog } from "@/lib/backlog";
import { weeklyDigestEmail } from "@/lib/email-templates/founder-digest";
import { fetchCommitsSince } from "@/lib/github-activity";
import { sendFounderDigestEmail } from "@/lib/email";

// Récap hebdomadaire aux deux associés (Mehdi, demande du 2026-08-29),
// vendredi soir (vercel.json) : priorités accomplies, tâches terminées,
// bugs résolus (commits `fix:`) vs avancées (`feat:`) sur les 7 derniers
// jours. Même logique de fenêtre glissante que le digest quotidien —
// "depuis 7 jours" plutôt qu'un calcul de semaine calendaire.
export async function GET(request: Request) {
  const authHeader = request.headers.get("authorization");
  if (!process.env.CRON_SECRET || authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Non autorisé." }, { status: 401 });
  }

  const now = new Date();
  const since = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  const sinceIso = since.toISOString();

  const [items, commits] = await Promise.all([listBacklog(), fetchCommitsSince(sinceIso)]);

  const doneThisWeek = items.filter((i) => i.status === "fait" && i.done_at !== null && i.done_at >= sinceIso);

  const fmt = (d: Date) => d.toLocaleDateString("fr-BE", { day: "numeric", month: "short", timeZone: "Europe/Brussels" });
  const weekLabel = `${fmt(since)} au ${fmt(now)}`;

  const content = weeklyDigestEmail({
    weekLabel,
    doneThisWeek,
    commits: commits.map((c) => ({ message: c.message, kind: c.kind, author: c.author })),
  });

  const result = await sendFounderDigestEmail(content);
  return NextResponse.json({ ok: true, ...result, commits: commits.length, done: doneThisWeek.length });
}
