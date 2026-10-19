"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { FileCheck2, Plus, X } from "lucide-react";
import { Card, SectionLabel } from "@/components/admin/ui";
import { DELIVERY_ISSUE_TEXT, type DeliveryIssue } from "@/lib/mission-dayof";
import { MAX_BAT_ROUNDS, PRINT_DELIVERY_ISSUE_TEXT, type BatPhase } from "@/lib/mission-print";

// ADR 0084 §5 bis — l'imprimeur : envoie l'épreuve (bon à tirer), corrige si le restaurateur le demande (deux tours), imprime APRÈS
// la signature, puis dit où et quand c'est livré. Il reteste le QR code sur l'épreuve avant de l'envoyer.

export type ProviderProof = { id: string; round: number; status: "proposed" | "corrections" | "signed"; corrections: { category: string; text: string }[] | null; signedName: string | null };

const input = "w-full border border-paper-border rounded-xl px-3 py-2.5 text-[14px] text-ink bg-white focus:outline-none focus-visible:ring-2 focus-visible:ring-boost-olive";
const primary = "w-full inline-flex items-center justify-center min-h-[44px] px-5 rounded-xl bg-boost-olive text-white text-[14px] font-semibold shadow-[inset_0_-3px_0_#4F5C2D] hover:brightness-95 disabled:opacity-60";

async function post(url: string, body: unknown) {
  const res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  return { ok: res.ok, status: res.status, data: (await res.json().catch(() => ({}))) as Record<string, unknown> };
}

function LinksAndMessage({ url, title, help, messageLabel, linksOptional, cta }: { url: string; title: string; help: string; messageLabel: string; linksOptional: boolean; cta: string }) {
  const router = useRouter();
  const [links, setLinks] = useState<string[]>([]);
  const [draft, setDraft] = useState("");
  const [message, setMessage] = useState("");
  const [issues, setIssues] = useState<DeliveryIssue[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  function add() {
    const t = draft.trim();
    if (!t || links.length >= 10) return;
    setLinks((l) => (l.includes(t) ? l : [...l, t]));
    setDraft("");
  }

  async function send() {
    const all = draft.trim() && !links.includes(draft.trim()) ? [...links, draft.trim()] : links;
    setBusy(true);
    setError(null);
    setIssues([]);
    try {
      const r = await post(url, { links: all, message });
      if (r.ok) return router.refresh();
      if (r.status === 422 && Array.isArray(r.data.issues)) setIssues(r.data.issues as DeliveryIssue[]);
      setError((r.data.error as string) ?? "Impossible pour le moment. Réessaie.");
    } catch {
      setError("Pas de connexion. Réessaie dans un instant.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card className="space-y-4">
      <div>
        <h2 className="font-display text-[20px] font-bold tracking-[-0.02em] text-ink">{title}</h2>
        <p className="text-ink-muted text-[13.5px] mt-1">{help}</p>
      </div>
      {links.length > 0 && (
        <ul className="space-y-2">
          {links.map((l, i) => (
            <li key={l} className="flex items-center gap-2 bg-boost-cream border border-boost-olive/30 rounded-xl pl-3 pr-1 min-h-[44px]">
              <span className="flex-1 min-w-0 truncate text-[13.5px] text-ink">{l}</span>
              <button type="button" onClick={() => setLinks((x) => x.filter((_, j) => j !== i))} aria-label="Retirer ce lien" className="w-10 h-10 rounded-full flex items-center justify-center hover:bg-boost-olive/10">
                <X className="w-4 h-4" aria-hidden />
              </button>
            </li>
          ))}
        </ul>
      )}
      <div className="flex gap-2">
        <input
          aria-label={linksOptional ? "Lien de suivi (facultatif)" : "Lien de l'épreuve"}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              add();
            }
          }}
          placeholder="https://…"
          inputMode="url"
          className={`${input} flex-1 min-w-0`}
        />
        <button type="button" onClick={add} className="inline-flex items-center gap-1 min-h-[44px] px-4 rounded-xl border border-paper-border bg-white text-ink text-[14px] font-semibold">
          <Plus className="w-4 h-4" aria-hidden /> Ajouter
        </button>
      </div>
      {issues.length > 0 && (
        <ul role="alert" className="text-danger text-[13px] font-semibold space-y-0.5">
          {issues.map((i, k) => (
            <li key={k}>{linksOptional && i.code === "no_link" ? PRINT_DELIVERY_ISSUE_TEXT.no_link : `${i.index !== undefined ? `Lien ${i.index + 1} : ` : ""}${DELIVERY_ISSUE_TEXT[i.code]}`}</li>
          ))}
        </ul>
      )}
      <div className="space-y-1.5">
        <label htmlFor={`m-${title}`} className="block text-[14px] font-semibold text-ink">
          {messageLabel}
        </label>
        <textarea id={`m-${title}`} value={message} onChange={(e) => setMessage(e.target.value)} rows={3} maxLength={1000} className={input} />
      </div>
      {error && (
        <p role="alert" className="text-danger text-[13.5px] font-semibold">
          {error}
        </p>
      )}
      <button type="button" disabled={busy} onClick={send} className={primary}>
        {busy ? "Envoi…" : cta}
      </button>
    </Card>
  );
}

export function BatPanel({ missionId, phase, proofs, qrUrl }: { missionId: string; phase: BatPhase; proofs: ProviderProof[]; qrUrl: string | null }) {
  const last = proofs.at(-1) ?? null;
  const signed = proofs.find((p) => p.status === "signed") ?? null;

  if (phase === "signed" && signed) {
    return (
      <>
        <Card className="space-y-1.5">
          <SectionLabel>Bon à tirer signé</SectionLabel>
          <p className="text-[14px] text-good font-semibold inline-flex items-center gap-1.5">
            <FileCheck2 className="w-4 h-4" aria-hidden /> Signé par {signed.signedName}
          </p>
          <p className="text-[13.5px] text-ink-muted">Tu peux imprimer. Ce que tu imprimes doit correspondre à l&apos;épreuve signée : plus personne ne peut annuler ni corriger.</p>
        </Card>
        <LinksAndMessage url={`/api/prestataire/missions/${missionId}/deliver`} title="Livrer l'impression" help="Dis où et quand c'est livré, ou que c'est prêt au retrait. Le restaurateur confirmera la réception." messageLabel="Où et quand" linksOptional cta="Dire que c'est livré" />
      </>
    );
  }

  if (phase === "awaiting_review") {
    return (
      <Card className="space-y-1">
        <SectionLabel>Bon à tirer</SectionLabel>
        <p className="text-[13.5px] text-ink-muted">Ton épreuve {last?.round ?? 1} est chez le restaurateur : il la signe ou demande des corrections. Tu es prévenu par e-mail.</p>
      </Card>
    );
  }

  const corrections = phase === "corrections" ? (last?.corrections ?? []) : [];
  return (
    <>
      {corrections.length > 0 && (
        <Card className="space-y-3">
          <SectionLabel>Corrections demandées · épreuve {last?.round}</SectionLabel>
          <p className="text-[13px] text-ink-muted">Toutes ses corrections, d&apos;un seul envoi. Une correction ne refait pas le projet.</p>
          <ol className="space-y-2">
            {corrections.map((c, i) => (
              <li key={i} className="rounded-xl border border-paper-border bg-white p-3">
                <p className="text-[12px] font-semibold text-ink-muted">{c.category}</p>
                <p className="text-[14px] text-ink whitespace-pre-line">{c.text}</p>
              </li>
            ))}
          </ol>
        </Card>
      )}
      <LinksAndMessage
        url={`/api/prestataire/missions/${missionId}/proof`}
        title={phase === "corrections" ? `Envoyer l'épreuve ${(last?.round ?? 0) + 1}` : "Envoyer l'épreuve (bon à tirer)"}
        help={`Colle le lien https de l'épreuve (PDF). ${qrUrl ? "Reteste le QR code sur l'épreuve avant de l'envoyer. " : ""}${MAX_BAT_ROUNDS} épreuves au plus : l'originale et deux corrections. Tu n'imprimes qu'après la signature.`}
        messageLabel="Un mot pour le restaurateur (facultatif)"
        linksOptional={false}
        cta="Envoyer l'épreuve"
      />
    </>
  );
}
