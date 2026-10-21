"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Card, SectionLabel } from "@/components/admin/ui";
import { AttachmentList } from "@/components/missions/AttachmentList";
import { FilePicker } from "@/components/missions/FilePicker";
import { MAX_UNLINKED, type AttachmentView } from "@/lib/mission-files";
import { CHANGE_CATEGORIES, DESCRIPTION_MAX, DESCRIPTION_MIN, MAX_CHANGES, type ChangeStatus, type RequestIssue } from "@/lib/mission-changes";
import { useT } from "@/components/i18n/I18nProvider";
import { formatEurosL, type MessageKey } from "@/lib/i18n/core";

// ADR 0084 §3 règle 9 — « Tout changement après verrouillage est une demande de modification que le prestataire chiffre
// ou refuse ». Le restaurateur décrit ce qui change (catégories + explication, pièces jointes possibles) ; le prestataire
// répond par un supplément (éventuellement nul) ou un refus ; le restaurateur accepte ou non. Refus ou silence : le
// brief d'origine tient. Deux demandes au total, une à la fois, jusqu'à 7 jours avant le tournage.

export type ChangeView = {
  id: string;
  seq: number;
  status: ChangeStatus;
  categories: string[];
  description: string;
  files: AttachmentView[];
  /** Ce que PAIE le restaurateur pour le supplément, selon son plan (null tant que rien n'est chiffré). */
  paidCents: number | null;
  deltaDays: number | null;
  providerNote: string | null;
  declineReason: string | null;
};

const primary = "inline-flex items-center justify-center min-h-[44px] px-5 rounded-xl bg-boost-olive text-white text-[14px] font-semibold shadow-[inset_0_-3px_0_#4F5C2D] hover:brightness-95 disabled:opacity-60";
const ghost = "inline-flex items-center justify-center min-h-[44px] px-4 rounded-xl border border-paper-border bg-white text-ink text-[14px] font-semibold disabled:opacity-60";
const field = "w-full border border-paper-border rounded-xl px-3 py-2.5 text-[14px] text-ink bg-white focus:outline-none focus-visible:ring-2 focus-visible:ring-boost-olive";

async function post(url: string, body: unknown) {
  const res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  return { ok: res.ok, status: res.status, data: (await res.json().catch(() => ({}))) as Record<string, unknown> };
}

export function ChangesCard({
  restaurantId,
  missionId,
  providerName,
  changes,
  /** null = on peut en demander une ; sinon la phrase qui dit pourquoi pas. */
  blocked,
  filesBase,
  filesQuery,
}: {
  restaurantId: string;
  missionId: string;
  providerName: string;
  changes: ChangeView[];
  blocked: string | null;
  filesBase: string;
  filesQuery: string;
}) {
  const router = useRouter();
  const tr = useT();
  const { t, locale } = tr;
  const eur = (cents: number) => formatEurosL(cents, locale);
  const [open, setOpen] = useState(false);
  const [cats, setCats] = useState<string[]>([]);
  const [text, setText] = useState("");
  const [fileIds, setFileIds] = useState<string[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [issues, setIssues] = useState<RequestIssue[]>([]);

  async function run(key: string, url: string, body: Record<string, unknown>) {
    setBusy(key);
    setError(null);
    setIssues([]);
    try {
      const r = await post(url, { restaurantId, ...body });
      if (r.ok) return router.refresh();
      if (r.status === 422 && Array.isArray(r.data.issues)) setIssues(r.data.issues as RequestIssue[]);
      setError(tr.err(r.data, "err.generic"));
    } catch {
      setError(t("err.network"));
    } finally {
      setBusy(null);
    }
  }

  const problem = (f: RequestIssue["field"]) => {
    const p = issues.find((i) => i.field === f);
    return p ? t(`rc.change.issue.${p.code}` as MessageKey) : null;
  };
  const used = changes.filter((c) => ["proposed", "quoted", "accepted", "declined_by_restaurant"].includes(c.status)).length;

  return (
    <Card className="space-y-5">
      <div>
        <SectionLabel>{t("rc.change.title")}</SectionLabel>
        <p className="text-[13.5px] text-ink-muted mt-1">{t("rc.change.intro", { name: providerName, max: MAX_CHANGES, used: tr.tp("rc.change.used", used) })}</p>
      </div>

      {changes.length > 0 && (
        <ol className="space-y-3">
          {changes.map((c) => (
            <li key={c.id} className="rounded-2xl border border-paper-border p-4 space-y-2">
              <p className="text-[12px] font-semibold text-ink-muted">
                {t("rc.change.item", { seq: c.seq, status: t(`rc.change.status.${c.status}` as MessageKey) })}
              </p>
              <p className="text-[13px] text-ink-muted">{c.categories.map((x) => tr.canon("changeCat", x)).join(" · ")}</p>
              <p className="text-[14px] text-ink whitespace-pre-line">{c.description}</p>
              <AttachmentList locale={locale} files={c.files} base={filesBase} query={filesQuery} />
              {c.status === "declined_by_provider" && c.declineReason && (
                <p className="text-[13.5px] text-ink">
                  <span className="font-semibold">{t("rc.change.reason")}</span> {c.declineReason}
                </p>
              )}
              {(c.status === "quoted" || c.status === "accepted" || c.status === "declined_by_restaurant") && c.paidCents !== null && (
                <p className="text-[14px] text-ink">
                  <span className="font-semibold">{c.paidCents === 0 ? t("rc.change.noSupplement") : t("rc.change.supplement", { amount: eur(c.paidCents) })}</span>
                  {c.deltaDays ? tr.tp("mission.change.delay", c.deltaDays) : ""}
                </p>
              )}
              {c.providerNote && <p className="text-[13.5px] text-ink-muted whitespace-pre-line">{c.providerNote}</p>}
              {c.status === "quoted" && (
                <div className="flex flex-wrap gap-2 pt-1">
                  <button type="button" disabled={busy !== null} onClick={() => run(`a${c.id}`, `/api/admin/missions/${missionId}/changes/${c.id}/answer`, { answer: "accept" })} className={primary}>
                    {busy === `a${c.id}` ? "…" : c.paidCents === 0 ? t("rc.change.confirm") : t("rc.change.accept")}
                  </button>
                  <button type="button" disabled={busy !== null} onClick={() => run(`d${c.id}`, `/api/admin/missions/${missionId}/changes/${c.id}/answer`, { answer: "decline" })} className={ghost}>
                    {busy === `d${c.id}` ? "…" : t("rc.change.keep")}
                  </button>
                </div>
              )}
              {(c.status === "proposed" || c.status === "quoted") && (
                <button type="button" disabled={busy !== null} onClick={() => run(`w${c.id}`, `/api/admin/missions/${missionId}/changes/${c.id}/answer`, { answer: "withdraw" })} className="text-[13px] font-semibold text-ink underline underline-offset-2 min-h-[44px]">
                  {busy === `w${c.id}` ? "…" : t("rc.change.withdraw")}
                </button>
              )}
            </li>
          ))}
        </ol>
      )}

      {error && (
        <p role="alert" className="text-danger text-[13.5px] font-semibold">
          {error}
        </p>
      )}

      {blocked ? (
        <p className="text-[13.5px] text-ink-muted">{blocked}</p>
      ) : !open ? (
        <button type="button" onClick={() => setOpen(true)} className={ghost}>
          {t("rc.change.ask")}
        </button>
      ) : (
        <div className="space-y-4 rounded-2xl border border-paper-border p-4">
          <div className="space-y-2">
            <p className="text-[14px] font-semibold text-ink">{t("rc.change.what")}</p>
            <div role="group" aria-label={t("rc.change.whatGroup")} className="flex flex-wrap gap-2">
              {CHANGE_CATEGORIES.map((c) => {
                const on = cats.includes(c);
                return (
                  <button key={c} type="button" aria-pressed={on} onClick={() => setCats((l) => (on ? l.filter((x) => x !== c) : [...l, c]))} className={`min-h-[44px] px-4 rounded-xl border text-[14px] font-medium ${on ? "bg-boost-olive border-boost-olive text-white" : "bg-white border-paper-border text-ink"}`}>
                    {tr.canon("changeCat", c)}
                  </button>
                );
              })}
            </div>
            {problem("categories") && <p role="alert" className="text-danger text-[13px] font-semibold">{problem("categories")}</p>}
          </div>
          <div className="space-y-1">
            <label htmlFor="chg-text" className="block text-[14px] font-semibold text-ink">
              {t("rc.change.explain")}
            </label>
            <textarea id="chg-text" value={text} onChange={(e) => setText(e.target.value)} rows={4} maxLength={DESCRIPTION_MAX} placeholder={t("rc.change.placeholder")} className={field} />
            <p className="text-[12px] text-ink-faint">{text.trim().length < DESCRIPTION_MIN ? t("rc.change.min", { min: DESCRIPTION_MIN }) : t("rc.change.count", { n: text.trim().length, max: DESCRIPTION_MAX })}</p>
            {problem("description") && <p role="alert" className="text-danger text-[13px] font-semibold">{problem("description")}</p>}
          </div>
          <div className="space-y-1.5">
            <p className="text-[14px] font-semibold text-ink">
              {t("rc.change.file")} <span className="font-normal text-ink-faint">· {t("quote.optional")}</span>
            </p>
            <FilePicker endpoint={`/api/admin/missions/${missionId}/files`} extra={{ restaurantId }} scope="change" max={MAX_UNLINKED.change} onChange={(f) => setFileIds(f.map((x) => x.id))} label={t("rc.change.fileButton")} />
          </div>
          <div className="flex flex-wrap gap-2">
            <button type="button" disabled={busy !== null} onClick={() => run("req", `/api/admin/missions/${missionId}/changes`, { categories: cats, description: text, attachmentIds: fileIds })} className={primary}>
              {busy === "req" ? t("quote.sending") : t("rc.change.sendTo", { name: providerName })}
            </button>
            <button type="button" disabled={busy !== null} onClick={() => setOpen(false)} className={ghost}>
              {t("refuse.cancel")}
            </button>
          </div>
          <p className="text-[12.5px] text-ink-muted">{t("rc.change.nothingNow")}</p>
        </div>
      )}
    </Card>
  );
}
