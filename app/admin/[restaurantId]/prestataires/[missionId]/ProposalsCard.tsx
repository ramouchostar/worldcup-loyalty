"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Check, Copy, ExternalLink, Lightbulb } from "lucide-react";
import { Card, SectionLabel } from "@/components/admin/ui";
import { whatsappShareUrl } from "@/lib/mission-team-message";
import { REASON_MAX, REASON_MIN, type ChosenBy, type ReasonIssue } from "@/lib/mission-proposals";
import { useT } from "@/components/i18n/I18nProvider";
import type { MessageKey } from "@/lib/i18n/core";
import { linkHost } from "@/lib/mission-dayof";
import { AttachmentList } from "@/components/missions/AttachmentList";
import type { AttachmentView } from "@/lib/mission-files";

// ADR 0084 §5 — le choix de l'idée de tournage. Le restaurateur choisit UNE idée (verrouillée ensuite) ; si
// aucune ne lui plaît, UNE nouvelle série, avec une raison pour chaque idée refusée. Silence : la première est
// retenue d'office (l'écran le dit, avec la date). L'idée retenue donne un message de plus pour l'équipe.

export type IdeaView = { id: string; rank: number; title: string; idea: string; onsite: string; link: string; files: AttachmentView[] };

const primary = "inline-flex items-center justify-center min-h-[44px] px-5 rounded-xl bg-boost-olive text-white text-[14px] font-semibold shadow-[inset_0_-3px_0_#4F5C2D] hover:brightness-95 disabled:opacity-60";
const ghost = "inline-flex items-center justify-center min-h-[44px] px-4 rounded-xl border border-paper-border bg-white text-ink text-[14px] font-semibold disabled:opacity-60";
const input = "w-full border border-paper-border rounded-xl px-3 py-2.5 text-[14px] text-ink bg-white focus:outline-none focus-visible:ring-2 focus-visible:ring-boost-olive";

async function post(url: string, body: unknown) {
  const res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  return { ok: res.ok, status: res.status, data: (await res.json().catch(() => ({}))) as Record<string, unknown> };
}

function Idea({ i, recommended, filesBase, filesQuery }: { i: IdeaView; recommended: boolean; filesBase: string; filesQuery: string }) {
  const { t, locale } = useT();
  return (
    <div className="space-y-1.5">
      <p className="text-[15px] font-bold text-ink">
        {i.title}
        {recommended && <span className="ml-2 text-[12px] font-semibold text-boost-olive">{t("rc.idea.recommended")}</span>}
      </p>
      <p className="text-[13.5px] text-ink whitespace-pre-line">{i.idea}</p>
      <p className="text-[13.5px] text-ink">
        <span className="font-semibold">{t("rc.idea.onsite")}</span> {i.onsite}
      </p>
      <a href={i.link} target="_blank" rel="noopener noreferrer nofollow" className="inline-flex items-center gap-1 text-[13px] font-semibold text-ink underline underline-offset-2 min-h-[32px]">
        {t("rc.idea.example", { host: linkHost(i.link) })} <ExternalLink className="w-3.5 h-3.5" aria-hidden />
      </a>
      <AttachmentList locale={locale} files={i.files} base={filesBase} query={filesQuery} />
    </div>
  );
}

export function ProposalsChoose({
  restaurantId,
  missionId,
  ideas,
  providerName,
  deadlineLabel,
  canReject,
  second,
  filesBase,
  filesQuery,
}: {
  restaurantId: string;
  missionId: string;
  ideas: IdeaView[];
  providerName: string;
  deadlineLabel: string;
  canReject: boolean;
  second: boolean;
  filesBase: string;
  filesQuery: string;
}) {
  const router = useRouter();
  const tr = useT();
  const { t } = tr;
  const [busyId, setBusyId] = useState<string | null>(null);
  const [rejecting, setRejecting] = useState(false);
  const [reasons, setReasons] = useState<Record<string, string>>({});
  const [issues, setIssues] = useState<ReasonIssue[]>([]);
  const [error, setError] = useState<string | null>(null);

  async function run(id: string | null, url: string, body: Record<string, unknown>) {
    setBusyId(id ?? "reject");
    setError(null);
    setIssues([]);
    try {
      const r = await post(url, { restaurantId, ...body });
      if (r.ok) return router.refresh();
      if (r.status === 422 && Array.isArray(r.data.issues)) setIssues(r.data.issues as ReasonIssue[]);
      setError(tr.err(r.data, "err.generic"));
    } catch {
      setError(t("err.network"));
    } finally {
      setBusyId(null);
    }
  }

  const problem = (id: string) => {
    const p = issues.find((x) => x.id === id);
    return p ? t(`rc.idea.issue.${p.code}` as MessageKey) : null;
  };

  return (
    <Card className="space-y-5">
      <div>
        <SectionLabel>{second ? t("rc.idea.titleSecond") : t("rc.idea.titleFirst")}</SectionLabel>
        <p className="text-[13.5px] text-ink-muted mt-1">
          {t("rc.idea.intro", { name: providerName, count: ideas.length })}
          <span className="font-semibold text-ink">{t("rc.idea.introBold", { date: deadlineLabel })}</span>
          {t("rc.idea.introEnd")}
        </p>
      </div>
      <ol className="space-y-4">
        {ideas.map((i, k) => (
          <li key={i.id} className="rounded-2xl border border-paper-border p-4 space-y-3">
            <Idea i={i} recommended={k === 0} filesBase={filesBase} filesQuery={filesQuery} />
            {rejecting ? (
              <div className="space-y-1">
                <label htmlFor={`r${i.id}`} className="block text-[13.5px] font-semibold text-ink">
                  {t("rc.idea.why")}
                </label>
                <textarea id={`r${i.id}`} value={reasons[i.id] ?? ""} onChange={(e) => setReasons((r) => ({ ...r, [i.id]: e.target.value }))} rows={2} maxLength={REASON_MAX} placeholder={t("rc.idea.whyPlaceholder")} className={input} />
                <p className="text-[12px] text-ink-faint">{(reasons[i.id] ?? "").trim().length < REASON_MIN ? t("rc.idea.whyMin", { min: REASON_MIN }) : " "}</p>
                {problem(i.id) && (
                  <p role="alert" className="text-danger text-[13px] font-semibold">
                    {problem(i.id)}
                  </p>
                )}
              </div>
            ) : (
              <button type="button" disabled={busyId !== null} onClick={() => run(i.id, `/api/admin/missions/${missionId}/proposals/choose`, { proposalId: i.id })} className={primary}>
                {busyId === i.id ? "…" : t("rc.idea.choose")}
              </button>
            )}
          </li>
        ))}
      </ol>
      {error && (
        <p role="alert" className="text-danger text-[13.5px] font-semibold">
          {error}
        </p>
      )}
      {canReject && !rejecting && (
        <button type="button" onClick={() => setRejecting(true)} className={ghost}>
          {t("rc.idea.none")}
        </button>
      )}
      {canReject && rejecting && (
        <div className="space-y-2">
          <p className="text-[13px] text-ink-muted">{t("rc.idea.rejectNote", { name: providerName })}</p>
          <div className="flex flex-wrap gap-2">
            <button type="button" disabled={busyId !== null} onClick={() => run(null, `/api/admin/missions/${missionId}/proposals/reject`, { reasons })} className={primary}>
              {busyId === "reject" ? "…" : t("rc.idea.askNew")}
            </button>
            <button type="button" disabled={busyId !== null} onClick={() => setRejecting(false)} className={ghost}>
              {t("rc.idea.back")}
            </button>
          </div>
        </div>
      )}
      {!canReject && !second && <p className="text-[12.5px] text-ink-muted">{t("rc.idea.tooLate")}</p>}
      {second && <p className="text-[12.5px] text-ink-muted">{t("rc.idea.last")}</p>}
    </Card>
  );
}

export function ProposalChosen({ idea, by, teamUpdate, filesBase, filesQuery }: { idea: IdeaView; by: ChosenBy; teamUpdate: string; filesBase: string; filesQuery: string }) {
  const { t } = useT();
  const [copied, setCopied] = useState(false);
  return (
    <Card className="space-y-4">
      <div>
        <SectionLabel>{t("rc.idea.chosenTitle")}</SectionLabel>
        <p className="text-[12.5px] text-ink-muted mt-1 inline-flex items-center gap-1.5">
          <Lightbulb className="w-3.5 h-3.5" aria-hidden /> {t("rc.idea.chosenLocked", { who: t(`mission.chosenBy.${by}` as MessageKey) })}
        </p>
      </div>
      <Idea i={idea} recommended={false} filesBase={filesBase} filesQuery={filesQuery} />
      <div className="space-y-2 border-t border-paper-border pt-4">
        <p className="text-[13.5px] font-semibold text-ink">{t("rc.idea.tellTeam")}</p>
        <pre className="whitespace-pre-wrap font-sans text-[13.5px] text-ink bg-paper-subtle rounded-xl p-3 border border-paper-border">{teamUpdate}</pre>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => {
              navigator.clipboard?.writeText(teamUpdate);
              setCopied(true);
            }}
            className={ghost}
          >
            {copied ? <Check className="w-4 h-4 mr-1.5" aria-hidden /> : <Copy className="w-4 h-4 mr-1.5" aria-hidden />} {copied ? t("rc.idea.copied") : t("rc.idea.copy")}
          </button>
          <a href={whatsappShareUrl(teamUpdate)} target="_blank" rel="noopener noreferrer" className="inline-flex items-center min-h-[44px] px-4 rounded-lg bg-[#25D366] text-white text-[14px] font-semibold">
            {t("rc.idea.whatsapp")}
          </a>
        </div>
      </div>
    </Card>
  );
}
