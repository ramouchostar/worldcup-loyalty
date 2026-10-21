"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Check, Plus, X } from "lucide-react";
import { Card, SectionLabel } from "@/components/admin/ui";
import { REPORT_MISSING_OPTIONS, type DeliveryIssue, type ReportIssue } from "@/lib/mission-dayof";
import { useT } from "@/components/i18n/I18nProvider";
import type { MessageKey } from "@/lib/i18n/core";

// ADR 0084 §5 — le jour J, côté prestataire : « Je suis arrivé », le compte-rendu (heures réelles, ce qui a
// manqué), puis la livraison (liens https). Le compte-rendu est la pièce de référence en cas de litige :
// l'écran le dit. La livraison se fait par liens de téléchargement dans cette version.

async function post(url: string, body: unknown): Promise<{ ok: boolean; status: number; data: Record<string, unknown> }> {
  const res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  return { ok: res.ok, status: res.status, data: await res.json().catch(() => ({})) };
}

const input = "w-full border border-paper-border rounded-xl px-3 py-2.5 text-[14px] text-ink bg-white focus:outline-none focus-visible:ring-2 focus-visible:ring-boost-olive";
const primary = "w-full inline-flex items-center justify-center min-h-[44px] px-5 rounded-xl bg-boost-olive text-white text-[14px] font-semibold shadow-[inset_0_-3px_0_#4F5C2D] hover:brightness-95 disabled:opacity-60";

export function StartButton({ missionId, canStart, tooEarly }: { missionId: string; canStart: boolean; tooEarly: boolean }) {
  const router = useRouter();
  const tr = useT();
  const { t } = tr;
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function go() {
    setBusy(true);
    setError(null);
    try {
      const r = await post(`/api/prestataire/missions/${missionId}/start`, {});
      if (r.ok) return router.refresh();
      setError(tr.err(r.data, "err.generic"));
    } catch {
      setError(t("err.network"));
    } finally {
      setBusy(false);
    }
  }
  return (
    <Card className="space-y-3">
      <SectionLabel>{t("dayof.title")}</SectionLabel>
      {tooEarly ? (
        <p className="text-[13.5px] text-ink-muted">{t("dayof.tooEarly")}</p>
      ) : (
        <>
          {error && (
            <p role="alert" className="text-danger text-[13px] font-semibold">
              {error}
            </p>
          )}
          <button type="button" disabled={busy || !canStart} onClick={go} className={primary}>
            {busy ? "…" : t("dayof.arrived")}
          </button>
        </>
      )}
    </Card>
  );
}

export function StartWorkButton({ missionId }: { missionId: string }) {
  const router = useRouter();
  const tr = useT();
  const { t } = tr;
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function go() {
    setBusy(true);
    setError(null);
    try {
      const r = await post(`/api/prestataire/missions/${missionId}/start`, {});
      if (r.ok) return router.refresh();
      setError(tr.err(r.data, "err.generic"));
    } catch {
      setError(t("err.network"));
    } finally {
      setBusy(false);
    }
  }
  return (
    <Card className="space-y-3">
      <SectionLabel>{t("dayof.work.title")}</SectionLabel>
      <p className="text-[13.5px] text-ink-muted">{t("dayof.work.note")}</p>
      {error && (
        <p role="alert" className="text-danger text-[13px] font-semibold">
          {error}
        </p>
      )}
      <button type="button" disabled={busy} onClick={go} className={primary}>
        {busy ? "…" : t("dayof.work.start")}
      </button>
    </Card>
  );
}

export function ReportForm({
  missionId,
  defaultArrival,
  initial,
}: {
  missionId: string;
  defaultArrival: string;
  initial: { arrival: string; end: string; missing: string[]; note: string } | null;
}) {
  const router = useRouter();
  const tr = useT();
  const { t } = tr;
  const [arrival, setArrival] = useState(initial?.arrival ?? defaultArrival);
  const [end, setEnd] = useState(initial?.end ?? "");
  const [missing, setMissing] = useState<string[]>(initial?.missing ?? []);
  const [note, setNote] = useState(initial?.note ?? "");
  const [issues, setIssues] = useState<ReportIssue[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [busy, setBusy] = useState(false);
  const issueOf = (f: ReportIssue["field"]) => issues.find((i) => i.field === f);
  const issueText = (f: ReportIssue["field"]) => {
    const i = issueOf(f);
    return i ? t(`report.issue.${i.code}` as MessageKey) : null;
  };

  async function send() {
    setBusy(true);
    setError(null);
    setIssues([]);
    setSaved(false);
    try {
      const r = await post(`/api/prestataire/missions/${missionId}/report`, { arrival, end, missing, note });
      if (r.ok) {
        setSaved(true);
        return router.refresh();
      }
      if (r.status === 422 && Array.isArray(r.data.issues)) setIssues(r.data.issues as ReportIssue[]);
      setError(tr.err(r.data, "err.generic"));
    } catch {
      setError(t("err.network"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card className="space-y-5">
      <div>
        <h2 className="font-display text-[20px] font-bold tracking-[-0.02em] text-ink">{t("report.title")}</h2>
        <p className="text-ink-muted text-[13.5px] mt-1">{t("report.note")}</p>
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-1.5">
          <label htmlFor="arrival" className="block text-[14px] font-semibold text-ink">{t("report.arrival")}</label>
          <input id="arrival" type="time" value={arrival} onChange={(e) => setArrival(e.target.value)} className={input} />
          {issueOf("arrival") && <p role="alert" className="text-danger text-[12.5px] font-semibold">{issueText("arrival")}</p>}
        </div>
        <div className="space-y-1.5">
          <label htmlFor="end" className="block text-[14px] font-semibold text-ink">{t("report.end")}</label>
          <input id="end" type="time" value={end} onChange={(e) => setEnd(e.target.value)} className={input} />
          {issueOf("end") && <p role="alert" className="text-danger text-[12.5px] font-semibold">{issueText("end")}</p>}
        </div>
      </div>

      <fieldset className="space-y-2">
        <legend className="text-[14px] font-semibold text-ink">{t("report.missing")} <span className="font-normal text-ink-faint">· {t("report.missingHint")}</span></legend>
        <div className="space-y-2">
          {REPORT_MISSING_OPTIONS.map((o) => {
            const on = missing.includes(o);
            return (
              <button
                key={o}
                type="button"
                role="checkbox"
                aria-checked={on}
                onClick={() => setMissing((l) => (on ? l.filter((x) => x !== o) : [...l, o]))}
                className={`w-full flex items-center gap-3 text-left rounded-xl border p-3 min-h-[44px] ${on ? "border-boost-olive bg-boost-cream" : "border-paper-border bg-white"}`}
              >
                <span className={`w-5 h-5 shrink-0 rounded border flex items-center justify-center ${on ? "bg-boost-olive border-boost-olive text-white" : "border-ink-faint bg-white"}`}>{on && <Check className="w-3.5 h-3.5" aria-hidden />}</span>
                <span className="text-[14px] text-ink">{tr.canon("report", o)}</span>
              </button>
            );
          })}
        </div>
        {issueOf("missing") && <p role="alert" className="text-danger text-[12.5px] font-semibold">{issueText("missing")}</p>}
      </fieldset>

      <div className="space-y-1.5">
        <label htmlFor="note" className="block text-[14px] font-semibold text-ink">{t("report.comment")} <span className="font-normal text-ink-faint">· {t("quote.optional")}</span></label>
        <textarea id="note" value={note} onChange={(e) => setNote(e.target.value)} rows={3} maxLength={1000} className={input} />
        {issueOf("note") && <p role="alert" className="text-danger text-[12.5px] font-semibold">{issueText("note")}</p>}
      </div>

      {error && (
        <p role="alert" className="text-danger text-[13.5px] font-semibold">
          {error}
        </p>
      )}
      {saved && <p role="status" className="text-good text-[13.5px] font-semibold">{t("report.saved")}</p>}
      <button type="button" disabled={busy} onClick={send} className={primary}>
        {busy ? t("quote.sending") : initial ? t("report.update") : t("report.send")}
      </button>
    </Card>
  );
}

export function DeliveryForm({ missionId, title }: { missionId: string; title?: string }) {
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
    // Un lien tapé mais pas ajouté part avec les autres : jamais perdu en silence.
    const all = draft.trim() && !links.includes(draft.trim()) ? [...links, draft.trim()] : links;
    setBusy(true);
    setError(null);
    setIssues([]);
    try {
      const r = await post(`/api/prestataire/missions/${missionId}/deliver`, { links: all, message });
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
        <h2 className="font-display text-[20px] font-bold tracking-[-0.02em] text-ink">{(title ?? t("deliver.title")).charAt(0).toUpperCase() + (title ?? t("deliver.title")).slice(1)}</h2>
        <p className="text-ink-muted text-[13.5px] mt-1">{t("deliver.help")}</p>
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
          aria-label={t("deliver.linkLabel")}
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
            <li key={k}>
              {i.index !== undefined ? t("deliver.linkN", { n: i.index + 1 }) : ""}
              {t(`deliver.issue.${i.code}` as MessageKey)}
            </li>
          ))}
        </ul>
      )}
      <div className="space-y-1.5">
        <label htmlFor="dmsg" className="block text-[14px] font-semibold text-ink">{t("deliver.message")} <span className="font-normal text-ink-faint">· {t("quote.optional")}</span></label>
        <textarea id="dmsg" value={message} onChange={(e) => setMessage(e.target.value)} rows={2} maxLength={1000} className={input} />
      </div>
      {error && (
        <p role="alert" className="text-danger text-[13.5px] font-semibold">
          {error}
        </p>
      )}
      <button type="button" disabled={busy} onClick={send} className={primary}>
        {busy ? t("quote.sending") : t("deliver.send")}
      </button>
    </Card>
  );
}
