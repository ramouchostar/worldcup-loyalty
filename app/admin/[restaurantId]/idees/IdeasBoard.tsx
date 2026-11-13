"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AlertCircle, Check, Lightbulb } from "lucide-react";
import { Card, EmptyState, PageHeader, SectionLabel } from "@/components/admin/ui";
import { REFUSAL_NOTE_MAX, REFUSAL_REASONS, REFUSAL_REASON_LABELS, type IdeaLines, type RefusalReason } from "@/lib/agents/types";
import { repliesYesLabel, type ReplyCard } from "@/lib/agents/ideas-view";
import { decide, type DecideInput } from "./actions";

// L'écran « Idées du jour » (ADR 0089, Brigade 03), d'après la maquette validée
// le 2026-11-05. Une carte par idée : le visage de l'assistant, ce qui se passe,
// la question, trois lignes (quoi · pour qui · combien), l'estimation s'il y en
// a une, puis Oui / Non / Plus tard. « Non » ouvre les raisons à choisir, avec
// « Autre » et une saisie libre ; la carte dit ensuite ce qui a été retenu.

export type IdeaCardData = {
  id: string;
  name: string;
  post: string;
  photo: string;
  deadline: string;
  title: string;
  question: string;
  lines: IdeaLines;
  estimate: { text: string; basis: string } | null;
  yesLabel: string;
  /** Idée d'Emma : la case des conditions de la Pub, cochée par le gérant lui-même (ADR 0086 §4). */
  needsTerms: boolean;
  preparedByTeam: boolean;
  /** Louis (Brigade 13) : un brouillon de réponse par avis, que le gérant relit, modifie ou écarte avant le « Oui ». */
  replies?: ReplyCard[];
  /** Avis à traiter qui n'entrent pas aujourd'hui : ils viennent les jours suivants. */
  repliesLeft?: number;
};
export type InProgressData = { id: string; name: string; photo: string; title: string; error: string | null; team: boolean };
export type RecentData = { id: string; label: string; outcome: string; yes: boolean };

type CardState = { done: boolean; tone: "good" | "neutral" | "danger"; message: string } | undefined;

function Avatar({ photo, name, size = 44 }: { photo: string; name: string; size?: number }) {
  return (
    // eslint-disable-next-line @next/next/no-img-element -- portrait fixe de 256 px, déjà à la bonne taille
    <img src={photo} alt={name} width={size} height={size} className="rounded-full object-cover shrink-0 bg-boost-cream border-2 border-boost-cream" style={{ width: size, height: size }} />
  );
}

function RefusalSheet({ name, pending, onCancel, onConfirm }: { name: string; pending: boolean; onCancel: () => void; onConfirm: (reason: RefusalReason, note: string) => void }) {
  const [reason, setReason] = useState<RefusalReason | null>(null);
  const [note, setNote] = useState("");
  const first = useRef<HTMLButtonElement>(null);
  useEffect(() => first.current?.focus(), []);

  return (
    <div className="fixed inset-0 z-50 bg-ink/40 flex items-end md:items-center justify-center" onClick={onCancel}>
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="refus-titre"
        onClick={(e) => e.stopPropagation()}
        onKeyDown={(e) => e.key === "Escape" && onCancel()}
        className="w-full md:max-w-md max-h-[90dvh] flex flex-col bg-white rounded-t-2xl md:rounded-2xl"
      >
        {/* Les raisons défilent, les boutons restent toujours visibles en bas (même sur un petit téléphone). */}
        <div className="flex-1 min-h-0 overflow-y-auto p-5 pb-3 space-y-4">
        <div className="space-y-1">
          <h2 id="refus-titre" className="text-[18px] font-bold text-ink">Pourquoi pas ?</h2>
          <p className="text-[13px] text-ink-muted">{name} s&apos;en souviendra pour ses prochaines idées.</p>
        </div>
        <div className="space-y-2" role="radiogroup" aria-label="Raison">
          {REFUSAL_REASONS.map((r, i) => {
            const on = reason === r;
            return (
              <button
                key={r}
                ref={i === 0 ? first : undefined}
                type="button"
                role="radio"
                aria-checked={on}
                onClick={() => setReason(r)}
                className={`w-full flex items-center gap-3 min-h-[48px] px-3.5 rounded-xl border text-left text-[15px] text-ink transition-colors ${
                  on ? "bg-boost-cream border-boost-olive" : "bg-white border-paper-border hover:bg-paper-subtle"
                }`}
              >
                <span className={`w-[18px] h-[18px] rounded-full border-2 flex items-center justify-center shrink-0 ${on ? "border-boost-olive" : "border-ink-faint"}`}>
                  {on && <span className="w-2 h-2 rounded-full bg-boost-olive" />}
                </span>
                {REFUSAL_REASON_LABELS[r]}
              </button>
            );
          })}
        </div>
        {reason === "autre" && (
          <div className="space-y-1.5">
            <label htmlFor="refus-note" className="block text-[13px] font-medium text-ink-body">En quelques mots (facultatif)</label>
            <textarea
              id="refus-note"
              rows={3}
              maxLength={REFUSAL_NOTE_MAX}
              value={note}
              onChange={(e) => setNote(e.target.value.slice(0, REFUSAL_NOTE_MAX))}
              placeholder="Ex. : mes clients n'aiment pas les messages le week-end"
              className="w-full resize-none rounded-xl border border-paper-border bg-paper px-3 py-2.5 text-[14px] text-ink focus:outline-none focus:ring-2 focus:ring-boost-olive"
            />
            <p className="text-right text-[12px] text-ink-faint">{note.length} / {REFUSAL_NOTE_MAX}</p>
          </div>
        )}
        </div>
        <div className="shrink-0 flex gap-2 px-5 pt-3 pb-[max(1.25rem,env(safe-area-inset-bottom))] border-t border-paper-border bg-white rounded-b-none md:rounded-b-2xl">
          <button type="button" onClick={onCancel} className="min-h-[44px] px-4 rounded-xl border border-paper-border bg-white text-[15px] font-medium text-ink">
            Annuler
          </button>
          <button
            type="button"
            disabled={!reason || pending}
            onClick={() => reason && onConfirm(reason, note)}
            className="flex-1 min-h-[44px] rounded-xl bg-ink text-white text-[15px] font-semibold disabled:bg-ink-faint"
          >
            {pending ? "Un instant…" : "Valider"}
          </button>
        </div>
      </div>
    </div>
  );
}

function IdeaCard({ idea, restaurantId }: { idea: IdeaCardData; restaurantId: string }) {
  const router = useRouter();
  const [state, setState] = useState<CardState>(undefined);
  const [refusing, setRefusing] = useState(false);
  const [terms, setTerms] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  // Louis : le texte de chaque réponse (modifiable) et les avis que le gérant écarte.
  const replies = idea.replies ?? [];
  const [texts, setTexts] = useState<Record<string, string>>(() => Object.fromEntries(replies.map((r) => [r.ref, r.text])));
  const [skipped, setSkipped] = useState<Record<string, boolean>>({});
  const kept = replies.filter((r) => !skipped[r.ref]);

  function send(input: DecideInput) {
    setError(null);
    start(async () => {
      const r = await decide(restaurantId, idea.id, input);
      if (!r.ok) {
        setError(r.message);
        return;
      }
      setRefusing(false);
      setState({ done: true, tone: r.failed ? "danger" : input.kind === "oui" ? "good" : "neutral", message: r.message });
      if (r.redirect) router.push(r.redirect);
    });
  }

  return (
    <Card padding="p-4" className="space-y-3">
      <div className="flex items-center gap-2.5">
        <Avatar photo={idea.photo} name={idea.name} />
        <div className="flex-1 min-w-0">
          <p className="text-[14px] font-semibold text-ink">{idea.name}</p>
          <p className="text-[12px] text-ink-muted truncate">{idea.preparedByTeam ? "Préparée avec l'équipe Boosteats" : idea.post}</p>
        </div>
        <span className="text-[12px] text-ink-muted whitespace-nowrap">{idea.deadline}</span>
      </div>

      <div className="space-y-1">
        <h2 className="text-[17px] font-semibold leading-snug text-ink">{idea.title}</h2>
        <p className="text-[15px] text-ink-body">{idea.question}</p>
      </div>

      <dl className="grid grid-cols-[76px_minmax(0,1fr)] gap-x-2 gap-y-1.5 text-[13px] leading-snug">
        <dt className="text-ink-muted">Quoi</dt>
        <dd className="text-ink-body">{idea.lines.what}</dd>
        <dt className="text-ink-muted">Pour qui</dt>
        <dd className="text-ink-body">{idea.lines.who}</dd>
        <dt className="text-ink-muted">Combien</dt>
        <dd className="text-ink-body">{idea.lines.cost}</dd>
      </dl>

      {idea.estimate && (
        <div className="rounded-lg bg-boost-cream px-3 py-2.5">
          <p className="text-[13px] font-semibold text-boost-olive-dark">{idea.estimate.text}</p>
          <p className="text-[12px] text-ink-muted">{idea.estimate.basis}</p>
        </div>
      )}

      {replies.length > 0 && !state?.done && (
        <div className="space-y-3">
          {replies.map((r) => {
            const off = !!skipped[r.ref];
            const modified = (texts[r.ref] ?? r.text) !== r.text;
            const fieldId = `reponse-${idea.id}-${r.ref}`;
            return (
              <div key={r.ref} className={`rounded-lg border border-paper-border p-3 space-y-2 ${off ? "opacity-60" : ""}`}>
                <div className="flex flex-wrap items-center gap-2 text-[13px] text-ink-muted">
                  <span className="font-semibold text-ink tracking-wide" role="img" aria-label={`${r.rating} sur 5`}>
                    {"★".repeat(r.rating)}
                    {"☆".repeat(Math.max(0, 5 - r.rating))}
                  </span>
                  <span>{r.when}</span>
                  {r.careful && <span className="rounded-full bg-warn/10 px-2 py-0.5 text-[12px] font-medium text-warn">À relire avec soin</span>}
                  {modified && <span className="rounded-full bg-boost-cream px-2 py-0.5 text-[12px] font-medium text-boost-olive-dark">Modifiée</span>}
                </div>
                <p className="border-l-2 border-paper-border pl-2.5 text-[13px] text-ink-muted">« {r.excerpt} »</p>
                <label htmlFor={fieldId} className="block text-[13px] text-ink-muted">Réponse de {idea.name}, publiée sous le nom de ton établissement</label>
                <textarea
                  id={fieldId}
                  rows={4}
                  maxLength={600}
                  value={texts[r.ref] ?? r.text}
                  disabled={off || pending}
                  onChange={(e) => setTexts((t) => ({ ...t, [r.ref]: e.target.value }))}
                  className="w-full resize-y rounded-lg border border-paper-border bg-paper px-3 py-2.5 text-[14px] leading-snug text-ink focus:outline-none focus:ring-2 focus:ring-boost-olive disabled:opacity-60"
                />
                <label className="flex items-center gap-2.5 min-h-[44px] text-[13px] text-ink-muted">
                  <input
                    type="checkbox"
                    checked={off}
                    disabled={pending}
                    onChange={(e) => setSkipped((s) => ({ ...s, [r.ref]: e.target.checked }))}
                    className="h-5 w-5 accent-boost-olive"
                  />
                  Ne pas répondre à cet avis
                </label>
              </div>
            );
          })}
          {(idea.repliesLeft ?? 0) > 0 && (
            <p className="text-[13px] text-ink-muted">
              {idea.repliesLeft} {idea.repliesLeft === 1 ? "autre avis vient" : "autres avis viennent"} les jours suivants.
            </p>
          )}
        </div>
      )}

      {state?.done ? (
        <div className={`flex items-start gap-2 rounded-lg px-3 py-2.5 ${state.tone === "danger" ? "bg-danger/10" : "bg-paper-subtle"}`} role="status">
          {state.tone === "danger" ? (
            <AlertCircle size={18} className="text-danger shrink-0 mt-px" aria-hidden="true" />
          ) : (
            <Check size={18} className={`${state.tone === "good" ? "text-good" : "text-ink-muted"} shrink-0 mt-px`} aria-hidden="true" />
          )}
          <p className="text-[13px] leading-snug text-ink-body">{state.message}</p>
        </div>
      ) : (
        <>
          {idea.needsTerms && (
            <label className="flex items-start gap-2.5 text-[13px] text-ink-body">
              <input type="checkbox" checked={terms} onChange={(e) => setTerms(e.target.checked)} className="mt-0.5 h-[18px] w-[18px] accent-boost-olive" />
              <span>
                J&apos;accepte les{" "}
                <Link href={`/admin/${restaurantId}/pub`} className="underline">conditions de la Pub</Link> : le crédit payé est dépensé en pub, il n&apos;est pas remboursé.
              </span>
            </label>
          )}
          <div className="flex gap-2">
            <button
              type="button"
              disabled={pending || (idea.needsTerms && !terms) || (replies.length > 0 && kept.length === 0)}
              onClick={() =>
                send({
                  kind: "oui",
                  termsAccepted: idea.needsTerms ? terms : undefined,
                  replies: replies.length > 0 ? kept.map((r) => ({ ref: r.ref, text: texts[r.ref] ?? r.text })) : undefined,
                })
              }
              className="flex-1 min-h-[44px] rounded-xl bg-boost-olive text-white text-[15px] font-semibold disabled:opacity-50"
            >
              {pending ? "Un instant…" : replies.length > 0 ? repliesYesLabel(kept.length) : idea.yesLabel}
            </button>
            <button type="button" disabled={pending} onClick={() => setRefusing(true)} className="min-h-[44px] px-4 rounded-xl border border-paper-border bg-white text-[15px] font-medium text-ink">
              Non
            </button>
            <button type="button" disabled={pending} onClick={() => send({ kind: "plus_tard" })} className="min-h-[44px] px-3 rounded-xl text-[14px] font-medium text-ink-muted hover:bg-paper-subtle">
              Plus tard
            </button>
          </div>
        </>
      )}
      {error && <p className="text-[13px] text-danger" role="alert">{error}</p>}

      {refusing && (
        <RefusalSheet
          name={idea.name}
          pending={pending}
          onCancel={() => setRefusing(false)}
          onConfirm={(reason, note) => send({ kind: "non", reason, note: reason === "autre" ? note : null })}
        />
      )}
    </Card>
  );
}

export function IdeasBoard({
  restaurantId,
  dateLabel,
  summary,
  ideas,
  inProgress,
  recent,
}: {
  restaurantId: string;
  dateLabel: string;
  summary: string;
  ideas: IdeaCardData[];
  inProgress: InProgressData[];
  recent: RecentData[];
}) {
  return (
    <div className="space-y-5 max-w-2xl">
      <PageHeader title="Idées du jour" subtitle={<span className="first-letter:uppercase">{dateLabel} · {summary}</span>} />

      {inProgress.length > 0 && (
        <section className="space-y-2" aria-labelledby="en-cours">
          <SectionLabel>
            <span id="en-cours">En cours</span>
          </SectionLabel>
          {inProgress.map((p) => (
            <Card key={p.id} padding="p-4" className="space-y-2.5">
              <div className="flex items-center gap-2.5">
                <Avatar photo={p.photo} name={p.name} size={36} />
                <p className="text-[14px] font-semibold text-ink flex-1 min-w-0">{p.title}</p>
              </div>
              {p.error ? (
                <div className="flex items-start gap-2 rounded-lg bg-danger/10 px-3 py-2.5">
                  <AlertCircle size={18} className="text-danger shrink-0 mt-px" aria-hidden="true" />
                  <p className="text-[13px] leading-snug text-ink-body">
                    <span className="font-semibold text-danger">Ça n&apos;est pas parti.</span> L&apos;équipe Boosteats est prévenue et s&apos;en occupe. Tu n&apos;as rien à faire.
                  </p>
                </div>
              ) : (
                <p className="text-[13px] text-ink-muted">{p.team ? "Tu as dit oui : l'équipe Boosteats s'en occupe." : "Tu as dit oui : c'est en cours."}</p>
              )}
            </Card>
          ))}
        </section>
      )}

      {ideas.length === 0 ? (
        <EmptyState icon={Lightbulb} title="Rien pour aujourd'hui" action={<Link href={`/admin/${restaurantId}`} className="inline-flex items-center min-h-[44px] px-4 rounded-xl border border-paper-border text-[14px] font-medium text-ink">Voir mes stats</Link>}>
          Tes assistants n&apos;ont rien trouvé qui vaille ton temps. Ils repassent demain matin.
        </EmptyState>
      ) : (
        <div className="space-y-3">
          {ideas.map((idea) => (
            <IdeaCard key={idea.id} idea={idea} restaurantId={restaurantId} />
          ))}
          <p className="px-1 text-[12px] leading-relaxed text-ink-faint">Rien ne part sans ton « Oui ». Les idées sans réponse s&apos;effacent à leur date limite.</p>
        </div>
      )}

      {recent.length > 0 && (
        <section className="space-y-2" aria-labelledby="decide">
          <SectionLabel>
            <span id="decide">Décidé cette semaine</span>
          </SectionLabel>
          <Card padding="p-0">
            {recent.map((r, i) => (
              <div key={r.id} className={`flex justify-between gap-3 px-4 py-3 text-[13px] ${i > 0 ? "border-t border-paper-border" : ""}`}>
                <span className="text-ink-body min-w-0 truncate">{r.label}</span>
                <span className={`whitespace-nowrap ${r.yes ? "text-good font-semibold" : "text-ink-muted"}`}>{r.outcome}</span>
              </div>
            ))}
          </Card>
        </section>
      )}
    </div>
  );
}
