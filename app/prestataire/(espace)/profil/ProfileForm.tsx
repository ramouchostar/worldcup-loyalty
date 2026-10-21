"use client";

import { useState } from "react";
import { Plus, X } from "lucide-react";
import { Card } from "@/components/admin/ui";
import { ProviderProfileCard } from "@/components/missions/ProviderProfileCard";
import { BIO_MAX, EQUIPMENT_MAX, MAX_TAGS, MAX_WORKS, PROFILE_LANGUAGES, TAG_MAX, WORK_LABEL_MAX, ZONE_MAX, isProfileEmpty, sanitizeProfile, type ProviderProfile } from "@/lib/provider-profile";
import { useT } from "@/components/i18n/I18nProvider";
import type { MessageKey } from "@/lib/i18n/core";

// ADR 0084 §2 bis — l'éditeur du profil. Tout est enregistré d'un coup (tout ou rien) ; chaque refus du serveur est montré
// sous le champ concerné. « Voir comme un restaurateur » montre le rendu exact de la carte lue sur la page d'une mission.

type FieldIssue = { field: string; index: number | null; code?: string; url?: string | null; text: string };
const input = "w-full min-h-[44px] rounded-lg border border-paper-border bg-white px-3 text-[14px] text-ink";

export function ProfileForm({ name, initial }: { name: string; initial: ProviderProfile }) {
  const tr = useT();
  const { t } = tr;
  const [p, setP] = useState<ProviderProfile>(initial);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [issues, setIssues] = useState<FieldIssue[]>([]);
  const [preview, setPreview] = useState(false);

  const set = <K extends keyof ProviderProfile>(k: K, v: ProviderProfile[K]) => {
    setMessage(null);
    setP((cur) => ({ ...cur, [k]: v }));
  };
  // Chaque refus du serveur est redit dans la langue du prestataire (le texte du serveur n'est qu'un repli).
  const issuesFor = (field: string): FieldIssue[] =>
    issues
      .filter((i) => i.field === field)
      .map((i) => (i.code ? { ...i, text: i.code === "work_url" && i.url ? t(`profile.url.${i.url}` as MessageKey) : t(`profile.issue.${i.code}` as MessageKey) } : i));

  async function save() {
    setSaving(true);
    setMessage(null);
    setIssues([]);
    try {
      const res = await fetch("/api/prestataire/profil", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(p) });
      const body = await res.json().catch(() => ({}));
      if (res.ok) {
        setP(body.profile ?? p);
        setMessage({ ok: true, text: t("profile.saved") });
      } else {
        if (Array.isArray(body.issues)) setIssues(body.issues);
        setMessage({ ok: false, text: tr.err(body, "profile.failed") });
      }
    } catch {
      setMessage({ ok: false, text: t("err.network") });
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-5">
      <Card className="space-y-5">
        <Field label={t("profile.bio")} hint={`${p.bio.length}/${BIO_MAX}`} issues={issuesFor("bio")}>
          <textarea className={`${input} py-2 min-h-[96px]`} value={p.bio} maxLength={BIO_MAX + 100} onChange={(e) => set("bio", e.target.value)} placeholder={t("profile.bio.ph")} />
        </Field>

        <TagField label={t("profile.does")} placeholder={t("profile.does.ph")} tags={p.does} onChange={(list) => set("does", list)} issues={issuesFor("does")} />
        <TagField label={t("profile.doesNot")} placeholder={t("profile.doesNot.ph")} tags={p.doesNot} onChange={(list) => set("doesNot", list)} issues={issuesFor("doesNot")} />

        <Field label={t("profile.equipment")} hint={`${p.equipment.length}/${EQUIPMENT_MAX}`} issues={issuesFor("equipment")}>
          <textarea className={`${input} py-2 min-h-[64px]`} value={p.equipment} maxLength={EQUIPMENT_MAX + 100} onChange={(e) => set("equipment", e.target.value)} />
        </Field>

        <Field label={t("profile.zone")} hint={`${p.zone.length}/${ZONE_MAX}`} issues={issuesFor("zone")}>
          <input className={input} value={p.zone} maxLength={ZONE_MAX + 50} onChange={(e) => set("zone", e.target.value)} placeholder={t("profile.zone.ph")} />
        </Field>

        <Field label={t("profile.languages")} issues={issuesFor("languages")}>
          <div className="flex flex-wrap gap-2">
            {PROFILE_LANGUAGES.map((l) => {
              const on = p.languages.includes(l);
              return (
                <button
                  key={l}
                  type="button"
                  aria-pressed={on}
                  onClick={() => set("languages", on ? p.languages.filter((x) => x !== l) : [...p.languages, l])}
                  className={`min-h-[44px] px-4 rounded-lg border text-[14px] font-semibold ${on ? "bg-ink text-white border-ink" : "bg-white text-ink border-paper-border"}`}
                >
                  {tr.canon("language", l)}
                </button>
              );
            })}
          </div>
        </Field>

        <Field label={t("profile.works")} hint={`${p.works.length}/${MAX_WORKS}`} issues={issuesFor("works").filter((i) => i.index === null)}>
          <div className="space-y-3">
            {p.works.map((w, i) => (
              <div key={i} className="space-y-1">
                <div className="flex gap-2">
                  <input className={input} value={w.label} maxLength={WORK_LABEL_MAX + 20} placeholder={t("profile.work.name")} aria-label={t("profile.work.nameN", { n: i + 1 })} onChange={(e) => set("works", p.works.map((x, j) => (j === i ? { ...x, label: e.target.value } : x)))} />
                  <button type="button" aria-label={t("profile.work.removeN", { n: i + 1 })} onClick={() => set("works", p.works.filter((_, j) => j !== i))} className="min-h-[44px] min-w-[44px] grid place-items-center rounded-lg border border-paper-border bg-white text-ink-muted">
                    <X className="w-4 h-4" aria-hidden />
                  </button>
                </div>
                <input className={input} value={w.url} inputMode="url" placeholder="https://…" aria-label={t("profile.work.urlN", { n: i + 1 })} onChange={(e) => set("works", p.works.map((x, j) => (j === i ? { ...x, url: e.target.value } : x)))} />
                {issuesFor("works").filter((x) => x.index === i).map((x) => (
                  <p key={x.text} className="text-[12.5px] text-danger">{x.text}</p>
                ))}
              </div>
            ))}
            {p.works.length < MAX_WORKS && (
              <button type="button" onClick={() => set("works", [...p.works, { label: "", url: "" }])} className="inline-flex items-center gap-1.5 min-h-[44px] px-3 rounded-lg border border-paper-border bg-white text-[14px] font-semibold text-ink">
                <Plus className="w-4 h-4" aria-hidden /> {t("profile.work.add")}
              </button>
            )}
          </div>
        </Field>
      </Card>

      {message && (
        <p role="status" className={`text-[13.5px] ${message.ok ? "text-good" : "text-danger"}`}>
          {message.text}
        </p>
      )}

      <div className="flex flex-wrap gap-2">
        <button type="button" disabled={saving} onClick={save} className="min-h-[44px] px-5 rounded-lg bg-ink text-white text-[14px] font-semibold disabled:opacity-60">
          {saving ? t("profile.saving") : t("profile.save")}
        </button>
        <button type="button" onClick={() => setPreview((v) => !v)} aria-expanded={preview} className="min-h-[44px] px-4 rounded-lg border border-paper-border bg-white text-[14px] font-semibold text-ink">
          {preview ? t("profile.preview.hide") : t("profile.preview")}
        </button>
      </div>

      {preview && (
        <div className="space-y-2">
          <p className="text-[12.5px] text-ink-muted">{t("profile.preview.note")}</p>
          <ProviderProfileCard name={name} profile={sanitizeProfile(p)} tr={tr} />
          {isProfileEmpty(sanitizeProfile(p)) && <p className="text-[13.5px] text-ink-muted">{t("profile.preview.empty")}</p>}
        </div>
      )}
    </div>
  );
}

function Field({ label, hint, issues = [], children }: { label: string; hint?: string; issues?: FieldIssue[]; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <div className="flex items-baseline justify-between gap-2">
        <label className="text-[13px] font-semibold text-ink">{label}</label>
        {hint && <span className="text-[11.5px] text-ink-muted tabular-nums">{hint}</span>}
      </div>
      {children}
      {issues.map((i) => (
        <p key={i.text} className="text-[12.5px] text-danger">{i.text}</p>
      ))}
    </div>
  );
}

function TagField({ label, placeholder, tags, onChange, issues }: { label: string; placeholder: string; tags: string[]; onChange: (list: string[]) => void; issues: FieldIssue[] }) {
  const { t } = useT();
  const [draft, setDraft] = useState("");
  function add() {
    const tag = draft.replace(/\s+/g, " ").trim();
    if (!tag || tags.some((x) => x.toLowerCase() === tag.toLowerCase())) return setDraft("");
    onChange([...tags, tag]);
    setDraft("");
  }
  return (
    <Field label={label} hint={`${tags.length}/${MAX_TAGS}`} issues={issues}>
      <div className="flex flex-wrap gap-2">
        {tags.map((tag, i) => (
          <span key={tag} className="inline-flex items-center gap-1 min-h-[36px] pl-3 pr-1 rounded-full border border-paper-border bg-white text-[13.5px] text-ink">
            {tag}
            <button type="button" aria-label={t("profile.tag.remove", { tag })} onClick={() => onChange(tags.filter((_, j) => j !== i))} className="min-h-[36px] min-w-[36px] grid place-items-center text-ink-muted">
              <X className="w-3.5 h-3.5" aria-hidden />
            </button>
          </span>
        ))}
      </div>
      {tags.length < MAX_TAGS && (
        <div className="flex gap-2">
          <input
            className={input}
            value={draft}
            maxLength={TAG_MAX + 20}
            placeholder={placeholder}
            aria-label={label}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                add();
              }
            }}
          />
          <button type="button" onClick={add} className="min-h-[44px] px-4 rounded-lg border border-paper-border bg-white text-[14px] font-semibold text-ink">
            {t("profile.tag.add")}
          </button>
        </div>
      )}
    </Field>
  );
}
