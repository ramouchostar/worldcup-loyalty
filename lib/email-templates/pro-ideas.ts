import { ASSISTANTS, type AssistantId } from "../agents/types";
import { MAIL, appLink, button, esc, eyebrow, heading, paragraph, proShell, small, type RenderedEmail } from "./kit";

// Le message du matin de la brigade (ADR 0089 §6, Brigade 05) : « Hugo et Emma
// ont 2 idées pour toi ». Un seul par établissement et par jour, seulement s'il
// y a au moins une idée à décider. Il dit QUI propose et QUOI (le titre de
// chaque idée), jamais les montants : ils sont sur la carte, derrière la
// connexion — tout ce qui dépense exige d'être connecté.

export type MorningIdea = { assistant: AssistantId; title: string; question: string };

/** « Hugo », « Hugo et Emma », « Hugo, Emma et Léa » — chaque prénom une fois, dans l'ordre des idées. */
export function assistantNames(ideas: Pick<MorningIdea, "assistant">[]): string {
  const names = Array.from(new Set(ideas.map((i) => ASSISTANTS[i.assistant].name)));
  if (names.length <= 1) return names[0] ?? "";
  return `${names.slice(0, -1).join(", ")} et ${names[names.length - 1]}`;
}

export function morningSubject(ideas: Pick<MorningIdea, "assistant">[]): string {
  const who = assistantNames(ideas);
  const plural = new Set(ideas.map((i) => i.assistant)).size > 1;
  const n = ideas.length;
  return `${who} ${plural ? "ont" : "a"} ${n} ${n > 1 ? "idées" : "idée"} pour toi`;
}

export function proIdeasEmail(p: { restaurantName: string; restaurantId: string; logoUrl?: string | null; ideas: MorningIdea[] }): RenderedEmail {
  const url = appLink(`/admin/${p.restaurantId}/idees`);
  const subject = morningSubject(p.ideas);
  const preheader = `${p.ideas[0]?.title ?? ""} · 5 minutes suffisent.`.slice(0, 120);
  const cards = p.ideas
    .map((i) => {
      const a = ASSISTANTS[i.assistant];
      return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 10px; border:1px solid ${MAIL.line}; border-radius:14px;">
  <tr>
    <td width="56" valign="top" style="padding:14px 0 14px 14px;"><img src="${appLink(a.photo)}" alt="${esc(a.name)}" width="40" height="40" style="display:block; width:40px; height:40px; border-radius:20px; border:0;" /></td>
    <td valign="top" style="padding:14px 14px 14px 10px;">
      <div style="color:${MAIL.muted}; font-size:12px; line-height:1.4;">${esc(a.name)} · ${esc(a.post)}</div>
      <div style="color:${MAIL.ink}; font-size:15px; font-weight:700; line-height:1.4; margin-top:2px;">${esc(i.title)}</div>
      <div style="color:${MAIL.body}; font-size:14px; line-height:1.5;">${esc(i.question)}</div>
    </td>
  </tr>
</table>`;
    })
    .join("\n");

  const html = proShell({
    restaurantName: p.restaurantName,
    logoUrl: p.logoUrl ?? null,
    kicker: "Idées du jour",
    subject,
    preheader,
    body: [
      eyebrow("Idées du jour"),
      heading(subject),
      paragraph("Tes assistants ont préparé le travail. Tu n'as qu'à dire <strong>oui</strong> ou <strong>non</strong> : 5 minutes suffisent."),
      cards,
      button("Voir mes idées", url, "#0C1509"),
      small("Rien ne part sans ton « Oui ». Les idées sans réponse s'effacent à leur date limite."),
    ].join("\n"),
    footer: {
      reason: `Tu reçois cet e-mail parce que tu gères ${p.restaurantName} sur Boosteats et que tes assistants ont des idées pour toi aujourd'hui.`,
      manageUrl: appLink(`/admin/${p.restaurantId}/idees`),
      manageLabel: "Mes idées",
    },
  });
  const text = [
    subject,
    "",
    "Tes assistants ont préparé le travail. Tu n'as qu'à dire oui ou non : 5 minutes suffisent.",
    "",
    ...p.ideas.map((i) => `- ${ASSISTANTS[i.assistant].name} : ${i.title} ${i.question}`),
    "",
    `Voir mes idées : ${url}`,
    "",
    "Rien ne part sans ton « Oui ». Les idées sans réponse s'effacent à leur date limite.",
  ].join("\n");
  return { subject, preheader, html, text };
}
