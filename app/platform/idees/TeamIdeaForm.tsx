"use client";

import { useState, useTransition } from "react";
import { ASSISTANTS, type AssistantId } from "@/lib/agents/types";
import { TEAM_IDEA_LIMITS as L } from "@/lib/agents/team-ideas";
import { createTeamIdea, markTeamDone } from "./actions";

// Le formulaire de /platform/idees (Brigade 04) : l'équipe écrit la carte que le
// gérant verra telle quelle dans ses Idées du jour. L'aperçu sous le formulaire
// est la carte en petit — on relit avant de déposer.

const input = "w-full rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-950 px-3 py-2 text-sm text-gray-900 dark:text-gray-100";
const labelCls = "block text-xs font-semibold text-gray-700 dark:text-gray-300 mb-1";

type Restaurant = { id: string; name: string; plan: string; demo: boolean };

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className={labelCls}>{label}</span>
      {children}
      {hint && <span className="block mt-1 text-[11px] text-gray-500">{hint}</span>}
    </label>
  );
}

export function TeamIdeaForm({ restaurants, today, defaultDecideBy }: { restaurants: Restaurant[]; today: string; defaultDecideBy: string }) {
  const [f, setF] = useState({
    restaurantId: "",
    assistant: "louis" as AssistantId,
    title: "",
    question: "",
    what: "",
    who: "",
    cost: "",
    decideBy: defaultDecideBy,
    note: "",
    label: "",
    estimateLow: "",
    estimateHigh: "",
    estimateUnit: "",
    estimateBasis: "",
  });
  const [errors, setErrors] = useState<string[]>([]);
  const [done, setDone] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => setF({ ...f, [k]: e.target.value });
  const num = (v: string) => (v.trim() === "" ? null : Number(v.replace(",", ".")));
  const a = ASSISTANTS[f.assistant];
  const resto = restaurants.find((r) => r.id === f.restaurantId);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setErrors([]);
    setDone(null);
    start(async () => {
      const r = await createTeamIdea(f.restaurantId, {
        assistant: f.assistant,
        title: f.title,
        question: f.question,
        what: f.what,
        who: f.who,
        cost: f.cost,
        decideBy: f.decideBy,
        note: f.note,
        label: f.label,
        estimateLow: num(f.estimateLow),
        estimateHigh: num(f.estimateHigh),
        estimateUnit: f.estimateUnit,
        estimateBasis: f.estimateBasis,
      });
      if (r.ok) {
        setDone(r.message);
        setF({ ...f, title: "", question: "", what: "", who: "", cost: "", note: "", label: "", estimateLow: "", estimateHigh: "", estimateUnit: "", estimateBasis: "" });
      } else setErrors(r.errors);
    });
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Établissement">
          <select required value={f.restaurantId} onChange={set("restaurantId")} className={input}>
            <option value="">Choisir…</option>
            {restaurants.map((r) => (
              <option key={r.id} value={r.id}>
                {r.name} · {r.plan}{r.demo ? " · démo" : ""}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Assistant" hint={`${a.post} · à partir du forfait ${a.plan}`}>
          <select value={f.assistant} onChange={set("assistant")} className={input}>
            {(Object.keys(ASSISTANTS) as AssistantId[]).map((id) => (
              <option key={id} value={id}>{ASSISTANTS[id].name} · {ASSISTANTS[id].post}</option>
            ))}
          </select>
        </Field>
      </div>

      <Field label={`Ce qui se passe (${f.title.length}/${L.title})`} hint="Un constat court : « Trois avis Google attendent une réponse ».">
        <input value={f.title} onChange={set("title")} maxLength={L.title} className={input} />
      </Field>
      <Field label={`La question (${f.question.length}/${L.question})`} hint="Ce que l'assistant demande : « On y répond pour toi ? ».">
        <input value={f.question} onChange={set("question")} maxLength={L.question} className={input} />
      </Field>
      <div className="grid gap-3 sm:grid-cols-3">
        <Field label="Quoi"><textarea rows={3} value={f.what} onChange={set("what")} maxLength={L.line} className={input} /></Field>
        <Field label="Pour qui"><textarea rows={3} value={f.who} onChange={set("who")} maxLength={L.line} className={input} /></Field>
        <Field label="Combien" hint="« Rien. » si gratuit.">
          <textarea rows={3} value={f.cost} onChange={set("cost")} maxLength={L.line} className={input} />
        </Field>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Date limite" hint="Sans réponse à cette date, l'idée s'efface.">
          <input type="date" min={today} value={f.decideBy} onChange={set("decideBy")} className={input} />
        </Field>
        <Field label="Texte du bouton (facultatif)" hint={`« ${f.label || "On y va"} » s'affiche « Oui, ${(f.label || "on y va").toLowerCase()} ».`}>
          <input value={f.label} onChange={set("label")} maxLength={L.label} placeholder="On y va" className={input} />
        </Field>
      </div>

      <details className="rounded-lg border border-gray-200 dark:border-gray-800 p-3">
        <summary className="text-xs font-semibold text-gray-700 dark:text-gray-300 cursor-pointer">Estimation (facultatif) : une fourchette avec sa base, ou rien</summary>
        <div className="grid gap-3 sm:grid-cols-4 mt-3">
          <Field label="Bas"><input inputMode="decimal" value={f.estimateLow} onChange={set("estimateLow")} className={input} /></Field>
          <Field label="Haut"><input inputMode="decimal" value={f.estimateHigh} onChange={set("estimateHigh")} className={input} /></Field>
          <Field label="Unité"><input value={f.estimateUnit} onChange={set("estimateUnit")} placeholder="clients de retour" className={input} /></Field>
          <Field label="D'où ça vient"><input value={f.estimateBasis} onChange={set("estimateBasis")} placeholder="Relances de septembre" className={input} /></Field>
        </div>
      </details>

      <Field label="Ce que l'équipe fera sur « Oui »" hint="Pour nous seulement : le gérant ne le voit pas.">
        <textarea rows={2} value={f.note} onChange={set("note")} maxLength={L.note} className={input} />
      </Field>

      <div className="rounded-xl border border-gray-200 dark:border-gray-800 bg-gray-50 dark:bg-gray-900 p-4 space-y-2">
        <p className="text-[11px] uppercase tracking-wide text-gray-500">Aperçu de la carte{resto ? ` chez ${resto.name}` : ""}</p>
        <div className="flex items-center gap-2">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={a.photo} alt="" width={36} height={36} className="w-9 h-9 rounded-full object-cover" />
          <div className="text-sm"><span className="font-semibold">{a.name}</span> <span className="text-gray-500">· Préparée avec l&apos;équipe Boosteats</span></div>
        </div>
        <p className="font-semibold text-gray-900 dark:text-gray-100">{f.title || "Ce qui se passe"}</p>
        <p className="text-sm text-gray-700 dark:text-gray-300">{f.question || "La question ?"}</p>
        <p className="text-xs text-gray-600 dark:text-gray-400">Quoi : {f.what || "…"} · Pour qui : {f.who || "…"} · Combien : {f.cost || "…"}</p>
      </div>

      {errors.length > 0 && (
        <ul className="rounded-lg border border-red-300 bg-red-50 dark:bg-red-950/30 p-3 text-sm text-red-800 dark:text-red-300 list-disc pl-6" role="alert">
          {errors.map((e) => <li key={e}>{e}</li>)}
        </ul>
      )}
      {done && <p className="rounded-lg border border-green-300 bg-green-50 dark:bg-green-950/30 p-3 text-sm text-green-800 dark:text-green-300" role="status">{done}</p>}

      <button type="submit" disabled={pending} className="min-h-[44px] px-5 rounded-lg bg-gray-900 dark:bg-gray-100 text-white dark:text-gray-900 text-sm font-semibold disabled:opacity-50">
        {pending ? "Dépôt…" : "Déposer chez le gérant"}
      </button>
    </form>
  );
}

export function MarkDoneButton({ restaurantId, id }: { restaurantId: string; id: string }) {
  const [note, setNote] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const [pending, start] = useTransition();
  return (
    <div className="flex flex-wrap items-center gap-2">
      <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Ce qui a été fait (facultatif)" aria-label="Ce qui a été fait" className={`${input} flex-1 min-w-[180px]`} />
      <button
        type="button"
        disabled={pending}
        onClick={() => start(async () => setMsg((await markTeamDone(restaurantId, id, note)).message))}
        className="min-h-[40px] px-4 rounded-lg bg-gray-900 dark:bg-gray-100 text-white dark:text-gray-900 text-sm font-semibold disabled:opacity-50"
      >
        Fait
      </button>
      {msg && <span className="text-xs text-gray-600 dark:text-gray-400" role="status">{msg}</span>}
    </div>
  );
}
