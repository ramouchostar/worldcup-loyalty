"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { FileCheck2, Plus, X } from "lucide-react";
import { Card, SectionLabel } from "@/components/admin/ui";
import type { DeliveryIssue } from "@/lib/mission-dayof";
import { MAX_BAT_ROUNDS, type BatPhase } from "@/lib/mission-print";
import { useT } from "@/components/i18n/I18nProvider";
import type { MessageKey } from "@/lib/i18n/core";

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
  const tr = useT();
  const { t } = tr;
  const [links, setLinks] = useState<string[]>([]);
  const [draft, setDraft] = useState("");
  const [message, setMessage] = useState("");
  const [issues, setIssues] = useState<DeliveryIssue[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  function add() {
    const link = draft.trim();
    if (!link || links.length >= 10) return;
    setLinks((l) => (l.includes(link) ? l : [...l, link]));
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
      setError(tr.err(r.data, "err.generic"));
    } catch {
      setError(t("err.network"));
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
              <button type="button" onClick={() => setLinks((x) => x.filter((_, j) => j !== i))} aria-label={t("deliver.removeLink")} className="w-10 h-10 rounded-full flex items-center justify-center hover:bg-boost-olive/10">
                <X className="w-4 h-4" aria-hidden />
              </button>
            </li>
          ))}
        </ul>
      )}
      <div className="flex gap-2">
        <input
          aria-label={linksOptional ? t("bat.link.tracking") : t("bat.link.proof")}
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
          <Plus className="w-4 h-4" aria-hidden /> {t("deliver.add")}
        </button>
      </div>
      {issues.length > 0 && (
        <ul role="alert" className="text-danger text-[13px] font-semibold space-y-0.5">
          {issues.map((i, k) => (
            <li key={k}>{linksOptional && i.code === "no_link" ? t("bat.print.noLink") : `${i.index !== undefined ? t("deliver.linkN", { n: i.index + 1 }) : ""}${t(`deliver.issue.${i.code}` as MessageKey)}`}</li>
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
        {busy ? t("quote.sending") : cta}
      </button>
    </Card>
  );
}

export function BatPanel({ missionId, phase, proofs, qrUrl }: { missionId: string; phase: BatPhase; proofs: ProviderProof[]; qrUrl: string | null }) {
  const { t } = useT();
  const last = proofs.at(-1) ?? null;
  const signed = proofs.find((p) => p.status === "signed") ?? null;

  if (phase === "signed" && signed) {
    return (
      <>
        <Card className="space-y-1.5">
          <SectionLabel>{t("bat.signed.title")}</SectionLabel>
          <p className="text-[14px] text-good font-semibold inline-flex items-center gap-1.5">
            <FileCheck2 className="w-4 h-4" aria-hidden /> {t("bat.signed.by", { name: signed.signedName ?? "" })}
          </p>
          <p className="text-[13.5px] text-ink-muted">{t("bat.signed.note")}</p>
        </Card>
        <LinksAndMessage url={`/api/prestataire/missions/${missionId}/deliver`} title={t("bat.print.title")} help={t("bat.print.help")} messageLabel={t("bat.print.message")} linksOptional cta={t("bat.print.cta")} />
      </>
    );
  }

  if (phase === "awaiting_review") {
    return (
      <Card className="space-y-1">
        <SectionLabel>{t("bat.awaiting.title")}</SectionLabel>
        <p className="text-[13.5px] text-ink-muted">{t("bat.awaiting.body", { round: last?.round ?? 1 })}</p>
      </Card>
    );
  }

  const corrections = phase === "corrections" ? (last?.corrections ?? []) : [];
  return (
    <>
      {corrections.length > 0 && (
        <Card className="space-y-3">
          <SectionLabel>{t("bat.corrections.title", { round: last?.round ?? 1 })}</SectionLabel>
          <p className="text-[13px] text-ink-muted">{t("bat.corrections.note")}</p>
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
        title={phase === "corrections" ? t("bat.send.titleN", { n: (last?.round ?? 0) + 1 }) : t("bat.send.title")}
        help={t("bat.send.help", { qr: qrUrl ? t("bat.send.qr") : "", max: MAX_BAT_ROUNDS })}
        messageLabel={t("bat.send.message")}
        linksOptional={false}
        cta={t("bat.send.cta")}
      />
    </>
  );
}
