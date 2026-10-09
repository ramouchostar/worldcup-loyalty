"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { REFUSAL_REASONS } from "@/lib/mission-quote";

// Refuser un brief : toujours avec une raison — le restaurateur la lit, et la plateforme
// la compte (briefs trop flous, budgets trop bas). Pas de refus muet.
export function RefuseForm({ missionId }: { missionId: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState<string | null>(null);
  const [note, setNote] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function send() {
    if (!reason) {
      setError("Choisis une raison : le restaurateur la lira.");
      return;
    }
    setSending(true);
    setError(null);
    try {
      const res = await fetch(`/api/prestataire/missions/${missionId}/refuse`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason, note }),
      });
      const body = await res.json().catch(() => ({}));
      if (res.ok) {
        router.refresh();
        return;
      }
      setError(body.error ?? "Refus impossible pour le moment. Réessaie.");
    } catch {
      setError("Pas de connexion. Réessaie dans un instant.");
    } finally {
      setSending(false);
    }
  }

  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)} className="text-[13.5px] font-semibold text-ink underline underline-offset-2 min-h-[44px]">
        Je ne peux pas faire cette mission
      </button>
    );
  }

  return (
    <div className="space-y-3 rounded-xl border border-paper-border bg-white p-4">
      <p className="text-[14px] font-semibold text-ink">Pourquoi ?</p>
      <div role="radiogroup" aria-label="Raison du refus" className="space-y-2">
        {REFUSAL_REASONS.map((r) => (
          <button
            key={r}
            type="button"
            role="radio"
            aria-checked={reason === r}
            onClick={() => setReason(r)}
            className={`w-full text-left rounded-xl border px-3 py-2.5 min-h-[44px] text-[14px] ${reason === r ? "border-boost-olive bg-boost-cream font-semibold" : "border-paper-border bg-white"}`}
          >
            {r}
          </button>
        ))}
      </div>
      <textarea
        value={note}
        onChange={(e) => setNote(e.target.value)}
        rows={2}
        maxLength={500}
        placeholder="Un mot pour le restaurateur (facultatif)"
        className="w-full border border-paper-border rounded-xl px-3 py-2.5 text-[14px] text-ink bg-white focus:outline-none focus-visible:ring-2 focus-visible:ring-boost-olive"
      />
      {error && (
        <p role="alert" className="text-danger text-[13px] font-semibold">
          {error}
        </p>
      )}
      <div className="flex gap-3">
        <button type="button" onClick={() => setOpen(false)} className="min-h-[44px] px-4 rounded-lg border border-paper-border bg-white text-[14px] font-semibold text-ink">
          Annuler
        </button>
        <button type="button" disabled={sending} onClick={send} className="flex-1 min-h-[44px] px-4 rounded-lg bg-ink text-white text-[14px] font-semibold disabled:opacity-60">
          {sending ? "Envoi…" : "Refuser ce brief"}
        </button>
      </div>
    </div>
  );
}
