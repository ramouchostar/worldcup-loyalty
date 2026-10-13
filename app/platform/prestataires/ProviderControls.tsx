"use client";

import { useActionState, useState } from "react";
import { acceptQuote, cancelAsPlatform, inviteProvider, reissueInvite, settleCancellationAction, toggleProviderStatus, type InviteActionResult } from "./actions";
import { FAULT_LABELS, type Fault } from "@/lib/mission-cancel-rules";

const INPUT = "w-full rounded-lg border border-gray-300 dark:border-gray-700 bg-transparent px-2.5 py-1.5 text-sm";
const BTN = "rounded-lg bg-gray-900 dark:bg-white text-white dark:text-gray-900 font-semibold text-xs px-3 py-2 disabled:opacity-50";
const BTN_GHOST = "rounded-lg border border-gray-300 dark:border-gray-700 font-semibold text-xs px-3 py-2 text-gray-700 dark:text-gray-200 disabled:opacity-50";

const METIERS: [string, string][] = [
  ["video", "Vidéo"],
  ["photo", "Photo"],
  ["design", "Design"],
  ["impression", "Impression"],
];

function LinkBox({ url, emailed }: { url: string; emailed?: boolean }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="rounded-lg border border-emerald-300 bg-emerald-50 dark:bg-emerald-950/30 dark:border-emerald-800 p-3 space-y-2">
      <p className="text-xs text-emerald-900 dark:text-emerald-200">
        {emailed === true
          ? "Lien envoyé par e-mail."
          : emailed === false
            ? "E-mail non parti (clé d'envoi absente ou refusée) : partage le lien toi-même."
            : "Lien personnel."}{" "}
        Il est lié à l&apos;adresse du prestataire.
      </p>
      <div className="flex items-center gap-2">
        <input readOnly value={url} onFocus={(e) => e.currentTarget.select()} className={`${INPUT} font-mono text-xs`} />
        <button
          type="button"
          className={BTN_GHOST}
          onClick={() => {
            navigator.clipboard?.writeText(url);
            setCopied(true);
          }}
        >
          {copied ? "Copié" : "Copier"}
        </button>
      </div>
      <a href={`https://wa.me/?text=${encodeURIComponent(`Ton espace prestataire Boosteats 👉 ${url}`)}`} target="_blank" rel="noopener noreferrer" className="block text-center bg-[#25D366] text-white rounded-lg py-2 text-xs font-semibold">
        Envoyer par WhatsApp
      </a>
    </div>
  );
}

export function InviteForm() {
  const [state, action, pending] = useActionState<InviteActionResult | null, FormData>(inviteProvider, null);
  return (
    <form action={action} className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="space-y-1 text-xs font-medium">
          Nom affiché
          <input name="name" required minLength={2} maxLength={120} placeholder="Studio Croustille" className={INPUT} />
        </label>
        <label className="space-y-1 text-xs font-medium">
          Adresse e-mail (le lien lui est lié)
          <input name="email" type="email" required placeholder="studio@exemple.be" className={INPUT} />
        </label>
      </div>
      <fieldset className="flex flex-wrap gap-4 text-sm">
        <legend className="text-xs font-medium mb-1">Métiers</legend>
        {METIERS.map(([value, label]) => (
          <label key={value} className="inline-flex items-center gap-1.5">
            <input type="checkbox" name="metiers" value={value} defaultChecked={value === "video"} /> {label}
          </label>
        ))}
      </fieldset>
      <button type="submit" disabled={pending} className={BTN}>
        {pending ? "Création…" : "Créer et inviter"}
      </button>
      {state?.error && (
        <p role="alert" className="text-xs font-semibold text-red-600">
          {state.error}
        </p>
      )}
      {state?.url && (
        <div className="space-y-1">
          <p className="text-xs font-semibold">{state.name} est invité.</p>
          <LinkBox url={state.url} emailed={state.emailed} />
        </div>
      )}
    </form>
  );
}

export function ProviderActions({ providerId, status, hasAccount }: { providerId: string; status: string; hasAccount: boolean }) {
  const [result, setResult] = useState<InviteActionResult | null>(null);
  const [busy, setBusy] = useState(false);

  async function reissue() {
    setBusy(true);
    setResult(await reissueInvite(providerId));
    setBusy(false);
  }
  async function toggle(next: "active" | "suspended") {
    setBusy(true);
    const r = await toggleProviderStatus(providerId, next);
    setResult(r.error ? { error: r.error } : null);
    setBusy(false);
  }

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-2">
        {status === "invited" && (
          <button type="button" disabled={busy} onClick={reissue} className={BTN_GHOST}>
            Nouveau lien
          </button>
        )}
        {hasAccount && status === "active" && (
          <button type="button" disabled={busy} onClick={() => toggle("suspended")} className={BTN_GHOST}>
            Suspendre
          </button>
        )}
        {hasAccount && status === "suspended" && (
          <button type="button" disabled={busy} onClick={() => toggle("active")} className={BTN}>
            Réactiver
          </button>
        )}
      </div>
      {result?.error && (
        <p role="alert" className="text-xs font-semibold text-red-600">
          {result.error}
        </p>
      )}
      {result?.url && <LinkBox url={result.url} emailed={result.emailed} />}
    </div>
  );
}

export function AcceptQuoteButton({ missionId, deposit }: { missionId: string; deposit: string }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function accept() {
    if (!window.confirm(`Le restaurateur a dit oui et l'acompte (${deposit}) est convenu ? Les montants seront figés avec son plan d'aujourd'hui.`)) return;
    setBusy(true);
    setError(null);
    const r = await acceptQuote(missionId);
    if (r.error) setError(r.error);
    setBusy(false);
  }
  return (
    <div className="space-y-1">
      <button type="button" disabled={busy} onClick={accept} className={BTN}>
        {busy ? "…" : "Enregistrer l'acceptation"}
      </button>
      {error && (
        <p role="alert" className="text-xs font-semibold text-red-600">
          {error}
        </p>
      )}
    </div>
  );
}

/** Un tournage passé sans démarrage : la plateforme tranche (qui est en faute, ou force majeure). */
export function MissedShootControls({ missionId }: { missionId: string }) {
  const [fault, setFault] = useState<Fault | null>(null);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ error?: string; summary?: string } | null>(null);
  async function decide() {
    if (!fault) return;
    if (!window.confirm(`${FAULT_LABELS[fault]}. Annuler la mission avec cette décision ? Elle est définitive.`)) return;
    setBusy(true);
    setResult(await cancelAsPlatform(missionId, fault, reason, fault !== "none"));
    setBusy(false);
  }
  return (
    <div className="space-y-2 w-full">
      <div className="flex flex-wrap gap-2">
        {(["restaurant", "provider", "none"] as const).map((f) => (
          <button key={f} type="button" onClick={() => setFault(f)} className={fault === f ? BTN : BTN_GHOST}>
            {FAULT_LABELS[f]}
          </button>
        ))}
      </div>
      <input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Ce que tu as constaté (obligatoire)" maxLength={500} className={INPUT} />
      <button type="button" disabled={busy || !fault || reason.trim().length < 5} onClick={decide} className={BTN}>
        {busy ? "…" : "Annuler avec cette décision"}
      </button>
      {result?.error && <p role="alert" className="text-xs font-semibold text-red-600">{result.error}</p>}
      {result?.summary && <p role="status" className="text-xs font-semibold text-emerald-700">{result.summary}</p>}
    </div>
  );
}

export function SettleButton({ missionId }: { missionId: string }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function settle() {
    if (!window.confirm("Le remboursement ou le règlement est bien fait ? La ligne quittera la liste.")) return;
    setBusy(true);
    const r = await settleCancellationAction(missionId);
    if (r.error) setError(r.error);
    setBusy(false);
  }
  return (
    <div className="space-y-1">
      <button type="button" disabled={busy} onClick={settle} className={BTN}>
        {busy ? "…" : "Marquer comme réglé"}
      </button>
      {error && <p role="alert" className="text-xs font-semibold text-red-600">{error}</p>}
    </div>
  );
}

export { LinkBox };
