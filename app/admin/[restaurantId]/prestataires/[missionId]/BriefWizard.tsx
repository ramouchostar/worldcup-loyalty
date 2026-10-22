"use client";

import { hasShoot } from "@/lib/mission-metier";
import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Check, ChevronLeft, ChevronRight, Plus, X } from "lucide-react";
import { Card } from "@/components/admin/ui";
import {
  validateBrief,
  type BriefAnswers,
  type BriefIssue,
  type BriefQuestion,
  type BriefStep,
  type BriefTemplate,
  earliestDeadline,
} from "@/lib/mission-brief";
import { briefRows, centsToEurosInput, eurosToCents } from "@/lib/mission-view";
import { useT } from "@/components/i18n/I18nProvider";
import { fr } from "@/lib/i18n/messages/fr";
import { formatEurosL, type MessageKey } from "@/lib/i18n/core";
import { optionText, questionText, stepText } from "@/lib/i18n/questionnaire";
import type { Metier } from "@/lib/mission-money";
import { FilePicker } from "@/components/missions/FilePicker";
import { RulesList } from "@/components/missions/RulesList";
import { rulesFor, rulesKindOf, rulesVersionFor } from "@/lib/mission-rules";
import type { AttachmentView } from "@/lib/mission-files";

// ADR 0084 §3 — l'assistant de brief du restaurateur : quelques questions par
// écran, cases et pastilles d'abord, texte libre jamais seul, sauvegarde
// automatique (un restaurateur est interrompu par le service). Les questions
// viennent du MODÈLE du métier (données) ; seul l'ordre des écrans est ici.
// Le brief est verrouillé à l'envoi : l'écran de récapitulatif le dit clairement.

/** Une règle de validation du brief, dite dans la langue du restaurateur. */
function useIssueText() {
  const { t } = useT();
  return (code: string) => (`wz.issue.${code}` in fr ? t(`wz.issue.${code}` as MessageKey) : t("wz.issue.unknown"));
}

type SaveState = "idle" | "saving" | "saved" | "error";

// Le dernier écran : les pièces jointes (facultatives). Il n'est pas dans le modèle de questions : les fichiers ont leur propre envoi.
const FILES_STEP: BriefStep = { key: "pieces", title: "Pièces jointes", subtitle: "", keys: [] };

export function BriefWizard({
  restaurantId,
  missionId,
  template,
  steps,
  initialAnswers,
  today,
  providerName,
  initialFiles,
}: {
  restaurantId: string;
  missionId: string;
  template: BriefTemplate;
  steps: readonly BriefStep[];
  initialAnswers: BriefAnswers;
  /** Jour belge YYYY-MM-DD, calculé côté serveur. */
  today: string;
  providerName: string | null;
  initialFiles: AttachmentView[];
}) {
  const router = useRouter();
  const tr = useT();
  const { t, locale } = tr;
  const metier = template.metier;
  const eur = (cents: number) => formatEurosL(cents, locale);
  const issueText = useIssueText();
  const [answers, setAnswers] = useState<BriefAnswers>(initialAnswers);
  const [step, setStep] = useState(0);
  const [issues, setIssues] = useState<BriefIssue[]>([]);
  const [save, setSave] = useState<SaveState>("idle");
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);
  const dirty = useRef(false);

  const byKey = useMemo(() => new Map(template.questions.map((q) => [q.key, q])), [template]);
  const allSteps = useMemo(() => [...steps, FILES_STEP], [steps]);
  const [fileCount, setFileCount] = useState(initialFiles.length);
  const [rulesOk, setRulesOk] = useState(false);
  const isRecap = step === allSteps.length;
  const current = isRecap ? null : allSteps[step];

  function set(key: string, value: BriefAnswers[string]) {
    dirty.current = true;
    setAnswers((a) => ({ ...a, [key]: value }));
    setIssues((list) => list.filter((i) => i.key !== key));
    setSave("idle");
  }

  // Sauvegarde automatique : 700 ms après la dernière frappe, jamais silencieuse en cas d'échec.
  useEffect(() => {
    if (!dirty.current) return;
    const t = setTimeout(async () => {
      setSave("saving");
      try {
        const res = await fetch(`/api/admin/missions/${missionId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ restaurantId, answers }),
        });
        dirty.current = false;
        setSave(res.ok ? "saved" : "error");
      } catch {
        setSave("error");
      }
    }, 700);
    return () => clearTimeout(t);
  }, [answers, missionId, restaurantId]);

  function stepIssues(keys: readonly string[]): BriefIssue[] {
    return validateBrief(answers, template, today, "brief").issues.filter((i) => keys.includes(i.key));
  }

  function next() {
    if (!current) return;
    const found = stepIssues(current.keys);
    if (found.length > 0) {
      setIssues(found);
      return;
    }
    setIssues([]);
    setStep((s) => s + 1);
  }

  async function send() {
    const all = validateBrief(answers, template, today, "brief").issues;
    if (all.length > 0) {
      setIssues(all);
      const first = allSteps.findIndex((s) => s.keys.some((k) => all.some((i) => i.key === k)));
      if (first >= 0) setStep(first);
      return;
    }
    if (!rulesOk) {
      setSendError(t("wz.rules.notAccepted"));
      return;
    }
    setSending(true);
    setSendError(null);
    try {
      const res = await fetch(`/api/admin/missions/${missionId}/send`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ restaurantId, answers, rules: { accepted: rulesOk, version: rulesVersionFor(rulesKindOf(template.metier)) } }),
      });
      const body = await res.json().catch(() => ({}));
      if (res.ok) {
        router.refresh();
        return;
      }
      if (res.status === 422 && Array.isArray(body.issues)) {
        const list = body.issues as BriefIssue[];
        setIssues(list);
        const first = allSteps.findIndex((s) => s.keys.some((k) => list.some((i) => i.key === k)));
        if (first >= 0) setStep(first);
      }
      setSendError(tr.err(body, "err.sendFailed"));
    } catch {
      setSendError(t("wz.offline"));
    } finally {
      setSending(false);
    }
  }

  const issueOf = (key: string) => issues.find((i) => i.key === key);
  // Règle 4 de l'ADR : un budget très inférieur à l'ambition déclarée est SIGNALÉ avant l'envoi, jamais refusé.
  const ambitionWarning = validateBrief(answers, template, today, "brief").warnings[0];
  const ambitionText = ambitionWarning ? t("wz.ambition", { format: optionText(locale, metier, "format", ambitionWarning.format), amount: eur(template.ambitionBudgetCents?.[ambitionWarning.format] ?? 0) }) : null;
  const floorText = template.budgetFloorCents ? t("wz.floor", { amount: eur(template.budgetFloorCents) }) : null;

  return (
    <div className="space-y-4 max-w-xl">
      {/* Progression */}
      <div>
        <div className="flex items-center justify-between text-[12px] text-ink-muted mb-2">
          <span className="font-mono tracking-[0.12em] uppercase">
            {isRecap ? t("wz.recap") : t("wz.step", { n: step + 1, total: allSteps.length })}
          </span>
          <span aria-live="polite" className={save === "error" ? "text-danger font-semibold" : ""}>
            {save === "saving" && t("wz.saving")}
            {save === "saved" && t("wz.saved")}
            {save === "error" && t("wz.saveError")}
          </span>
        </div>
        <div className="flex gap-1.5" aria-hidden>
          {[...allSteps, null].map((_, i) => (
            <div key={i} className={`h-1.5 flex-1 rounded-full ${i <= step ? "bg-boost-olive" : "bg-paper-border"}`} />
          ))}
        </div>
      </div>

      {current && current.key !== FILES_STEP.key && (
        <Card className="space-y-5">
          <div>
            <h2 className="font-display text-[20px] font-bold tracking-[-0.02em] text-ink">{stepText(locale, metier, current).title}</h2>
            <p className="text-ink-muted text-[13.5px] mt-1">{stepText(locale, metier, current).subtitle}</p>
          </div>
          {current.keys.map((key) => {
            const q = byKey.get(key);
            if (key === "qr_tested") return null; // posé par le test, jamais coché à la main
            if (key === "qr_url" && q) {
              return (
                <QrField
                  key={key}
                  q={q}
                  metier={metier}
                  value={typeof answers.qr_url === "string" ? answers.qr_url : ""}
                  tested={answers.qr_tested === true}
                  issue={issueOf("qr_url") ?? issueOf("qr_tested")}
                  endpoint={`/api/admin/missions/${missionId}/qr-check`}
                  restaurantId={restaurantId}
                  onChange={(v) => {
                    set("qr_url", v);
                    set("qr_tested", false);
                  }}
                  onTested={() => set("qr_tested", true)}
                />
              );
            }
            return q ? <Question key={key} q={q} metier={metier} value={answers[key]} issue={issueOf(key)} minDate={q.key === "deadline" ? earliestDeadline(today) : today} onChange={(v) => set(key, v)} /> : null;
          })}
          {current.keys.includes("budget_cents") && <BudgetNotes floor={floorText} ambition={ambitionText} />}
        </Card>
      )}

      {/* Toujours monté (caché hors de son écran) : les fichiers déjà envoyés ne se perdent pas quand on change d'écran. */}
      <div className={current?.key === FILES_STEP.key ? "" : "hidden"}>
        <Card className="space-y-5">
          <div>
            <h2 className="font-display text-[20px] font-bold tracking-[-0.02em] text-ink">{t("wz.files.title")}</h2>
            <p className="text-ink-muted text-[13.5px] mt-1">{t("wz.files.subtitle")}</p>
          </div>
          <FilePicker endpoint={`/api/admin/missions/${missionId}/files`} extra={{ restaurantId }} scope="brief" initial={initialFiles} max={10} onChange={(f) => setFileCount(f.length)} />
        </Card>
      </div>

      {isRecap && (
        <>
          <Card className="space-y-3" padding="p-0">
            <div className="px-5 pt-4">
              <h2 className="font-display text-[20px] font-bold tracking-[-0.02em] text-ink">{t("wz.recapTitle")}</h2>
              <p className="text-ink-muted text-[13.5px] mt-1">{t("wz.recapNote")}</p>
            </div>
            <dl>
              {briefRows(answers, template, "brief", locale).map((r, i) => (
                <div key={r.label} className={`px-5 py-3 ${i === 0 ? "" : "border-t border-paper-border"}`}>
                  <dt className="text-[12px] text-ink-faint">{r.label}</dt>
                  <dd className="text-[14px] text-ink whitespace-pre-line">{r.value}</dd>
                </div>
              ))}
              <div className="px-5 py-3 border-t border-paper-border">
                <dt className="text-[12px] text-ink-faint">{t("wz.attach")}</dt>
                <dd className="text-[14px] text-ink">{fileCount === 0 ? t("wz.attach.none") : tr.tp("wz.attach.count", fileCount)}</dd>
              </div>
            </dl>
            <div className="px-5 pb-4">
              <button type="button" onClick={() => setStep(0)} className="text-[13px] font-semibold text-ink underline underline-offset-2 min-h-[44px]">
                {t("wz.edit")}
              </button>
            </div>
          </Card>

          <Card className="bg-boost-cream border-boost-olive/30 space-y-2">
            {ambitionText && <p className="text-[13.5px] text-warn font-semibold">{ambitionText}</p>}
            <p className="font-semibold text-ink text-[14px]">{t("wz.next.title")}</p>
            <ul className="text-[13.5px] text-ink-body space-y-1.5 list-disc pl-5">
              <li>{t("wz.next.1", { who: providerName ?? t(`rest.whoCap.${metier}` as MessageKey) })}</li>
              <li>{t("wz.next.2")}</li>
              <li>{t("wz.next.3")}</li>
              <li>{t(hasShoot(metier) ? "wz.next.4" : "wz.next.4.studio")}</li>
            </ul>
          </Card>

          <Card className="space-y-4">
            <div>
              <h2 className="font-display text-[20px] font-bold tracking-[-0.02em] text-ink">{t("rules.title")}</h2>
              <p className="text-ink-muted text-[13.5px] mt-1">{t("wz.rules.intro")}</p>
              {locale !== "fr" && <p className="text-[13px] font-semibold text-ink mt-2">{t("rules.frenchOnly")}</p>}
            </div>
            <RulesList rules={rulesFor("restaurant", rulesKindOf(template.metier))} />
            <button type="button" role="checkbox" aria-checked={rulesOk} onClick={() => setRulesOk((v) => !v)} className={`w-full flex items-start gap-3 text-left rounded-xl border p-3 min-h-[44px] ${rulesOk ? "border-boost-olive bg-boost-cream" : "border-paper-border bg-white"}`}>
              <span className={`mt-0.5 w-5 h-5 shrink-0 rounded border flex items-center justify-center ${rulesOk ? "bg-boost-olive border-boost-olive text-white" : "border-ink-faint bg-white"}`}>{rulesOk && <Check className="w-3.5 h-3.5" aria-hidden />}</span>
              <span className="text-[14px] font-semibold text-ink">{t("wz.rules.accept")}</span>
            </button>
          </Card>

          {issues.length > 0 && (
            <p role="alert" className="text-danger text-[13.5px] font-semibold">
              {tr.tp("wz.missing", issues.length)}
            </p>
          )}
          {sendError && (
            <p role="alert" className="text-danger text-[13.5px] font-semibold">
              {sendError}
            </p>
          )}
        </>
      )}

      {/* Navigation */}
      <div className="flex items-center gap-3">
        {step > 0 && (
          <button
            type="button"
            onClick={() => {
              setIssues([]);
              setStep((s) => s - 1);
            }}
            className="inline-flex items-center gap-1 min-h-[44px] px-4 rounded-lg border border-paper-border bg-white text-ink text-[14px] font-semibold"
          >
            <ChevronLeft className="w-4 h-4" aria-hidden /> {t("wz.back")}
          </button>
        )}
        {!isRecap ? (
          <button
            type="button"
            onClick={next}
            className="flex-1 inline-flex items-center justify-center gap-1.5 min-h-[44px] px-5 rounded-xl bg-boost-olive text-white text-[14px] font-semibold shadow-[inset_0_-3px_0_#4F5C2D] hover:brightness-95"
          >
            {t("wz.nextBtn")} <ChevronRight className="w-4 h-4" aria-hidden />
          </button>
        ) : (
          <button
            type="button"
            disabled={sending}
            onClick={send}
            className="flex-1 inline-flex items-center justify-center gap-1.5 min-h-[44px] px-5 rounded-xl bg-boost-olive text-white text-[14px] font-semibold shadow-[inset_0_-3px_0_#4F5C2D] hover:brightness-95 disabled:opacity-60"
          >
            {sending ? t("quote.sending") : providerName ? t("wz.sendTo", { name: providerName }) : t("wz.sendMine")}
          </button>
        )}
      </div>
    </div>
  );
}

/** « Tester le scan » : le serveur vérifie que l'adresse du QR code ouvre bien un site (jamais un scan de caméra). */
function QrField({ q, metier, value, tested, issue, endpoint, restaurantId, onChange, onTested }: { q: BriefQuestion; metier: Metier; value: string; tested: boolean; issue: BriefIssue | undefined; endpoint: string; restaurantId: string; onChange: (v: string) => void; onTested: () => void }) {
  const tr = useT();
  const { t, locale } = tr;
  const text = questionText(locale, metier, q);
  const issueText = useIssueText();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const id = `q-${q.key}`;
  async function test() {
    setBusy(true);
    setMessage(null);
    try {
      const res = await fetch(endpoint, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ restaurantId, url: value }) });
      const body = await res.json().catch(() => ({}));
      if (res.ok) {
        onTested();
        setMessage(t("wz.qr.ok", { host: body.finalHost, redirect: body.redirected ? t("wz.qr.redirect") : "" }));
      } else setMessage(tr.err(body, "wz.qr.fail"));
    } catch {
      setMessage(t("err.network"));
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="space-y-2">
      <label htmlFor={id} className="block text-[14px] font-semibold text-ink">
        {text.label}
        <span className="font-normal text-ink-faint"> · {t("quote.optional")}</span>
      </label>
      {text.hint && <p className="text-[12.5px] text-ink-muted">{text.hint}</p>}
      <div className="flex gap-2">
        <input id={id} value={value} onChange={(e) => { onChange(e.target.value); setMessage(null); }} inputMode="url" placeholder="https://monrestaurant.be/menu" maxLength={500} className="flex-1 min-w-0 border border-paper-border rounded-xl px-3 py-2.5 text-[14px] text-ink bg-white focus:outline-none focus-visible:ring-2 focus-visible:ring-boost-olive" />
        <button type="button" disabled={busy || !value.trim()} onClick={test} className="inline-flex items-center min-h-[44px] px-4 rounded-xl border border-paper-border bg-white text-ink text-[14px] font-semibold disabled:opacity-50">
          {busy ? "…" : t("wz.qr.test")}
        </button>
      </div>
      {value.trim() && tested && !message && <p className="text-[13px] text-good font-semibold">{t("wz.qr.tested")}</p>}
      {message && <p role="status" className={`text-[13px] font-semibold ${tested ? "text-good" : "text-danger"}`}>{message}</p>}
      {value.trim() && !tested && !message && <p className="text-[13px] text-warn font-semibold">{t("wz.qr.mustTest")}</p>}
      {issue && <p role="alert" className="text-danger text-[13px] font-semibold">{issueText(issue.code)}</p>}
    </div>
  );
}

function BudgetNotes({ floor, ambition }: { floor: string | null; ambition: string | null }) {
  if (!floor && !ambition) return null;
  return (
    <div className="space-y-1.5" aria-live="polite">
      {floor && <p className="text-[13px] text-ink-muted">{floor}</p>}
      {ambition && <p role="status" className="text-[13px] text-warn font-semibold">{ambition}</p>}
    </div>
  );
}

// ── Une question, selon son genre ───────────────────────────

function Question({
  q,
  metier,
  value,
  issue,
  minDate,
  onChange,
}: {
  q: BriefQuestion;
  metier: Metier;
  value: BriefAnswers[string];
  issue: BriefIssue | undefined;
  /** Une date ne se choisit pas avant ce jour (le serveur juge de toute façon). */
  minDate: string;
  onChange: (v: BriefAnswers[string]) => void;
}) {
  const { t, locale } = useT();
  const issueText = useIssueText();
  const text = questionText(locale, metier, q);
  const id = `q-${q.key}`;
  const label = (
    <label htmlFor={id} className="block text-[14px] font-semibold text-ink">
      {text.label}
      {!q.required && <span className="font-normal text-ink-faint"> · {t("quote.optional")}</span>}
    </label>
  );

  let control: React.ReactNode = null;

  if (q.kind === "choice" || q.kind === "multi") {
    const multi = q.kind === "multi";
    const selected = multi ? (Array.isArray(value) ? value : []) : typeof value === "string" ? [value] : [];
    control = (
      <div id={id} role={multi ? "group" : "radiogroup"} aria-label={text.label} className="flex flex-wrap gap-2">
        {(q.options ?? []).map((o) => {
          const on = selected.includes(o);
          return (
            <button
              key={o}
              type="button"
              aria-pressed={on}
              onClick={() => (multi ? onChange(on ? selected.filter((x) => x !== o) : [...selected, o]) : onChange(on ? null : o))}
              className={`min-h-[44px] px-4 rounded-xl border text-[14px] font-medium transition-colors ${
                on ? "bg-boost-olive border-boost-olive text-white" : "bg-white border-paper-border text-ink hover:bg-paper-subtle"
              }`}
            >
              {optionText(locale, metier, q.key, o)}
            </button>
          );
        })}
      </div>
    );
  } else if (q.kind === "text") {
    const typed = typeof value === "string" ? value : "";
    control = (
      <>
        <textarea
          id={id}
          value={typed}
          onChange={(e) => onChange(e.target.value)}
          rows={q.minLength ? 4 : 3}
          maxLength={2000}
          className="w-full border border-paper-border rounded-xl px-3 py-2.5 text-[14px] text-ink bg-white focus:outline-none focus-visible:ring-2 focus-visible:ring-boost-olive"
        />
        {q.minLength ? (
          <p className="text-[12px] text-ink-faint text-right">
            {t("wz.chars", { n: typed.trim().length, min: q.minLength })}
          </p>
        ) : null}
      </>
    );
  } else if (q.kind === "date") {
    control = <input id={id} type="date" min={minDate} value={typeof value === "string" ? value : ""} onChange={(e) => onChange(e.target.value || null)} className="border border-paper-border rounded-xl px-3 py-2.5 text-[14px] text-ink bg-white focus:outline-none focus-visible:ring-2 focus-visible:ring-boost-olive min-h-[44px]" />;
  } else if (q.kind === "list") {
    control = <ListField id={id} items={Array.isArray(value) ? value : []} onChange={onChange} placeholder={q.key === "dishes" ? t("wz.list.dish") : t("wz.list.person")} />;
  } else if (q.kind === "number") {
    control = q.key === "budget_cents" ? <EuroField id={id} cents={typeof value === "number" ? value : null} onChange={onChange} /> : (
      <input
        id={id}
        inputMode="numeric"
        value={typeof value === "number" ? String(value) : ""}
        onChange={(e) => {
          const n = Number(e.target.value.replace(/\D/g, ""));
          onChange(e.target.value === "" ? null : Number.isFinite(n) ? n : null);
        }}
        className="w-28 border border-paper-border rounded-xl px-3 py-2.5 text-[14px] text-ink bg-white focus:outline-none focus-visible:ring-2 focus-visible:ring-boost-olive"
      />
    );
  } else if (q.kind === "flag") {
    const on = value === true;
    return (
      <div>
        <button
          type="button"
          role="checkbox"
          aria-checked={on}
          onClick={() => onChange(!on)}
          className={`w-full flex items-start gap-3 text-left rounded-xl border p-3 min-h-[44px] ${on ? "border-boost-olive bg-boost-cream" : "border-paper-border bg-white"}`}
        >
          <span className={`mt-0.5 w-5 h-5 shrink-0 rounded border flex items-center justify-center ${on ? "bg-boost-olive border-boost-olive text-white" : "border-ink-faint bg-white"}`}>
            {on && <Check className="w-3.5 h-3.5" aria-hidden />}
          </span>
          <span className="text-[14px] font-semibold text-ink">{text.label}</span>
        </button>
        {text.hint && <p className="text-[12.5px] text-ink-muted mt-1.5">{text.hint}</p>}
        {issue && <p role="alert" className="text-danger text-[13px] font-semibold mt-1.5">{issueText(issue.code)}</p>}
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {label}
      {text.hint && <p className="text-[12.5px] text-ink-muted">{text.hint}</p>}
      {control}
      {issue && <p role="alert" className="text-danger text-[13px] font-semibold">{issueText(issue.code)}</p>}
    </div>
  );
}

function ListField({ id, items, onChange, placeholder }: { id: string; items: string[]; onChange: (v: string[]) => void; placeholder: string }) {
  const { t } = useT();
  const [draft, setDraft] = useState("");
  function add() {
    const item = draft.trim();
    if (!item || items.length >= 30) return;
    onChange([...items, item]);
    setDraft("");
  }
  return (
    <div className="space-y-2">
      {items.length > 0 && (
        <ul className="flex flex-wrap gap-2">
          {items.map((it, i) => (
            <li key={`${it}-${i}`} className="inline-flex items-center gap-1.5 bg-boost-cream border border-boost-olive/30 rounded-full pl-3 pr-1 min-h-[36px] text-[14px] text-ink">
              {it}
              <button type="button" onClick={() => onChange(items.filter((_, j) => j !== i))} aria-label={t("wz.remove", { it })} className="w-8 h-8 rounded-full flex items-center justify-center hover:bg-boost-olive/10">
                <X className="w-4 h-4" aria-hidden />
              </button>
            </li>
          ))}
        </ul>
      )}
      <div className="flex gap-2">
        <input
          id={id}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              add();
            }
          }}
          placeholder={placeholder}
          maxLength={200}
          className="flex-1 min-w-0 border border-paper-border rounded-xl px-3 py-2.5 text-[14px] text-ink bg-white focus:outline-none focus-visible:ring-2 focus-visible:ring-boost-olive"
        />
        <button type="button" onClick={add} className="inline-flex items-center gap-1 min-h-[44px] px-4 rounded-xl border border-paper-border bg-white text-ink text-[14px] font-semibold">
          <Plus className="w-4 h-4" aria-hidden /> {t("deliver.add")}
        </button>
      </div>
    </div>
  );
}

function EuroField({ id, cents, onChange }: { id: string; cents: number | null; onChange: (v: number | null) => void }) {
  const { t } = useT();
  const [text, setText] = useState(centsToEurosInput(cents));
  return (
    <div className="flex items-center gap-2">
      <input
        id={id}
        inputMode="decimal"
        value={text}
        onChange={(e) => {
          setText(e.target.value);
          onChange(eurosToCents(e.target.value));
        }}
        className="w-36 border border-paper-border rounded-xl px-3 py-2.5 text-[14px] text-ink bg-white focus:outline-none focus-visible:ring-2 focus-visible:ring-boost-olive"
      />
      <span className="text-[14px] text-ink-muted">{t("wz.euroExVat")}</span>
    </div>
  );
}
