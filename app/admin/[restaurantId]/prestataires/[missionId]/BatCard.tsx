"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Check, ExternalLink, FileCheck2, Plus, X } from "lucide-react";
import { Card, SectionLabel } from "@/components/admin/ui";
import { linkHost } from "@/lib/mission-dayof";
import { BAT_NOTE_CATEGORIES, SIGN_ISSUE_TEXT, SIGN_NAME_MAX, type BatCheck, type BatPhase, type CorrectionIssue, type SignIssue } from "@/lib/mission-print";
import { checkRetouchNote } from "@/lib/mission-brief";
import { RETOUCH_ISSUE_TEXT } from "@/lib/mission-retouch";

// ADR 0084 §5 bis — le bon à tirer (BAT) : le dernier regard avant l'impression. Le restaurateur vérifie l'épreuve point par
// point et la SIGNE, ou demande des corrections (deux tours, chacun en un seul envoi). Une fois signé, c'est exactement ce qui
// sera imprimé : on n'annule plus, et une erreur visible sur le bon à tirer n'est pas réimprimée gratuitement.

export type ProofView = { id: string; round: number; status: "proposed" | "corrections" | "signed"; links: string[]; message: string | null; corrections: { category: string; text: string }[] | null; signedName: string | null; signedAt: string | null };

const primary = "w-full inline-flex items-center justify-center min-h-[44px] px-5 rounded-xl bg-boost-olive text-white text-[14px] font-semibold shadow-[inset_0_-3px_0_#4F5C2D] hover:brightness-95 disabled:opacity-50";
const ghost = "inline-flex items-center justify-center min-h-[44px] px-4 rounded-xl border border-paper-border bg-white text-ink text-[14px] font-semibold disabled:opacity-60";
const field = "w-full border border-paper-border rounded-xl px-3 py-2.5 text-[14px] text-ink bg-white focus:outline-none focus-visible:ring-2 focus-visible:ring-boost-olive";

async function post(url: string, body: unknown) {
  const res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  return { ok: res.ok, status: res.status, data: (await res.json().catch(() => ({}))) as Record<string, unknown> };
}

const dateFr = (iso: string) => new Date(iso).toLocaleDateString("fr-BE", { day: "numeric", month: "long", timeZone: "Europe/Brussels" });

export function BatCard({
  restaurantId,
  missionId,
  providerName,
  phase,
  proofs,
  checklist,
  summary,
  correctionsLeft,
}: {
  restaurantId: string;
  missionId: string;
  providerName: string;
  phase: BatPhase;
  proofs: ProofView[];
  checklist: BatCheck[];
  summary: { label: string; value: string }[];
  correctionsLeft: number;
}) {
  const router = useRouter();
  const last = proofs.at(-1) ?? null;
  const signed = proofs.find((p) => p.status === "signed") ?? null;
  const [checks, setChecks] = useState<Record<string, boolean>>({});
  const [name, setName] = useState("");
  const [correcting, setCorrecting] = useState(false);
  const [notes, setNotes] = useState<{ category: string; text: string }[]>([]);
  const [category, setCategory] = useState<string | null>(null);
  const [text, setText] = useState("");
  const [draftError, setDraftError] = useState<string | null>(null);
  const [problems, setProblems] = useState<CorrectionIssue[]>([]);
  const [signIssues, setSignIssues] = useState<SignIssue[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const allChecked = checklist.every((c) => checks[c.key] === true);
  const nameOk = name.trim().length >= 3;

  async function run(key: string, url: string, body: Record<string, unknown>) {
    setBusy(key);
    setError(null);
    setSignIssues([]);
    setProblems([]);
    try {
      const r = await post(url, { restaurantId, ...body });
      if (r.ok) return router.refresh();
      if (r.status === 422 && Array.isArray(r.data.issues)) setSignIssues(r.data.issues as SignIssue[]);
      if (r.status === 422 && Array.isArray(r.data.problems)) setProblems(r.data.problems as CorrectionIssue[]);
      setError((r.data.error as string) ?? "Impossible pour le moment. Réessaie.");
    } catch {
      setError("Pas de connexion. Réessaie dans un instant.");
    } finally {
      setBusy(null);
    }
  }

  function addNote() {
    const issue = checkRetouchNote({ category, text }, BAT_NOTE_CATEGORIES);
    if (issue) return setDraftError(RETOUCH_ISSUE_TEXT[issue]);
    setNotes((n) => [...n, { category: category as string, text: text.trim() }]);
    setCategory(null);
    setText("");
    setDraftError(null);
  }

  if (signed) {
    return (
      <Card className="space-y-2">
        <SectionLabel>Bon à tirer</SectionLabel>
        <p className="text-[14px] text-good font-semibold inline-flex items-center gap-1.5">
          <FileCheck2 className="w-4 h-4" aria-hidden /> Signé par {signed.signedName}
          {signed.signedAt ? ` le ${dateFr(signed.signedAt)}` : ""}
        </p>
        <p className="text-[13.5px] text-ink-muted">L&apos;impression est lancée. Tu seras prévenu à la livraison. On ne change plus rien : c&apos;est exactement ce que tu as signé.</p>
        {signed.links.map((l) => (
          <a key={l} href={l} target="_blank" rel="noopener noreferrer nofollow" className="inline-flex items-center gap-1 text-[13px] font-semibold text-ink underline underline-offset-2 min-h-[32px]">
            Revoir l&apos;épreuve signée ({linkHost(l)}) <ExternalLink className="w-3.5 h-3.5" aria-hidden />
          </a>
        ))}
      </Card>
    );
  }

  if (phase === "none") {
    return (
      <Card className="space-y-1">
        <SectionLabel>Bon à tirer</SectionLabel>
        <p className="text-[13.5px] text-ink-muted">{providerName} prépare ton épreuve. Tu la recevras par e-mail : tu la vérifieras point par point avant que rien ne soit imprimé.</p>
      </Card>
    );
  }

  return (
    <Card className="space-y-5">
      <div>
        <SectionLabel>{last && last.round > 1 ? `Bon à tirer · épreuve ${last.round}` : "Bon à tirer"}</SectionLabel>
        <p className="text-[13.5px] text-ink-muted mt-1">Vérifie avant d&apos;imprimer. Une fois signé, c&apos;est exactement ce qui sera imprimé : une erreur visible sur le bon à tirer n&apos;est pas réimprimée gratuitement.</p>
      </div>

      {proofs.filter((p) => p.status === "corrections").length > 0 && (
        <div className="rounded-xl border border-paper-border bg-paper-subtle p-3 space-y-1.5">
          <p className="text-[12.5px] font-semibold text-ink-muted">Tes corrections précédentes</p>
          {proofs
            .filter((p) => p.status === "corrections")
            .map((p) => (
              <p key={p.id} className="text-[13px] text-ink">
                Épreuve {p.round} : {(p.corrections ?? []).length} correction{(p.corrections ?? []).length > 1 ? "s" : ""}
              </p>
            ))}
        </div>
      )}

      {phase === "corrections" && <p className="text-[13.5px] text-ink">{providerName} corrige. Tu recevras une nouvelle épreuve par e-mail.</p>}

      {phase === "awaiting_review" && last && (
        <>
          <dl className="grid grid-cols-2 gap-x-4 gap-y-2 rounded-xl border border-paper-border p-3">
            {summary.map((r) => (
              <div key={r.label}>
                <dt className="text-[12px] text-ink-faint">{r.label}</dt>
                <dd className="text-[14px] text-ink font-semibold">{r.value}</dd>
              </div>
            ))}
          </dl>
          <ul className="space-y-2">
            {last.links.map((l) => (
              <li key={l}>
                <a href={l} target="_blank" rel="noopener noreferrer nofollow" className="flex items-center gap-2 min-h-[44px] px-3 rounded-xl border border-paper-border bg-white text-[14px] text-ink hover:bg-paper-subtle">
                  <ExternalLink className="w-4 h-4 shrink-0 text-ink-muted" aria-hidden />
                  <span className="flex-1 min-w-0">
                    <span className="block font-semibold">Ouvrir l&apos;épreuve</span>
                    <span className="block text-[12.5px] text-ink-muted truncate">{linkHost(l)}</span>
                  </span>
                </a>
              </li>
            ))}
          </ul>
          {last.message && <p className="text-[14px] text-ink whitespace-pre-line">{last.message}</p>}

          {!correcting ? (
            <div className="space-y-4 border-t border-paper-border pt-4">
              <p className="text-[14px] font-semibold text-ink">Coche chaque point, puis signe</p>
              <div className="space-y-2">
                {checklist.map((c) => {
                  const on = checks[c.key] === true;
                  return (
                    <button key={c.key} type="button" role="checkbox" aria-checked={on} onClick={() => setChecks((x) => ({ ...x, [c.key]: !on }))} className={`w-full flex items-start gap-3 text-left rounded-xl border p-3 min-h-[44px] ${on ? "border-boost-olive bg-boost-cream" : "border-paper-border bg-white"}`}>
                      <span className={`mt-0.5 w-5 h-5 shrink-0 rounded border flex items-center justify-center ${on ? "bg-boost-olive border-boost-olive text-white" : "border-ink-faint bg-white"}`}>{on && <Check className="w-3.5 h-3.5" aria-hidden />}</span>
                      <span>
                        <span className="block text-[14px] font-semibold text-ink">{c.label}</span>
                        <span className="block text-[12.5px] text-ink-muted">{c.sub}</span>
                      </span>
                    </button>
                  );
                })}
              </div>
              <div className="space-y-1">
                <label htmlFor="bat-name" className="block text-[14px] font-semibold text-ink">
                  Signé par
                </label>
                <input id="bat-name" value={name} onChange={(e) => setName(e.target.value)} maxLength={SIGN_NAME_MAX} placeholder="Ton nom et prénom" autoComplete="name" className={field} />
              </div>
              <p className="text-[12.5px] text-ink-muted">À la signature, le solde est dû et l&apos;impression démarre. Tu ne pourras plus annuler.</p>
              {signIssues.length > 0 && (
                <p role="alert" className="text-danger text-[13px] font-semibold">
                  {SIGN_ISSUE_TEXT[signIssues[0].code]}
                </p>
              )}
              {error && (
                <p role="alert" className="text-danger text-[13.5px] font-semibold">
                  {error}
                </p>
              )}
              <button type="button" disabled={!allChecked || !nameOk || busy !== null} onClick={() => run("sign", `/api/admin/missions/${missionId}/bat/sign`, { checks, name })} className={primary}>
                {busy === "sign" ? "…" : allChecked && nameOk ? "Signer et lancer l'impression" : "Coche tout et signe"}
              </button>
              {correctionsLeft > 0 ? (
                <button type="button" disabled={busy !== null} onClick={() => setCorrecting(true)} className={ghost}>
                  Demander des corrections ({correctionsLeft} tour{correctionsLeft > 1 ? "s" : ""} restant{correctionsLeft > 1 ? "s" : ""})
                </button>
              ) : (
                <p className="text-[12.5px] text-ink-muted">Tu as utilisé tes deux tours de corrections : signe l&apos;épreuve, ou écris à Boosteats si elle ne correspond pas à ton brief.</p>
              )}
            </div>
          ) : (
            <div className="space-y-4 border-t border-paper-border pt-4">
              <p className="text-[13.5px] text-ink-muted">Donne toutes tes corrections <strong>d&apos;un seul coup</strong> : après l&apos;envoi, ce tour est terminé.</p>
              {notes.length > 0 && (
                <ol className="space-y-2">
                  {notes.map((n, i) => {
                    const bad = problems.find((p) => p.index === i);
                    return (
                      <li key={i} className={`rounded-xl border p-3 ${bad ? "border-danger bg-white" : "border-boost-olive/30 bg-boost-cream"}`}>
                        <div className="flex items-start gap-2">
                          <div className="flex-1 min-w-0">
                            <p className="text-[12px] font-semibold text-ink-muted">{n.category}</p>
                            <p className="text-[14px] text-ink whitespace-pre-line">{n.text}</p>
                            {bad && <p role="alert" className="text-danger text-[12.5px] font-semibold mt-1">{RETOUCH_ISSUE_TEXT[bad.issue as keyof typeof RETOUCH_ISSUE_TEXT] ?? "À préciser"}</p>}
                          </div>
                          <button type="button" onClick={() => setNotes((l) => l.filter((_, j) => j !== i))} aria-label={`Retirer la correction ${i + 1}`} className="w-10 h-10 shrink-0 rounded-full flex items-center justify-center hover:bg-boost-olive/10">
                            <X className="w-4 h-4" aria-hidden />
                          </button>
                        </div>
                      </li>
                    );
                  })}
                </ol>
              )}
              <fieldset className="space-y-3 rounded-xl border border-paper-border p-3">
                <legend className="px-1 text-[13px] font-semibold text-ink">{notes.length === 0 ? "Ta première correction" : "Une autre correction"}</legend>
                <div role="radiogroup" aria-label="Ce qui ne va pas" className="flex flex-wrap gap-2">
                  {BAT_NOTE_CATEGORIES.map((c) => (
                    <button key={c} type="button" role="radio" aria-checked={category === c} onClick={() => setCategory(c)} className={`min-h-[44px] px-4 rounded-xl border text-[14px] font-medium ${category === c ? "bg-boost-olive border-boost-olive text-white" : "bg-white border-paper-border text-ink"}`}>
                      {c}
                    </button>
                  ))}
                </div>
                <textarea aria-label="Ce qu'il faut corriger, et pourquoi" value={text} onChange={(e) => setText(e.target.value)} rows={3} maxLength={1000} placeholder="Par exemple : le prix du menu enfant est faux, c'est 9 € et pas 11 €." className={field} />
                {draftError && <p role="alert" className="text-danger text-[13px] font-semibold">{draftError}</p>}
                <button type="button" onClick={addNote} className={ghost}>
                  <Plus className="w-4 h-4 mr-1" aria-hidden /> Ajouter cette correction
                </button>
              </fieldset>
              {error && (
                <p role="alert" className="text-danger text-[13.5px] font-semibold">
                  {error}
                </p>
              )}
              <div className="flex flex-wrap gap-2">
                <button type="button" disabled={notes.length === 0 || busy !== null} onClick={() => run("corr", `/api/admin/missions/${missionId}/bat/corrections`, { notes })} className={primary + " sm:w-auto"}>
                  {busy === "corr" ? "Envoi…" : `Envoyer mes ${notes.length} correction${notes.length > 1 ? "s" : ""}`}
                </button>
                <button type="button" disabled={busy !== null} onClick={() => setCorrecting(false)} className={ghost}>
                  Retour à la signature
                </button>
              </div>
            </div>
          )}
        </>
      )}
    </Card>
  );
}
