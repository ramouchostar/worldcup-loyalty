import { emailShell, emailHeading, emailParagraph, emailButton, emailDivider, emailFootNote, emailList } from "./layout";
import { AREA_LABEL, BACKLOG_PEOPLE, priorityLabel, type BacklogItem } from "../backlog-model";

// Récap fondateurs (app/api/cron/founder-digest-daily + -weekly) — le seul
// email de ce module qui ne parle à aucun membre ni restaurateur : c'est un
// rapport d'activité interne, pas une communication produit. D'où l'absence
// d'établissement/logo (toujours le wordmark Boosteats par défaut) et
// l'absence de ligne email_log (sendFounderDigestEmail, lib/email.ts).

const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? "https://worldcup-loyalty.vercel.app";
const BACKLOG_URL = `${APP_URL}/platform/backlog`;

export type DigestCommit = { message: string; kind: "fix" | "feat" | "chore" | "other"; author: string };

function firstLine(message: string): string {
  return message.split("\n")[0];
}

function commitLine(c: DigestCommit): string {
  return `${firstLine(c.message)} <span style="color:#8A9280;">— ${c.author}</span>`;
}

function taskLine(item: BacklogItem): string {
  return `${item.title} <span style="color:#8A9280;">— ${priorityLabel(item)} · ${AREA_LABEL[item.area]}</span>`;
}

function plural(n: number, word: string): string {
  return `${n} ${word}${n > 1 ? "s" : ""}`;
}

// `plural()` ne fléchit que le mot final — insuffisant pour un groupe où les
// deux mots s'accordent ("bugs résolus", "autres changements").
function bugsLabel(n: number): string {
  if (n === 0) return "Aucun bug résolu";
  return n === 1 ? "1 bug résolu" : `${n} bugs résolus`;
}
function changesLabel(n: number): string {
  return n === 1 ? "1 autre changement" : `${n} autres changements`;
}

export function dailyDigestEmail({
  dateLabel,
  openByPerson,
  doneToday,
  commits,
}: {
  dateLabel: string;
  openByPerson: { person: string; items: BacklogItem[] }[];
  doneToday: BacklogItem[];
  commits: DigestCommit[];
}): { subject: string; html: string; text: string } {
  const subject = `Récap du jour — ${dateLabel}`;
  const fixCount = commits.filter((c) => c.kind === "fix").length;
  const featCount = commits.filter((c) => c.kind === "feat").length;

  const blocks: string[] = [emailHeading(`Récap du ${dateLabel}`)];

  for (const { person, items } of openByPerson) {
    blocks.push(emailParagraph(`<strong>${person}</strong> — ${plural(items.length, "tâche ouverte")}`));
    if (items.length > 0) blocks.push(emailList(items.slice(0, 6).map(taskLine)));
  }

  blocks.push(emailDivider());
  blocks.push(
    emailParagraph(
      doneToday.length > 0
        ? `<strong>${plural(doneToday.length, "tâche terminée")}</strong> aujourd'hui`
        : "Rien de marqué « fait » aujourd'hui."
    )
  );
  if (doneToday.length > 0) blocks.push(emailList(doneToday.map(taskLine)));

  blocks.push(emailDivider());
  blocks.push(
    emailParagraph(
      commits.length > 0
        ? `<strong>${plural(commits.length, "commit")}</strong> aujourd'hui (${fixCount} fix, ${featCount} feat)`
        : "Aucun commit aujourd'hui."
    )
  );
  if (commits.length > 0) blocks.push(emailList(commits.slice(0, 10).map(commitLine)));

  blocks.push(emailButton("Voir le backlog →", BACKLOG_URL));
  blocks.push(emailDivider());
  blocks.push(emailFootNote("Récap automatique quotidien — Boosteats / worldcup-loyalty."));

  const html = emailShell(subject, blocks.join("\n"));

  const text: string[] = [`Récap du ${dateLabel}`, ""];
  for (const { person, items } of openByPerson) {
    text.push(`${person} — ${plural(items.length, "tâche ouverte")}`);
    items.slice(0, 6).forEach((i) => text.push(`  - ${i.title} (${priorityLabel(i)})`));
    text.push("");
  }
  text.push(doneToday.length > 0 ? `${plural(doneToday.length, "tâche terminée")} aujourd'hui :` : "Rien de terminé aujourd'hui.");
  doneToday.forEach((i) => text.push(`  - ${i.title}`));
  text.push("", commits.length > 0 ? `${plural(commits.length, "commit")} aujourd'hui (${fixCount} fix, ${featCount} feat) :` : "Aucun commit aujourd'hui.");
  commits.slice(0, 10).forEach((c) => text.push(`  - ${firstLine(c.message)}`));
  text.push("", `Backlog : ${BACKLOG_URL}`);

  return { subject, html, text: text.join("\n") };
}

export function weeklyDigestEmail({
  weekLabel,
  doneThisWeek,
  commits,
}: {
  weekLabel: string;
  doneThisWeek: BacklogItem[];
  commits: DigestCommit[];
}): { subject: string; html: string; text: string } {
  const subject = `Récap de la semaine — ${weekLabel}`;
  const fixes = commits.filter((c) => c.kind === "fix");
  const feats = commits.filter((c) => c.kind === "feat");
  const others = commits.filter((c) => c.kind !== "fix" && c.kind !== "feat");

  const donePerPerson = BACKLOG_PEOPLE.map((person) => ({
    person,
    items: doneThisWeek.filter((i) => i.owner === person),
  }));
  const doneUnassigned = doneThisWeek.filter(
    (i) => !i.owner || !BACKLOG_PEOPLE.includes(i.owner as (typeof BACKLOG_PEOPLE)[number])
  );

  const blocks: string[] = [emailHeading(`Semaine du ${weekLabel}`)];

  blocks.push(emailParagraph(`<strong>${plural(doneThisWeek.length, "tâche terminée")}</strong> cette semaine.`));
  for (const { person, items } of donePerPerson) {
    if (items.length === 0) continue;
    blocks.push(emailParagraph(`<strong>${person}</strong> (${items.length})`));
    blocks.push(emailList(items.map(taskLine)));
  }
  if (doneUnassigned.length > 0) {
    blocks.push(emailParagraph(`<strong>Non attribuées</strong> (${doneUnassigned.length})`));
    blocks.push(emailList(doneUnassigned.map(taskLine)));
  }

  blocks.push(emailDivider());
  blocks.push(emailParagraph(`<strong>${bugsLabel(fixes.length)}</strong>`));
  if (fixes.length > 0) blocks.push(emailList(fixes.map(commitLine)));

  blocks.push(emailParagraph(`<strong>${plural(feats.length, "avancée")}</strong>`));
  if (feats.length > 0) blocks.push(emailList(feats.map(commitLine)));

  if (others.length > 0) {
    blocks.push(emailParagraph(`<strong>${changesLabel(others.length)}</strong>`));
    blocks.push(emailList(others.slice(0, 10).map(commitLine)));
  }

  blocks.push(emailButton("Voir le backlog →", BACKLOG_URL));
  blocks.push(emailDivider());
  blocks.push(emailFootNote("Récap automatique hebdomadaire (vendredi) — Boosteats / worldcup-loyalty."));

  const html = emailShell(subject, blocks.join("\n"));

  const text: string[] = [`Semaine du ${weekLabel}`, "", `${plural(doneThisWeek.length, "tâche terminée")} cette semaine.`];
  for (const { person, items } of donePerPerson) {
    if (items.length === 0) continue;
    text.push(`${person} (${items.length})`);
    items.forEach((i) => text.push(`  - ${i.title}`));
  }
  if (doneUnassigned.length > 0) {
    text.push(`Non attribuées (${doneUnassigned.length})`);
    doneUnassigned.forEach((i) => text.push(`  - ${i.title}`));
  }
  text.push("", `${bugsLabel(fixes.length)} :`);
  fixes.forEach((c) => text.push(`  - ${firstLine(c.message)}`));
  text.push("", `${plural(feats.length, "avancée")} :`);
  feats.forEach((c) => text.push(`  - ${firstLine(c.message)}`));
  text.push("", `Backlog : ${BACKLOG_URL}`);

  return { subject, html, text: text.join("\n") };
}
