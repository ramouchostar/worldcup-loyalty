"use client";

import { useMemo, useState } from "react";
import { saveBudgetsAction, saveSettingsAction } from "../actions";
import { exampleBreakdown, validateSettings } from "@/lib/marketplace-settings-rules";
import { formatEuros, type Metier } from "@/lib/mission-money";

const INPUT = "w-28 rounded-lg border border-gray-300 dark:border-gray-700 bg-transparent px-2.5 py-1.5 text-sm";
const BTN = "rounded-lg bg-gray-900 dark:bg-white text-white dark:text-gray-900 font-semibold text-xs px-3 py-2 disabled:opacity-50";

export function SettingsForm({ initial }: { initial: { commissionPct: string; proCommissionPct: string; depositPct: string } }) {
  const [v, setV] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  // L'exemple se met à jour à la frappe : la plateforme voit ce que ses chiffres donnent AVANT d'enregistrer.
  const verdict = useMemo(() => validateSettings(v), [v]);
  const ex = verdict.ok ? exampleBreakdown(verdict.terms) : null;

  async function save() {
    setBusy(true);
    setMsg(null);
    const r = await saveSettingsAction(v);
    setMsg(r.error ? { ok: false, text: r.error } : { ok: true, text: "Réglages enregistrés. Ils s'appliquent aux prochains devis acceptés ; une mission déjà acceptée garde ses montants." });
    setBusy(false);
  }

  return (
    <div className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-3">
        {[
          ["commissionPct", "Commission (Gratuit, Croissance)", "% du prix du devis, comprise dans le prix"],
          ["proCommissionPct", "Commission du plan Pro", "% du prix du devis"],
          ["depositPct", "Acompte", "% du prix payé, 20 % au minimum"],
        ].map(([key, label, hint]) => (
          <label key={key} className="space-y-1 text-xs font-medium">
            {label}
            <span className="flex items-center gap-1.5">
              <input value={v[key as keyof typeof v]} onChange={(e) => setV({ ...v, [key]: e.target.value })} inputMode="decimal" className={INPUT} />
              <span>%</span>
            </span>
            <span className="block font-normal text-gray-500">{hint}</span>
          </label>
        ))}
      </div>

      {ex ? (
        <p className="text-xs text-gray-600 dark:text-gray-300 rounded-lg bg-gray-50 dark:bg-gray-800 p-3">
          Sur un devis de {formatEuros(100_000)} : le prestataire reçoit <strong>{formatEuros(ex.provider)}</strong> ; un restaurateur Gratuit ou Croissance paie {formatEuros(ex.standardPays)} (Boosteats garde {formatEuros(ex.platformStandard)}) ; un restaurateur Pro paie {formatEuros(ex.proPays)} (Boosteats garde {formatEuros(ex.platformPro)}). Les frais Stripe sont à retirer de ce que Boosteats garde.
        </p>
      ) : (
        <p role="alert" className="text-xs font-semibold text-red-600">Corrige les champs : l&apos;exemple s&apos;affiche quand les trois valeurs sont valables.</p>
      )}

      <button type="button" disabled={busy || !verdict.ok} onClick={save} className={BTN}>
        {busy ? "Enregistrement…" : "Enregistrer"}
      </button>
      {msg && (
        <p role={msg.ok ? "status" : "alert"} className={`text-xs font-semibold ${msg.ok ? "text-emerald-700" : "text-red-600"}`}>
          {msg.text}
        </p>
      )}
    </div>
  );
}

export function BudgetsForm({ metier, noun, formats, initial }: { metier: Metier; noun: string; formats: string[]; initial: { floorEuros: string; ambitionEuros: Record<string, string> } }) {
  const [floor, setFloor] = useState(initial.floorEuros);
  const [amb, setAmb] = useState(initial.ambitionEuros);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  async function save() {
    setBusy(true);
    setMsg(null);
    const r = await saveBudgetsAction(metier, { floorEuros: floor, ambitionEuros: amb });
    setMsg(r.error ? { ok: false, text: r.error } : { ok: true, text: "Budgets enregistrés. Les restaurateurs les voient dès leur prochain brief." });
    setBusy(false);
  }

  return (
    <div className="space-y-4">
      <label className="block space-y-1 text-xs font-medium">
        Budget plancher d&apos;un brief {noun}
        <span className="flex items-center gap-1.5">
          <input value={floor} onChange={(e) => setFloor(e.target.value)} inputMode="decimal" placeholder="aucun" className={INPUT} />
          <span>€ hors TVA</span>
        </span>
        <span className="block font-normal text-gray-500">Sous ce budget, le brief est refusé (message clair). Vide = pas de plancher.</span>
      </label>

      {formats.length > 0 && (
      <fieldset className="space-y-2">
        <legend className="text-xs font-medium">Budget réaliste par format <span className="font-normal text-gray-500">· un avertissement, jamais un refus</span></legend>
        <div className="grid gap-3 sm:grid-cols-2">
          {formats.map((f) => (
            <label key={f} className="flex items-center gap-2 text-xs">
              <span className="w-24 shrink-0">{f}</span>
              <input value={amb[f] ?? ""} onChange={(e) => setAmb({ ...amb, [f]: e.target.value })} inputMode="decimal" placeholder="aucun" className={INPUT} />
              <span>€</span>
            </label>
          ))}
        </div>
        <p className="text-xs text-gray-500">Le restaurateur qui choisit « Film » avec un budget en dessous voit : « Un projet Film demande en général au moins … ». Il peut envoyer son brief quand même.</p>
      </fieldset>
      )}

      <button type="button" disabled={busy} onClick={save} className={BTN}>
        {busy ? "Enregistrement…" : "Enregistrer les budgets"}
      </button>
      {msg && (
        <p role={msg.ok ? "status" : "alert"} className={`text-xs font-semibold ${msg.ok ? "text-emerald-700" : "text-red-600"}`}>
          {msg.text}
        </p>
      )}
    </div>
  );
}
