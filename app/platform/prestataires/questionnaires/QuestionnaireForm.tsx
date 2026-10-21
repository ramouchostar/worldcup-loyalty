"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { saveQuestionnaireAction } from "../actions";
import type { Metier } from "@/lib/mission-money";

export type QuestionView = { key: string; kind: string; required: boolean; phase: string; label: string; hint: string; options: string[] | null; locked: boolean };

const INPUT = "w-full rounded-lg border border-gray-300 dark:border-gray-700 bg-transparent px-3 py-2 text-sm";

export function QuestionnaireForm({ metier, questions }: { metier: Metier; questions: QuestionView[] }) {
  const router = useRouter();
  const [rows, setRows] = useState(questions);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const set = (key: string, over: Partial<QuestionView>) => {
    setMsg(null);
    setRows((r) => r.map((q) => (q.key === key ? { ...q, ...over } : q)));
  };

  async function save() {
    setBusy(true);
    setMsg(null);
    const r = await saveQuestionnaireAction(
      metier,
      rows.map((q) => ({ key: q.key, label: q.label, hint: q.hint, ...(q.options ? { options: q.options } : {}) }))
    );
    setBusy(false);
    if (r.ok) {
      setMsg({ ok: true, text: `Enregistré : version ${r.version}. Les restaurateurs la voient dès leur prochain brief.` });
      router.refresh();
    } else setMsg({ ok: false, text: r.error ?? "Enregistrement impossible." });
  }

  return (
    <div className="space-y-5">
      <ol className="space-y-4">
        {rows.map((q) => (
          <li key={q.key} className="space-y-1.5 border-t border-gray-100 dark:border-gray-800 pt-3 first:border-0 first:pt-0">
            <p className="text-[11px] text-gray-500">
              {q.key} · {q.kind} · {q.required ? "obligatoire" : "facultatif"} · {q.phase}
            </p>
            <input aria-label={`Question ${q.key}`} value={q.label} onChange={(e) => set(q.key, { label: e.target.value })} className={INPUT} />
            <textarea aria-label={`Aide ${q.key}`} value={q.hint} onChange={(e) => set(q.key, { hint: e.target.value })} placeholder="Aide sous la question (facultatif)" rows={2} className={INPUT} />
            {q.options && (
              <label className="block space-y-1 text-xs">
                <span className="font-medium">Options, une par ligne{q.locked ? " (verrouillées : lues par le code)" : ""}</span>
                <textarea
                  value={q.options.join("\n")}
                  disabled={q.locked}
                  onChange={(e) => set(q.key, { options: e.target.value.split("\n") })}
                  rows={Math.min(8, Math.max(3, q.options.length))}
                  className={`${INPUT} ${q.locked ? "opacity-60" : ""}`}
                />
              </label>
            )}
          </li>
        ))}
      </ol>
      <button type="button" disabled={busy} onClick={save} className="rounded-lg bg-gray-900 text-white dark:bg-white dark:text-gray-900 px-4 py-2 text-sm font-semibold disabled:opacity-60">
        {busy ? "Enregistrement…" : "Enregistrer une nouvelle version"}
      </button>
      {msg && (
        <p role={msg.ok ? "status" : "alert"} className={`text-xs font-semibold ${msg.ok ? "text-emerald-700" : "text-red-600"}`}>
          {msg.text}
        </p>
      )}
    </div>
  );
}
