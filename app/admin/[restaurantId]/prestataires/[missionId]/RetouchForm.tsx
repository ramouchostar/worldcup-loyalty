"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, X } from "lucide-react";
import { Card, SectionLabel } from "@/components/admin/ui";
import { RETOUCH_ISSUE_TEXT, roundsLabel, type RetouchIssue } from "@/lib/mission-retouch";
import { checkRetouchNote } from "@/lib/mission-brief";

// ADR 0084 §3 règle 8 — un tour de retours : TOUTES les remarques en UN seul envoi. Chacune est classée
// (lumière, rythme, texte…) et motivée : « je n'aime pas » seul est refusé, ici avant l'envoi et côté serveur.
// L'écran dit ce qu'un tour n'est PAS : une refonte. Tant qu'il reste un tour, le restaurateur peut aussi valider.

type Note = { category: string; text: string; at: string };

export function RetouchForm({
  restaurantId,
  missionId,
  categories,
  roundsLeft,
  withTimecode,
}: {
  restaurantId: string;
  missionId: string;
  categories: readonly string[];
  roundsLeft: number;
  /** Une vidéo a un « moment » (0:08) ; un menu n'en a pas. */
  withTimecode: boolean;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [notes, setNotes] = useState<Note[]>([]);
  const [category, setCategory] = useState<string | null>(null);
  const [text, setText] = useState("");
  const [at, setAt] = useState("");
  const [draftError, setDraftError] = useState<string | null>(null);
  const [problems, setProblems] = useState<RetouchIssue[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);

  function add() {
    const issue = checkRetouchNote({ category, text }, categories);
    if (issue) return setDraftError(RETOUCH_ISSUE_TEXT[issue]);
    if (at && !/^\d{1,2}:[0-5]\d$/.test(at.trim())) return setDraftError(RETOUCH_ISSUE_TEXT.timecode_invalid);
    setNotes((n) => [...n, { category: category as string, text: text.trim(), at: at.trim() }]);
    setCategory(null);
    setText("");
    setAt("");
    setDraftError(null);
    setProblems([]);
  }

  async function send() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/missions/${missionId}/retouch`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ restaurantId, notes }) });
      const body = await res.json().catch(() => ({}));
      if (res.ok) return router.refresh();
      if (res.status === 422 && Array.isArray(body.problems)) setProblems(body.problems as RetouchIssue[]);
      setConfirming(false);
      setError(body.error ?? "Impossible pour le moment. Réessaie.");
    } catch {
      setConfirming(false);
      setError("Pas de connexion. Réessaie dans un instant.");
    } finally {
      setBusy(false);
    }
  }

  if (!open) {
    return (
      <Card className="space-y-2">
        <SectionLabel>Quelque chose à changer ?</SectionLabel>
        <p className="text-[13.5px] text-ink-muted">{roundsLabel(roundsLeft)}. Un tour, c&apos;est un seul envoi avec toutes tes remarques : réfléchis-y en regardant tout avant.</p>
        <button type="button" onClick={() => setOpen(true)} className="inline-flex items-center min-h-[44px] px-4 rounded-lg border border-paper-border bg-white text-[14px] font-semibold text-ink">
          Demander une retouche
        </button>
      </Card>
    );
  }

  return (
    <Card className="space-y-5">
      <div>
        <h2 className="font-display text-[20px] font-bold tracking-[-0.02em] text-ink">Tes remarques</h2>
        <p className="text-ink-muted text-[13.5px] mt-1">Donne tout ce qui ne va pas <strong>d&apos;un seul coup</strong> : après l&apos;envoi, le tour est terminé. {roundsLabel(roundsLeft)}.</p>
        <p className="text-ink-muted text-[13.5px] mt-1">Une retouche, ce n&apos;est pas refaire le travail : changer l&apos;idée de départ est une demande de modification, que le prestataire chiffre.</p>
      </div>

      {notes.length > 0 && (
        <ol className="space-y-2">
          {notes.map((n, i) => {
            const bad = problems.find((p) => p.index === i);
            return (
              <li key={i} className={`rounded-xl border p-3 ${bad ? "border-danger bg-white" : "border-boost-olive/30 bg-boost-cream"}`}>
                <div className="flex items-start gap-2">
                  <div className="flex-1 min-w-0">
                    <p className="text-[12px] font-semibold text-ink-muted">
                      {n.category}
                      {n.at ? ` · ${n.at}` : ""}
                    </p>
                    <p className="text-[14px] text-ink whitespace-pre-line">{n.text}</p>
                    {bad && <p role="alert" className="text-danger text-[12.5px] font-semibold mt-1">{RETOUCH_ISSUE_TEXT[bad.issue]}</p>}
                  </div>
                  <button type="button" onClick={() => setNotes((l) => l.filter((_, j) => j !== i))} aria-label={`Retirer la remarque ${i + 1}`} className="w-10 h-10 shrink-0 rounded-full flex items-center justify-center hover:bg-boost-olive/10">
                    <X className="w-4 h-4" aria-hidden />
                  </button>
                </div>
              </li>
            );
          })}
        </ol>
      )}

      <fieldset className="space-y-3 rounded-xl border border-paper-border p-3">
        <legend className="px-1 text-[13px] font-semibold text-ink">{notes.length === 0 ? "Ta première remarque" : "Une autre remarque"}</legend>
        <div role="radiogroup" aria-label="Ce qui ne va pas" className="flex flex-wrap gap-2">
          {categories.map((c) => (
            <button key={c} type="button" role="radio" aria-checked={category === c} onClick={() => setCategory(c)} className={`min-h-[44px] px-4 rounded-xl border text-[14px] font-medium ${category === c ? "bg-boost-olive border-boost-olive text-white" : "bg-white border-paper-border text-ink"}`}>
              {c}
            </button>
          ))}
        </div>
        <textarea aria-label="Ce que tu veux changer, et pourquoi" value={text} onChange={(e) => setText(e.target.value)} rows={3} maxLength={1000} placeholder="Par exemple : trop sombre, on ne voit pas la sauce couler." className="w-full border border-paper-border rounded-xl px-3 py-2.5 text-[14px] text-ink bg-white focus:outline-none focus-visible:ring-2 focus-visible:ring-boost-olive" />
        {withTimecode && <input aria-label="Moment dans la vidéo (facultatif)" value={at} onChange={(e) => setAt(e.target.value)} placeholder="Moment : 0:08 (facultatif)" maxLength={12} className="w-48 border border-paper-border rounded-xl px-3 py-2.5 text-[14px] text-ink bg-white focus:outline-none focus-visible:ring-2 focus-visible:ring-boost-olive" />}
        {draftError && <p role="alert" className="text-danger text-[13px] font-semibold">{draftError}</p>}
        <button type="button" onClick={add} className="inline-flex items-center gap-1 min-h-[44px] px-4 rounded-xl border border-paper-border bg-white text-ink text-[14px] font-semibold">
          <Plus className="w-4 h-4" aria-hidden /> Ajouter cette remarque
        </button>
      </fieldset>

      {error && <p role="alert" className="text-danger text-[13.5px] font-semibold">{error}</p>}

      {!confirming ? (
        <div className="flex gap-3">
          <button type="button" onClick={() => setOpen(false)} className="min-h-[44px] px-4 rounded-lg border border-paper-border bg-white text-[14px] font-semibold text-ink">
            Annuler
          </button>
          <button type="button" disabled={notes.length === 0} onClick={() => setConfirming(true)} className="flex-1 min-h-[44px] px-4 rounded-xl bg-boost-olive text-white text-[14px] font-semibold shadow-[inset_0_-3px_0_#4F5C2D] disabled:opacity-50">
            Envoyer mes {notes.length} remarque{notes.length > 1 ? "s" : ""}
          </button>
        </div>
      ) : (
        <div className="rounded-xl bg-boost-cream border border-boost-olive/30 p-3 space-y-3">
          <p className="text-[14px] font-semibold text-ink">C&apos;est tout ? Après l&apos;envoi, ce tour est consommé.</p>
          <div className="flex gap-3">
            <button type="button" onClick={() => setConfirming(false)} className="min-h-[44px] px-4 rounded-lg border border-paper-border bg-white text-[14px] font-semibold text-ink">
              J&apos;ai oublié quelque chose
            </button>
            <button type="button" disabled={busy} onClick={send} className="flex-1 min-h-[44px] px-4 rounded-lg bg-ink text-white text-[14px] font-semibold disabled:opacity-60">
              {busy ? "Envoi…" : "Envoyer, c'est tout"}
            </button>
          </div>
        </div>
      )}
    </Card>
  );
}
