"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, X } from "lucide-react";
import { Card, SectionLabel } from "@/components/admin/ui";
import { FilePicker } from "@/components/missions/FilePicker";
import { IDEA_MAX, IDEA_MIN, MAX_PROPOSALS, MIN_PROPOSALS, ONSITE_MAX, PROPOSAL_ISSUE_TEXT, TITLE_MAX, type ProposalIssue } from "@/lib/mission-proposals";
import { MAX_PER_PROPOSAL } from "@/lib/mission-files";

// ADR 0084 §5 — les idées de tournage : 2 ou 3, la PREMIÈRE est celle qu'on recommande. Pour chacune : un titre,
// l'idée en quelques phrases, ce qu'il faut prévoir sur place (plats, personnes) et un lien d'exemple.
// Sur une seconde série, les raisons du restaurateur sont lues AVANT d'écrire (une seule nouvelle série possible).

const input = "w-full border border-paper-border rounded-xl px-3 py-2.5 text-[14px] text-ink bg-white focus:outline-none focus-visible:ring-2 focus-visible:ring-boost-olive";
const primary = "w-full inline-flex items-center justify-center min-h-[44px] px-5 rounded-xl bg-boost-olive text-white text-[14px] font-semibold shadow-[inset_0_-3px_0_#4F5C2D] hover:brightness-95 disabled:opacity-60";

type Draft = { title: string; idea: string; onsite: string; link: string; files: string[] };
const blank = (): Draft => ({ title: "", idea: "", onsite: "", link: "", files: [] });

export type RejectedIdea = { title: string; reason: string };

export function ProposalsForm({ missionId, deadlineLabel, second, rejected }: { missionId: string; deadlineLabel: string; second: boolean; rejected: RejectedIdea[] }) {
  const router = useRouter();
  const [drafts, setDrafts] = useState<Draft[]>([blank(), blank()]);
  const [issues, setIssues] = useState<ProposalIssue[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const setFiles = (i: number, files: string[]) => setDrafts((d) => d.map((x, j) => (j === i ? { ...x, files } : x)));
  const set = (i: number, k: Exclude<keyof Draft, "files">, v: string) => setDrafts((d) => d.map((x, j) => (j === i ? { ...x, [k]: v } : x)));
  const problem = (i: number, field: Exclude<keyof Draft, "files">) => {
    const p = issues.find((x) => x.index === i && x.field === field);
    return p ? PROPOSAL_ISSUE_TEXT[p.code] : null;
  };

  async function send() {
    setBusy(true);
    setError(null);
    setIssues([]);
    try {
      const res = await fetch(`/api/prestataire/missions/${missionId}/proposals`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ proposals: drafts }) });
      const body = await res.json().catch(() => ({}));
      if (res.ok) return router.refresh();
      if (res.status === 422 && Array.isArray(body.issues)) setIssues(body.issues as ProposalIssue[]);
      setError(body.error ?? "Impossible pour le moment. Réessaie.");
    } catch {
      setError("Pas de connexion. Réessaie dans un instant.");
    } finally {
      setBusy(false);
    }
  }

  const general = issues.filter((i) => i.index === undefined);

  return (
    <Card className="space-y-5">
      <div>
        <SectionLabel>{second ? "Une nouvelle série d'idées" : "Tes idées de tournage"}</SectionLabel>
        <p className="text-ink-muted text-[13.5px] mt-1">
          Propose {MIN_PROPOSALS} ou {MAX_PROPOSALS} idées, <span className="font-semibold text-ink">la première étant celle que tu recommandes</span> : sans réponse du restaurateur, c&apos;est elle qui est retenue. À déposer avant {deadlineLabel}.
        </p>
        {second && <p className="text-warn text-[13.5px] font-semibold mt-1">C&apos;est la seule nouvelle série possible. Si elle ne vient pas à temps, ta première idée est retenue.</p>}
      </div>

      {rejected.length > 0 && (
        <div className="rounded-xl border border-paper-border bg-paper-subtle p-3 space-y-2">
          <p className="text-[13px] font-semibold text-ink">Ce que le restaurateur a répondu</p>
          <ul className="space-y-1.5">
            {rejected.map((r) => (
              <li key={r.title} className="text-[13.5px] text-ink">
                <span className="font-semibold">{r.title}</span> — <span className="text-ink-muted whitespace-pre-line">{r.reason}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {drafts.map((d, i) => (
        <fieldset key={i} className="space-y-3 rounded-2xl border border-paper-border p-4">
          <legend className="px-1 text-[13px] font-bold text-ink">
            Idée {i + 1}
            {i === 0 && <span className="ml-1.5 font-normal text-boost-olive">· ma recommandation</span>}
          </legend>
          {i >= MIN_PROPOSALS && (
            <button type="button" onClick={() => setDrafts((x) => x.filter((_, j) => j !== i))} aria-label={`Retirer l'idée ${i + 1}`} className="float-right -mt-8 w-10 h-10 rounded-full flex items-center justify-center hover:bg-paper-subtle">
              <X className="w-4 h-4" aria-hidden />
            </button>
          )}
          <div className="space-y-1">
            <label htmlFor={`t${i}`} className="block text-[14px] font-semibold text-ink">Titre</label>
            <input id={`t${i}`} value={d.title} onChange={(e) => set(i, "title", e.target.value)} maxLength={TITLE_MAX} placeholder="Ex. : Le geste du chef, en gros plan" className={input} />
            {problem(i, "title") && <p role="alert" className="text-danger text-[13px] font-semibold">{problem(i, "title")}</p>}
          </div>
          <div className="space-y-1">
            <label htmlFor={`i${i}`} className="block text-[14px] font-semibold text-ink">L&apos;idée, en quelques phrases</label>
            <textarea id={`i${i}`} value={d.idea} onChange={(e) => set(i, "idea", e.target.value)} rows={4} maxLength={IDEA_MAX} className={input} />
            <p className="text-[12px] text-ink-faint">{d.idea.trim().length < IDEA_MIN ? `${IDEA_MIN} caractères au moins.` : `${d.idea.trim().length} / ${IDEA_MAX}`}</p>
            {problem(i, "idea") && <p role="alert" className="text-danger text-[13px] font-semibold">{problem(i, "idea")}</p>}
          </div>
          <div className="space-y-1">
            <label htmlFor={`o${i}`} className="block text-[14px] font-semibold text-ink">Ce qu&apos;il faut prévoir sur place</label>
            <textarea id={`o${i}`} value={d.onsite} onChange={(e) => set(i, "onsite", e.target.value)} rows={2} maxLength={ONSITE_MAX} placeholder="Ex. : 3 plats prêts, le cuisinier et un serveur" className={input} />
            {problem(i, "onsite") && <p role="alert" className="text-danger text-[13px] font-semibold">{problem(i, "onsite")}</p>}
          </div>
          <div className="space-y-1">
            <label htmlFor={`l${i}`} className="block text-[14px] font-semibold text-ink">Un exemple (lien)</label>
            <input id={`l${i}`} value={d.link} onChange={(e) => set(i, "link", e.target.value)} inputMode="url" placeholder="https://…" className={input} />
            {problem(i, "link") && <p role="alert" className="text-danger text-[13px] font-semibold">{problem(i, "link")}</p>}
          </div>
          <div className="space-y-1.5">
            <p className="text-[14px] font-semibold text-ink">
              Une image ou un PDF de référence <span className="font-normal text-ink-faint">· facultatif</span>
            </p>
            <FilePicker endpoint={`/api/prestataire/missions/${missionId}/files`} scope="proposal" max={MAX_PER_PROPOSAL} onChange={(f) => setFiles(i, f.map((x) => x.id))} label="Joindre un fichier" />
          </div>
        </fieldset>
      ))}

      {drafts.length < MAX_PROPOSALS && (
        <button type="button" onClick={() => setDrafts((x) => [...x, blank()])} className="inline-flex items-center gap-1 min-h-[44px] px-4 rounded-xl border border-paper-border bg-white text-ink text-[14px] font-semibold">
          <Plus className="w-4 h-4" aria-hidden /> Ajouter une troisième idée
        </button>
      )}

      {general.length > 0 && (
        <ul role="alert" className="text-danger text-[13px] font-semibold space-y-0.5">
          {general.map((g, k) => (
            <li key={k}>{PROPOSAL_ISSUE_TEXT[g.code]}</li>
          ))}
        </ul>
      )}
      {error && (
        <p role="alert" className="text-danger text-[13.5px] font-semibold">
          {error}
        </p>
      )}
      <button type="button" disabled={busy} onClick={send} className={primary}>
        {busy ? "Envoi…" : "Envoyer mes idées"}
      </button>
      <p className="text-[12.5px] text-ink-muted text-center">Une fois choisie par le restaurateur, une idée ne change plus.</p>
    </Card>
  );
}
