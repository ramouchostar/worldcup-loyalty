"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Star } from "lucide-react";
import { Card, SectionLabel } from "@/components/admin/ui";
import { COMMENT_MAX, RATING_MAX, REVIEW_PROMPT } from "@/lib/mission-reviews";

// ADR 0084 §5 decies — l'avis donné une fois la mission validée. Une note de 1 à 5 et un mot ; définitif (l'écran le dit avant
// d'envoyer). Côté restaurateur l'avis est public sans son nom ; côté prestataire il est privé : l'écran dit lequel des deux.

export function ReviewCard({ audience, url, extra }: { audience: "restaurant" | "provider"; url: string; extra?: Record<string, unknown> }) {
  const router = useRouter();
  const prompt = REVIEW_PROMPT[audience];
  const [rating, setRating] = useState(0);
  const [comment, setComment] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function send() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...extra, rating, comment }) });
      const body = await res.json().catch(() => ({}));
      if (res.ok || body.reason === "already_reviewed") router.refresh();
      else setError(body.error ?? "Envoi impossible pour le moment.");
    } catch {
      setError("Envoi impossible : vérifie ta connexion.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card className="space-y-3">
      <div>
        <SectionLabel>{prompt.title}</SectionLabel>
        <p className="text-[13px] text-ink-muted mt-1">{prompt.hint}</p>
      </div>
      <div role="radiogroup" aria-label="Ta note sur 5" className="flex gap-1">
        {Array.from({ length: RATING_MAX }, (_, i) => i + 1).map((n) => (
          <button
            key={n}
            type="button"
            role="radio"
            aria-checked={rating === n}
            aria-label={`${n} sur ${RATING_MAX}`}
            onClick={() => {
              setRating(n);
              setError(null);
            }}
            className="min-h-[44px] min-w-[44px] grid place-items-center"
          >
            <Star className={`w-7 h-7 ${n <= rating ? "fill-ink text-ink" : "text-ink-faint"}`} aria-hidden />
          </button>
        ))}
      </div>
      <div className="space-y-1">
        <textarea
          value={comment}
          maxLength={COMMENT_MAX + 50}
          onChange={(e) => setComment(e.target.value)}
          aria-label="Ton commentaire"
          placeholder={rating > 0 && rating <= 2 ? "Dis en une phrase ce qui n'a pas été." : "Un mot sur la collaboration (facultatif)."}
          className="w-full min-h-[88px] rounded-lg border border-paper-border bg-white px-3 py-2 text-[14px] text-ink"
        />
        <p className="text-right text-[11.5px] text-ink-muted tabular-nums">{comment.length}/{COMMENT_MAX}</p>
      </div>
      {error && (
        <p role="alert" className="text-[13px] text-danger">
          {error}
        </p>
      )}
      <button type="button" disabled={busy || rating === 0} onClick={send} className="min-h-[44px] px-5 rounded-lg bg-ink text-white text-[14px] font-semibold disabled:opacity-60">
        {busy ? "Envoi…" : "Envoyer mon avis"}
      </button>
    </Card>
  );
}
