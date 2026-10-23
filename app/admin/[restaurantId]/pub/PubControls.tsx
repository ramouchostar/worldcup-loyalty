"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { cancel, pause, recharge } from "./actions";

const BTN_LIGHT = "rounded-lg border border-paper-border bg-white px-4 py-3 text-[14px] font-semibold text-ink hover:bg-paper-subtle disabled:opacity-50";
const BTN_BOOST = "rounded-lg bg-boost-olive px-4 py-3 text-[14px] font-semibold text-white hover:bg-boost-olive-dark disabled:opacity-50";

export function PauseButton({ restaurantId, requestId, paused }: { restaurantId: string; requestId: string; paused: boolean }) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();
  return (
    <div className="flex-1 basis-32">
      <button
        type="button"
        disabled={pending}
        className={`w-full ${BTN_LIGHT}`}
        onClick={() =>
          start(async () => {
            setError(null);
            const r = await pause(restaurantId, requestId, !paused);
            if (!r.ok) setError(r.error ?? "Réessaie.");
            router.refresh();
          })
        }
      >
        {pending ? "…" : paused ? "Relancer" : "Mettre en pause"}
      </button>
      {error && <p className="mt-1 text-[13px] text-danger">{error}</p>}
    </div>
  );
}

export function RechargeForm({ restaurantId, requestId, hasOpenNotice, label = "Ajouter du budget" }: { restaurantId: string; requestId: string; hasOpenNotice: boolean; label?: string }) {
  const [open, setOpen] = useState(false);
  const [euros, setEuros] = useState(100);
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const router = useRouter();
  if (hasOpenNotice) return <p className="flex-1 basis-40 text-[13px] text-ink-muted">Un virement est attendu : il s&apos;ajoutera dès réception.</p>;
  if (!open)
    return (
      <button type="button" className={`flex-1 basis-40 ${BTN_BOOST}`} onClick={() => setOpen(true)}>
        {label}
      </button>
    );
  return (
    <form
      className="flex w-full flex-wrap items-end gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        start(async () => {
          const r = await recharge(restaurantId, requestId, euros);
          setMsg(r.ok ? { ok: true, text: "C'est noté : le virement à faire est dans ta pub et dans ton e-mail." } : { ok: false, text: r.error ?? "Réessaie." });
          if (r.ok) router.refresh();
        });
      }}
    >
      <label className="text-[13px] text-ink-body">
        Budget à ajouter (€)
        <input type="number" min={50} step={10} value={euros} onChange={(e) => setEuros(Number(e.target.value))} className="mt-1 block w-32 rounded-lg border border-paper-border px-3 py-2.5 text-[15px]" />
      </label>
      <button type="submit" disabled={pending} className={BTN_BOOST}>
        {pending ? "…" : "Demander"}
      </button>
      {msg && <p className={`w-full text-[13px] ${msg.ok ? "text-good" : "text-danger"}`}>{msg.text}</p>}
    </form>
  );
}

export function CancelButton({ restaurantId, requestId }: { restaurantId: string; requestId: string }) {
  const [pending, start] = useTransition();
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();
  return (
    <div>
      <button
        type="button"
        disabled={pending}
        className={`w-full ${BTN_LIGHT} text-ink-body`}
        onClick={() => {
          if (!confirming) return setConfirming(true);
          start(async () => {
            const r = await cancel(restaurantId, requestId);
            if (!r.ok) return setError(r.error ?? "Réessaie.");
            router.push(`/admin/${restaurantId}/pub`);
            router.refresh();
          });
        }}
      >
        {confirming ? "Confirmer l'annulation" : "Annuler la demande"}
      </button>
      {error && <p className="mt-1 text-[13px] text-danger">{error}</p>}
    </div>
  );
}

export function CopyButton({ value, label = "Copier" }: { value: string; label?: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      className="shrink-0 rounded-lg border border-paper-border bg-white px-3 py-2.5 text-[13px] font-semibold text-ink hover:bg-paper-subtle"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(value);
          setCopied(true);
          setTimeout(() => setCopied(false), 2000);
        } catch {
          /* presse-papiers refusé : la valeur reste lisible à l'écran */
        }
      }}
    >
      {copied ? "Copié" : label}
    </button>
  );
}
