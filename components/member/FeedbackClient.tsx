"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { FEEDBACK_DIMENSIONS, DIMENSION_LABELS } from "@/lib/feedback-constants";
import type { FeedbackDimension, FeedbackMessage, QualityFeedback } from "@/types";

type Mode = "encouragement" | "incident";

const STATUS_LABEL: Record<QualityFeedback["status"], string> = {
  new: "En attente",
  acknowledged: "Vu par le resto",
  resolved: "Réglé",
};

export function FeedbackClient({
  restaurantId,
  eligible,
  feedback,
  messages,
}: {
  restaurantId: string;
  eligible: boolean;
  feedback: QualityFeedback[];
  messages: FeedbackMessage[];
}) {
  const router = useRouter();
  const [mode, setMode] = useState<Mode | null>(null);
  const [dimensions, setDimensions] = useState<FeedbackDimension[]>([]);
  const [comment, setComment] = useState("");
  const [contactOptIn, setContactOptIn] = useState(false);
  const [anon, setAnon] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const threads = new Map<string, FeedbackMessage[]>();
  for (const m of messages) {
    const arr = threads.get(m.feedback_id) ?? [];
    arr.push(m);
    threads.set(m.feedback_id, arr);
  }

  function toggleDim(d: FeedbackDimension) {
    setDimensions((cur) => (cur.includes(d) ? cur.filter((x) => x !== d) : [...cur, d]));
  }
  function reset() {
    setMode(null);
    setDimensions([]);
    setComment("");
    setContactOptIn(false);
    setAnon(false);
    setError(null);
  }

  async function submit() {
    if (!mode) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          restaurantId,
          sentiment: mode,
          dimensions: mode === "incident" ? dimensions : [],
          comment: comment.trim() || null,
          contactOptIn: mode === "incident" ? contactOptIn : false,
          forceAnonymous: mode === "encouragement" ? anon : false,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(
          data?.error === "already_submitted"
            ? "Tu as déjà laissé un retour pour ta dernière commande."
            : data?.error === "not_eligible"
              ? "Reviens après quelques visites pour laisser un retour."
              : "Une erreur est survenue. Réessaie."
        );
        return;
      }
      setDone(true);
      reset();
      router.refresh();
    } catch {
      setError("Une erreur réseau est survenue.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-5">
      {done && (
        <div className="bg-green-50 border border-green-200 rounded-2xl p-4 text-sm text-green-800">
          Merci 💛 Ton retour a bien été transmis à ton resto.
        </div>
      )}

      {/* ── Formulaire ─────────────────────────────────────────────────────── */}
      {eligible ? (
        <div className="bg-white rounded-2xl border border-gray-100 p-5 space-y-4">
          {!mode && (
            <>
              <p className="font-semibold text-gray-900 text-sm">Comment s'est passée ta dernière visite ?</p>
              <div className="grid grid-cols-1 gap-2">
                <button
                  type="button"
                  onClick={() => { setMode("encouragement"); setDone(false); }}
                  className="flex items-center gap-3 rounded-xl border border-gray-200 p-3 text-left hover:border-brand-gold transition-colors"
                >
                  <span className="text-2xl" aria-hidden="true">💛</span>
                  <span>
                    <span className="block font-semibold text-gray-900 text-sm">Encourager mon resto</span>
                    <span className="block text-gray-600 text-sm">Dire ce qui était bien (ton prénom sera visible)</span>
                  </span>
                </button>
                <button
                  type="button"
                  onClick={() => { setMode("incident"); setDone(false); }}
                  className="flex items-center gap-3 rounded-xl border border-gray-200 p-3 text-left hover:border-brand-red transition-colors"
                >
                  <span className="text-2xl" aria-hidden="true">🙋</span>
                  <span>
                    <span className="block font-semibold text-gray-900 text-sm">Signaler un souci</span>
                    <span className="block text-gray-600 text-sm">En privé et anonyme — juste entre le resto et toi</span>
                  </span>
                </button>
              </div>
            </>
          )}

          {mode === "incident" && (
            <div className="space-y-3">
              <p className="font-semibold text-gray-900 text-sm">Qu'est-ce qui a coincé ?</p>
              <div className="flex flex-wrap gap-2">
                {FEEDBACK_DIMENSIONS.map((d) => {
                  const on = dimensions.includes(d);
                  return (
                    <button
                      key={d}
                      type="button"
                      onClick={() => toggleDim(d)}
                      className={`rounded-full border px-4 py-2.5 text-sm min-h-[44px] transition-colors ${
                        on ? "border-brand-red bg-brand-red/10 text-brand-red font-semibold" : "border-gray-200 text-gray-600"
                      }`}
                    >
                      {DIMENSION_LABELS[d]}
                    </button>
                  );
                })}
              </div>
              <div>
                <label htmlFor="feedback-comment-incident" className="block text-sm text-gray-700 mb-1">
                  Ton message (facultatif)
                </label>
                <textarea
                  id="feedback-comment-incident"
                  value={comment}
                  onChange={(e) => setComment(e.target.value)}
                  maxLength={1000}
                  rows={3}
                  placeholder="Un détail à ajouter ?"
                  className="w-full rounded-xl border border-gray-200 p-3 text-sm"
                />
              </div>
              <label className="flex items-center gap-2 text-sm text-gray-700">
                <input type="checkbox" checked={contactOptIn} onChange={(e) => setContactOptIn(e.target.checked)} />
                Je veux que le resto puisse me répondre (tu restes anonyme)
              </label>
            </div>
          )}

          {mode === "encouragement" && (
            <div className="space-y-3">
              <p className="font-semibold text-gray-900 text-sm">Un petit mot pour ton resto 💛</p>
              <div>
                <label htmlFor="feedback-comment-encouragement" className="block text-sm text-gray-700 mb-1">
                  Ton message (facultatif)
                </label>
                <textarea
                  id="feedback-comment-encouragement"
                  value={comment}
                  onChange={(e) => setComment(e.target.value)}
                  maxLength={1000}
                  rows={3}
                  placeholder="Ce qui était bien…"
                  className="w-full rounded-xl border border-gray-200 p-3 text-sm"
                />
              </div>
              <label className="flex items-center gap-2 text-sm text-gray-700">
                <input type="checkbox" checked={anon} onChange={(e) => setAnon(e.target.checked)} />
                Rester anonyme
              </label>
            </div>
          )}

          {mode && (
            <>
              {error && <p className="text-sm text-brand-red">{error}</p>}
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={submit}
                  disabled={busy || (mode === "incident" && dimensions.length === 0)}
                  className="flex-1 rounded-xl bg-brand-red text-white font-semibold py-2.5 text-sm disabled:opacity-40"
                >
                  {busy ? "Envoi…" : "Envoyer à mon resto"}
                </button>
                <button
                  type="button"
                  onClick={reset}
                  className="rounded-xl bg-gray-100 px-4 py-2.5 text-sm text-gray-700 hover:bg-gray-200 transition-colors"
                >
                  Annuler
                </button>
              </div>
              {mode === "incident" && dimensions.length === 0 && (
                <p className="text-sm text-gray-600">Coche au moins un point qui a coincé.</p>
              )}
            </>
          )}
        </div>
      ) : (
        <div className="bg-white rounded-2xl border border-gray-100 p-5 text-sm text-gray-500">
          Reviens après quelques visites : tu pourras alors encourager ton resto ou lui signaler un souci.
        </div>
      )}

      {/* ── Mes retours ────────────────────────────────────────────────────── */}
      {feedback.length > 0 && (
        <div className="space-y-3">
          <p className="font-semibold text-gray-900 text-sm">Mes retours</p>
          {feedback.map((f) => (
            <FeedbackCard key={f.id} feedback={f} messages={threads.get(f.id) ?? []} />
          ))}
        </div>
      )}
    </div>
  );
}

function FeedbackCard({ feedback, messages }: { feedback: QualityFeedback; messages: FeedbackMessage[] }) {
  const router = useRouter();
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [replyError, setReplyError] = useState(false);
  const isEnc = feedback.sentiment === "encouragement";

  async function reply() {
    if (!text.trim()) return;
    setBusy(true);
    setReplyError(false);
    try {
      const res = await fetch(`/api/feedback/${feedback.id}/reply`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ body: text }),
      });
      // Succès seulement : sinon on garde le texte saisi pour réessayer
      // (plus de faux « envoyé » silencieux ni de bouton figé — M4).
      if (res.ok) {
        setText("");
        router.refresh();
      } else {
        setReplyError(true);
      }
    } catch {
      // échec réseau — le texte reste, le bouton se réactive (finally)
      setReplyError(true);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="bg-white rounded-2xl border border-gray-100 p-4 space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-sm font-semibold text-gray-900">
          {isEnc ? "💛 Encouragement" : "🙋 Signalement"}
        </span>
        {/* Date d'historique = métadonnée : text-xs conservé, gray-500 pour le contraste */}
        <span className="text-xs text-gray-500">{new Date(feedback.created_at).toLocaleDateString("fr-BE")}</span>
      </div>
      {!isEnc && feedback.dimensions.length > 0 && (
        <p className="text-xs text-gray-500">{feedback.dimensions.map((d) => DIMENSION_LABELS[d]).join(" · ")}</p>
      )}
      {feedback.comment && <p className="text-sm text-gray-700">« {feedback.comment} »</p>}
      <span className="inline-block rounded-full bg-gray-100 px-2 py-0.5 text-xs text-gray-500">
        {STATUS_LABEL[feedback.status]}
      </span>

      {messages.length > 0 && (
        <div className="mt-2 space-y-2 border-t border-gray-100 pt-2">
          {messages.map((m) => (
            <div
              key={m.id}
              className={`rounded-xl px-3 py-2 text-sm ${
                m.sender === "establishment" ? "bg-brand-red/5 text-gray-800" : "bg-gray-100 text-gray-700"
              }`}
            >
              <span className="block text-xs text-gray-500 mb-0.5">
                {m.sender === "establishment" ? "Le resto" : "Toi"}
              </span>
              {m.body}
            </div>
          ))}
          <div className="flex gap-2">
            <input
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder="Répondre…"
              aria-label="Ta réponse"
              className="flex-1 rounded-xl border border-gray-200 px-3 py-2 text-sm"
            />
            <button
              type="button"
              onClick={reply}
              disabled={busy || !text.trim()}
              className="rounded-xl bg-brand-red text-white px-4 py-2.5 min-h-[44px] text-sm disabled:opacity-40 shrink-0"
            >
              {busy ? "…" : "Envoyer à mon resto"}
            </button>
          </div>
          {replyError && (
            <p className="text-sm text-brand-red">
              L&apos;envoi a échoué. Vérifie ta connexion et réessaie.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
