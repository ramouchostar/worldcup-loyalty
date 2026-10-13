"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { markPaidOutAction, openDisputeAction, resolveDisputeAction } from "../../actions";
import { DECISION_LABELS, type Decision } from "@/lib/mission-dispute";

const INPUT = "w-full rounded-lg border border-gray-300 dark:border-gray-700 bg-transparent px-2.5 py-1.5 text-sm";
const BTN = "rounded-lg bg-gray-900 dark:bg-white text-white dark:text-gray-900 font-semibold text-xs px-3 py-2 disabled:opacity-50";
const BTN_GHOST = "rounded-lg border border-gray-300 dark:border-gray-700 font-semibold text-xs px-3 py-2 text-gray-700 dark:text-gray-200 disabled:opacity-50";

export function OpenDisputeForm({ missionId }: { missionId: string }) {
  const router = useRouter();
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function open() {
    if (!window.confirm("Ouvrir un litige ? Les rappels, les validations et les versements automatiques s'arrêtent pour cette mission, et les deux parties sont prévenues.")) return;
    setBusy(true);
    setError(null);
    const r = await openDisputeAction(missionId, reason);
    if (r.error) setError(r.error);
    else router.refresh();
    setBusy(false);
  }

  return (
    <div className="space-y-2">
      <label className="block space-y-1 text-xs font-medium">
        Pourquoi ouvrir un litige ?
        <textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={3} maxLength={1000} placeholder="Ce que tu as constaté, en quelques phrases : c'est le début du dossier." className={INPUT} />
      </label>
      {error && <p role="alert" className="text-xs font-semibold text-red-600">{error}</p>}
      <button type="button" disabled={busy || reason.trim().length < 10} onClick={open} className={BTN}>
        {busy ? "…" : "Ouvrir un litige"}
      </button>
    </div>
  );
}

export function ResolveDisputeForm({ missionId, hasDelivery }: { missionId: string; hasDelivery: boolean }) {
  const router = useRouter();
  const [decision, setDecision] = useState<Decision | null>(null);
  const [pct, setPct] = useState("50");
  const [sanction, setSanction] = useState("none");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function resolve() {
    if (!decision) return;
    if (!window.confirm(`${DECISION_LABELS[decision].title}. La décision est définitive et les deux parties sont prévenues. Confirmer ?`)) return;
    setBusy(true);
    setError(null);
    const r = await resolveDisputeAction(missionId, { decision, providerPct: pct, sanction: decision === "pay" ? "none" : sanction, note });
    if (r.error) setError(r.error);
    else router.refresh();
    setBusy(false);
  }

  return (
    <div className="space-y-4">
      <div className="grid gap-2 sm:grid-cols-3">
        {(["pay", "refund", "split"] as const).map((d) => {
          const disabled = d === "pay" && !hasDelivery;
          return (
            <button key={d} type="button" disabled={disabled} onClick={() => setDecision(d)} aria-pressed={decision === d} className={`text-left rounded-xl border p-3 space-y-1 ${decision === d ? "border-gray-900 dark:border-white bg-gray-50 dark:bg-gray-800" : "border-gray-300 dark:border-gray-700"} ${disabled ? "opacity-40" : ""}`}>
              <span className="block text-sm font-semibold">{DECISION_LABELS[d].title}</span>
              <span className="block text-xs text-gray-500">{disabled ? "Aucune livraison à valider." : DECISION_LABELS[d].sub}</span>
            </button>
          );
        })}
      </div>

      {decision === "split" && (
        <label className="flex items-center gap-2 text-xs font-medium">
          Part du prestataire
          <input value={pct} onChange={(e) => setPct(e.target.value)} inputMode="numeric" className="w-20 rounded-lg border border-gray-300 dark:border-gray-700 bg-transparent px-2.5 py-1.5 text-sm" />
          <span>% de ce qu&apos;il aurait reçu (1 à 99)</span>
        </label>
      )}

      {(decision === "refund" || decision === "split") && (
        <label className="block space-y-1 text-xs font-medium">
          Sanction du prestataire
          <select value={sanction} onChange={(e) => setSanction(e.target.value)} className="rounded-lg border border-gray-300 dark:border-gray-700 bg-transparent px-2.5 py-1.5 text-sm">
            <option value="none">Aucune</option>
            <option value="avertissement">Un avertissement</option>
            <option value="penalite">Une pénalité (visibilité réduite, puis exclusion en cas de récidive)</option>
          </select>
        </label>
      )}

      <label className="block space-y-1 text-xs font-medium">
        Ta décision, en quelques mots <span className="font-normal text-gray-500">· gardée dans le dossier</span>
        <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={3} maxLength={1000} className={INPUT} />
      </label>
      {error && <p role="alert" className="text-xs font-semibold text-red-600">{error}</p>}
      <button type="button" disabled={busy || !decision || note.trim().length < 10} onClick={resolve} className={BTN}>
        {busy ? "…" : "Trancher"}
      </button>
    </div>
  );
}

export function PaidOutButton({ missionId, amount }: { missionId: string; amount: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function go() {
    if (!window.confirm(`Le versement de ${amount} au prestataire est bien fait ? Il en est prévenu par e-mail.`)) return;
    setBusy(true);
    const r = await markPaidOutAction(missionId);
    if (r.error) setError(r.error);
    else router.refresh();
    setBusy(false);
  }
  return (
    <div className="space-y-1">
      <button type="button" disabled={busy} onClick={go} className={BTN_GHOST}>
        {busy ? "…" : "Marquer comme versé"}
      </button>
      {error && <p role="alert" className="text-xs font-semibold text-red-600">{error}</p>}
    </div>
  );
}
