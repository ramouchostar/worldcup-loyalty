import { NextResponse } from "next/server";
import { listBacklog } from "@/lib/backlog";
import { BACKLOG_PEOPLE, OPEN_STATUSES, sortByPriority } from "@/lib/backlog-model";
import { fetchCommitsSince } from "@/lib/github-activity";
import { dailyDigestEmail } from "@/lib/email-templates/founder-digest";
import { sendFounderDigestEmail } from "@/lib/email";

// Récap quotidien aux deux associés (Mehdi, demande du 2026-08-29) : tâches
// backlog restantes chacun de son côté, ce qui a été terminé et commité dans
// les dernières 24h. Fenêtre glissante plutôt que jour calendaire Bruxelles :
// le cron tourne toujours à la même heure UTC (vercel.json), "depuis le
// dernier envoi" est donc exactement "depuis 24h" — pas de calcul de fuseau
// horaire à refaire, pas de trou ni de recouvrement entre deux envois.
export async function GET(request: Request) {
  const authHeader = request.headers.get("authorization");
  if (!process.env.CRON_SECRET || authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Non autorisé." }, { status: 401 });
  }

  const now = new Date();
  const since = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  const sinceIso = since.toISOString();

  const [items, commits] = await Promise.all([listBacklog(), fetchCommitsSince(sinceIso)]);

  const openByPerson = BACKLOG_PEOPLE.map((person) => ({
    person,
    items: sortByPriority(items.filter((i) => i.owner === person && OPEN_STATUSES.includes(i.status))),
  }));
  const doneToday = items.filter((i) => i.status === "fait" && i.done_at !== null && i.done_at >= sinceIso);

  const dateLabel = now.toLocaleDateString("fr-BE", {
    weekday: "long",
    day: "numeric",
    month: "long",
    timeZone: "Europe/Brussels",
  });

  const content = dailyDigestEmail({
    dateLabel,
    openByPerson,
    doneToday,
    commits: commits.map((c) => ({ message: c.message, kind: c.kind, author: c.author })),
  });

  const result = await sendFounderDigestEmail(content);
  return NextResponse.json({ ok: true, ...result, commits: commits.length, doneToday: doneToday.length });
}
