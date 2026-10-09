"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Check, ChevronLeft, ChevronRight, Plus, X } from "lucide-react";
import { Card } from "@/components/admin/ui";
import {
  validateBrief,
  type BriefAnswers,
  type BriefIssue,
  type BriefQuestion,
  type BriefStep,
  type BriefTemplate,
} from "@/lib/mission-brief";
import { briefRows, centsToEurosInput, eurosToCents, issueMessage } from "@/lib/mission-view";

// ADR 0084 §3 — l'assistant de brief du restaurateur : quelques questions par
// écran, cases et pastilles d'abord, texte libre jamais seul, sauvegarde
// automatique (un restaurateur est interrompu par le service). Les questions
// viennent du MODÈLE du métier (données) ; seul l'ordre des écrans est ici.
// Le brief est verrouillé à l'envoi : l'écran de récapitulatif le dit clairement.

type SaveState = "idle" | "saving" | "saved" | "error";

export function BriefWizard({
  restaurantId,
  missionId,
  template,
  steps,
  initialAnswers,
  today,
  providerName,
}: {
  restaurantId: string;
  missionId: string;
  template: BriefTemplate;
  steps: readonly BriefStep[];
  initialAnswers: BriefAnswers;
  /** Jour belge YYYY-MM-DD, calculé côté serveur. */
  today: string;
  providerName: string | null;
}) {
  const router = useRouter();
  const [answers, setAnswers] = useState<BriefAnswers>(initialAnswers);
  const [step, setStep] = useState(0);
  const [issues, setIssues] = useState<BriefIssue[]>([]);
  const [save, setSave] = useState<SaveState>("idle");
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);
  const dirty = useRef(false);

  const byKey = useMemo(() => new Map(template.questions.map((q) => [q.key, q])), [template]);
  const isRecap = step === steps.length;
  const current = isRecap ? null : steps[step];

  function set(key: string, value: BriefAnswers[string]) {
    dirty.current = true;
    setAnswers((a) => ({ ...a, [key]: value }));
    setIssues((list) => list.filter((i) => i.key !== key));
    setSave("idle");
  }

  // Sauvegarde automatique : 700 ms après la dernière frappe, jamais silencieuse en cas d'échec.
  useEffect(() => {
    if (!dirty.current) return;
    const t = setTimeout(async () => {
      setSave("saving");
      try {
        const res = await fetch(`/api/admin/missions/${missionId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ restaurantId, answers }),
        });
        dirty.current = false;
        setSave(res.ok ? "saved" : "error");
      } catch {
        setSave("error");
      }
    }, 700);
    return () => clearTimeout(t);
  }, [answers, missionId, restaurantId]);

  function stepIssues(keys: readonly string[]): BriefIssue[] {
    return validateBrief(answers, template, today, "brief").issues.filter((i) => keys.includes(i.key));
  }

  function next() {
    if (!current) return;
    const found = stepIssues(current.keys);
    if (found.length > 0) {
      setIssues(found);
      return;
    }
    setIssues([]);
    setStep((s) => s + 1);
  }

  async function send() {
    const all = validateBrief(answers, template, today, "brief").issues;
    if (all.length > 0) {
      setIssues(all);
      const first = steps.findIndex((s) => s.keys.some((k) => all.some((i) => i.key === k)));
      if (first >= 0) setStep(first);
      return;
    }
    setSending(true);
    setSendError(null);
    try {
      const res = await fetch(`/api/admin/missions/${missionId}/send`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ restaurantId, answers }),
      });
      const body = await res.json().catch(() => ({}));
      if (res.ok) {
        router.refresh();
        return;
      }
      if (res.status === 422 && Array.isArray(body.issues)) {
        const list = body.issues as BriefIssue[];
        setIssues(list);
        const first = steps.findIndex((s) => s.keys.some((k) => list.some((i) => i.key === k)));
        if (first >= 0) setStep(first);
      }
      setSendError(body.error ?? "Envoi impossible pour le moment. Réessaie.");
    } catch {
      setSendError("Pas de connexion. Ton brief est gardé : réessaie dans un instant.");
    } finally {
      setSending(false);
    }
  }

  const issueOf = (key: string) => issues.find((i) => i.key === key);

  return (
    <div className="space-y-4 max-w-xl">
      {/* Progression */}
      <div>
        <div className="flex items-center justify-between text-[12px] text-ink-muted mb-2">
          <span className="font-mono tracking-[0.12em] uppercase">
            {isRecap ? "Récapitulatif" : `Étape ${step + 1} sur ${steps.length}`}
          </span>
          <span aria-live="polite" className={save === "error" ? "text-danger font-semibold" : ""}>
            {save === "saving" && "Sauvegarde…"}
            {save === "saved" && "Sauvegardé"}
            {save === "error" && "Pas sauvegardé — vérifie ta connexion"}
          </span>
        </div>
        <div className="flex gap-1.5" aria-hidden>
          {[...steps, null].map((_, i) => (
            <div key={i} className={`h-1.5 flex-1 rounded-full ${i <= step ? "bg-boost-olive" : "bg-paper-border"}`} />
          ))}
        </div>
      </div>

      {current && (
        <Card className="space-y-5">
          <div>
            <h2 className="font-display text-[20px] font-bold tracking-[-0.02em] text-ink">{current.title}</h2>
            <p className="text-ink-muted text-[13.5px] mt-1">{current.subtitle}</p>
          </div>
          {current.keys.map((key) => {
            const q = byKey.get(key);
            return q ? <Question key={key} q={q} value={answers[key]} issue={issueOf(key)} onChange={(v) => set(key, v)} /> : null;
          })}
        </Card>
      )}

      {isRecap && (
        <>
          <Card className="space-y-3" padding="p-0">
            <div className="px-5 pt-4">
              <h2 className="font-display text-[20px] font-bold tracking-[-0.02em] text-ink">Ton brief</h2>
              <p className="text-ink-muted text-[13.5px] mt-1">Relis-le : une fois envoyé, il est verrouillé.</p>
            </div>
            <dl>
              {briefRows(answers, template).map((r, i) => (
                <div key={r.label} className={`px-5 py-3 ${i === 0 ? "" : "border-t border-paper-border"}`}>
                  <dt className="text-[12px] text-ink-faint">{r.label}</dt>
                  <dd className="text-[14px] text-ink whitespace-pre-line">{r.value}</dd>
                </div>
              ))}
            </dl>
            <div className="px-5 pb-4">
              <button type="button" onClick={() => setStep(0)} className="text-[13px] font-semibold text-ink underline underline-offset-2 min-h-[44px]">
                Modifier mes réponses
              </button>
            </div>
          </Card>

          <Card className="bg-boost-cream border-boost-olive/30 space-y-2">
            <p className="font-semibold text-ink text-[14px]">Ce qui se passe ensuite</p>
            <ul className="text-[13.5px] text-ink-body space-y-1.5 list-disc pl-5">
              <li>{providerName ? `${providerName} lit` : "Le vidéaste lit"} ton brief et te répond avec un devis.</li>
              <li>Son prix est ferme pour ce brief : ce que tu as écrit, il le chiffre.</li>
              <li>Tu changes d&apos;avis après l&apos;envoi ? C&apos;est une demande de modification, qu&apos;il chiffre ou refuse.</li>
              <li>Tu ne paies rien maintenant. La date du tournage se choisit après le devis, dans ses disponibilités.</li>
            </ul>
          </Card>

          {issues.length > 0 && (
            <p role="alert" className="text-danger text-[13.5px] font-semibold">
              Il manque {issues.length} réponse{issues.length > 1 ? "s" : ""} : on te ramène à la première.
            </p>
          )}
          {sendError && (
            <p role="alert" className="text-danger text-[13.5px] font-semibold">
              {sendError}
            </p>
          )}
        </>
      )}

      {/* Navigation */}
      <div className="flex items-center gap-3">
        {step > 0 && (
          <button
            type="button"
            onClick={() => {
              setIssues([]);
              setStep((s) => s - 1);
            }}
            className="inline-flex items-center gap-1 min-h-[44px] px-4 rounded-lg border border-paper-border bg-white text-ink text-[14px] font-semibold"
          >
            <ChevronLeft className="w-4 h-4" aria-hidden /> Retour
          </button>
        )}
        {!isRecap ? (
          <button
            type="button"
            onClick={next}
            className="flex-1 inline-flex items-center justify-center gap-1.5 min-h-[44px] px-5 rounded-xl bg-boost-olive text-white text-[14px] font-semibold shadow-[inset_0_-3px_0_#4F5C2D] hover:brightness-95"
          >
            Suivant <ChevronRight className="w-4 h-4" aria-hidden />
          </button>
        ) : (
          <button
            type="button"
            disabled={sending}
            onClick={send}
            className="flex-1 inline-flex items-center justify-center gap-1.5 min-h-[44px] px-5 rounded-xl bg-boost-olive text-white text-[14px] font-semibold shadow-[inset_0_-3px_0_#4F5C2D] hover:brightness-95 disabled:opacity-60"
          >
            {sending ? "Envoi…" : providerName ? `Envoyer à ${providerName}` : "Envoyer mon brief"}
          </button>
        )}
      </div>
    </div>
  );
}

// ── Une question, selon son genre ───────────────────────────

function Question({
  q,
  value,
  issue,
  onChange,
}: {
  q: BriefQuestion;
  value: BriefAnswers[string];
  issue: BriefIssue | undefined;
  onChange: (v: BriefAnswers[string]) => void;
}) {
  const id = `q-${q.key}`;
  const label = (
    <label htmlFor={id} className="block text-[14px] font-semibold text-ink">
      {q.label}
      {!q.required && <span className="font-normal text-ink-faint"> · facultatif</span>}
    </label>
  );

  let control: React.ReactNode = null;

  if (q.kind === "choice" || q.kind === "multi") {
    const multi = q.kind === "multi";
    const selected = multi ? (Array.isArray(value) ? value : []) : typeof value === "string" ? [value] : [];
    control = (
      <div id={id} role={multi ? "group" : "radiogroup"} aria-label={q.label} className="flex flex-wrap gap-2">
        {(q.options ?? []).map((o) => {
          const on = selected.includes(o);
          return (
            <button
              key={o}
              type="button"
              aria-pressed={on}
              onClick={() => (multi ? onChange(on ? selected.filter((x) => x !== o) : [...selected, o]) : onChange(on ? null : o))}
              className={`min-h-[44px] px-4 rounded-xl border text-[14px] font-medium transition-colors ${
                on ? "bg-boost-olive border-boost-olive text-white" : "bg-white border-paper-border text-ink hover:bg-paper-subtle"
              }`}
            >
              {o}
            </button>
          );
        })}
      </div>
    );
  } else if (q.kind === "text") {
    const text = typeof value === "string" ? value : "";
    control = (
      <>
        <textarea
          id={id}
          value={text}
          onChange={(e) => onChange(e.target.value)}
          rows={q.minLength ? 4 : 3}
          maxLength={2000}
          className="w-full border border-paper-border rounded-xl px-3 py-2.5 text-[14px] text-ink bg-white focus:outline-none focus-visible:ring-2 focus-visible:ring-boost-olive"
        />
        {q.minLength ? (
          <p className="text-[12px] text-ink-faint text-right">
            {text.trim().length} / {q.minLength} caractères au moins
          </p>
        ) : null}
      </>
    );
  } else if (q.kind === "list") {
    control = <ListField id={id} items={Array.isArray(value) ? value : []} onChange={onChange} placeholder={q.key === "dishes" ? "Ajouter un plat" : "Ajouter une personne"} />;
  } else if (q.kind === "number") {
    control = q.key === "budget_cents" ? <EuroField id={id} cents={typeof value === "number" ? value : null} onChange={onChange} /> : (
      <input
        id={id}
        inputMode="numeric"
        value={typeof value === "number" ? String(value) : ""}
        onChange={(e) => {
          const n = Number(e.target.value.replace(/\D/g, ""));
          onChange(e.target.value === "" ? null : Number.isFinite(n) ? n : null);
        }}
        className="w-28 border border-paper-border rounded-xl px-3 py-2.5 text-[14px] text-ink bg-white focus:outline-none focus-visible:ring-2 focus-visible:ring-boost-olive"
      />
    );
  } else if (q.kind === "flag") {
    const on = value === true;
    return (
      <div>
        <button
          type="button"
          role="checkbox"
          aria-checked={on}
          onClick={() => onChange(!on)}
          className={`w-full flex items-start gap-3 text-left rounded-xl border p-3 min-h-[44px] ${on ? "border-boost-olive bg-boost-cream" : "border-paper-border bg-white"}`}
        >
          <span className={`mt-0.5 w-5 h-5 shrink-0 rounded border flex items-center justify-center ${on ? "bg-boost-olive border-boost-olive text-white" : "border-ink-faint bg-white"}`}>
            {on && <Check className="w-3.5 h-3.5" aria-hidden />}
          </span>
          <span className="text-[14px] font-semibold text-ink">{q.label}</span>
        </button>
        {q.hint && <p className="text-[12.5px] text-ink-muted mt-1.5">{q.hint}</p>}
        {issue && <p role="alert" className="text-danger text-[13px] font-semibold mt-1.5">{issueMessage(issue.code)}</p>}
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {label}
      {q.hint && <p className="text-[12.5px] text-ink-muted">{q.hint}</p>}
      {control}
      {issue && <p role="alert" className="text-danger text-[13px] font-semibold">{issueMessage(issue.code)}</p>}
    </div>
  );
}

function ListField({ id, items, onChange, placeholder }: { id: string; items: string[]; onChange: (v: string[]) => void; placeholder: string }) {
  const [draft, setDraft] = useState("");
  function add() {
    const t = draft.trim();
    if (!t || items.length >= 30) return;
    onChange([...items, t]);
    setDraft("");
  }
  return (
    <div className="space-y-2">
      {items.length > 0 && (
        <ul className="flex flex-wrap gap-2">
          {items.map((it, i) => (
            <li key={`${it}-${i}`} className="inline-flex items-center gap-1.5 bg-boost-cream border border-boost-olive/30 rounded-full pl-3 pr-1 min-h-[36px] text-[14px] text-ink">
              {it}
              <button type="button" onClick={() => onChange(items.filter((_, j) => j !== i))} aria-label={`Retirer ${it}`} className="w-8 h-8 rounded-full flex items-center justify-center hover:bg-boost-olive/10">
                <X className="w-4 h-4" aria-hidden />
              </button>
            </li>
          ))}
        </ul>
      )}
      <div className="flex gap-2">
        <input
          id={id}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              add();
            }
          }}
          placeholder={placeholder}
          maxLength={200}
          className="flex-1 min-w-0 border border-paper-border rounded-xl px-3 py-2.5 text-[14px] text-ink bg-white focus:outline-none focus-visible:ring-2 focus-visible:ring-boost-olive"
        />
        <button type="button" onClick={add} className="inline-flex items-center gap-1 min-h-[44px] px-4 rounded-xl border border-paper-border bg-white text-ink text-[14px] font-semibold">
          <Plus className="w-4 h-4" aria-hidden /> Ajouter
        </button>
      </div>
    </div>
  );
}

function EuroField({ id, cents, onChange }: { id: string; cents: number | null; onChange: (v: number | null) => void }) {
  const [text, setText] = useState(centsToEurosInput(cents));
  return (
    <div className="flex items-center gap-2">
      <input
        id={id}
        inputMode="decimal"
        value={text}
        onChange={(e) => {
          setText(e.target.value);
          onChange(eurosToCents(e.target.value));
        }}
        className="w-36 border border-paper-border rounded-xl px-3 py-2.5 text-[14px] text-ink bg-white focus:outline-none focus-visible:ring-2 focus-visible:ring-boost-olive"
      />
      <span className="text-[14px] text-ink-muted">€ hors TVA</span>
    </div>
  );
}
