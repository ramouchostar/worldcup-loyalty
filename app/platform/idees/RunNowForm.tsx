"use client";

import { useState, useTransition } from "react";
import { ASSISTANTS } from "@/lib/agents/types";
import type { MorningRestaurantResult } from "@/lib/agents/morning";
import { runBrigadeNow } from "./actions";

// Faire passer la brigade maintenant pour un établissement (Brigade 05) : le
// rapport dit, assistant par assistant, ce qui a été proposé ou pourquoi rien.

const MESSAGE_TEXT: Record<MorningRestaurantResult["message"], string> = {
  sent: "Message du matin envoyé au gérant.",
  failed: "Message du matin en échec (voir le journal des messages).",
  not_open: "Pas de message : établissement absent de BRIGADE_EMAIL_RESTAURANTS.",
  no_idea: "Pas de message : aucune idée à décider.",
  already_sent: "Pas de message : déjà envoyé aujourd'hui.",
  no_contact: "Pas de message : aucune adresse e-mail pour cet établissement.",
  unavailable: "Table des idées indisponible.",
};

export function RunNowForm({ restaurants }: { restaurants: { id: string; name: string; demo: boolean }[] }) {
  const [id, setId] = useState("");
  const [out, setOut] = useState<{ ok: boolean; message?: string; result?: MorningRestaurantResult } | null>(null);
  const [pending, start] = useTransition();
  const r = out?.result;
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        <select value={id} onChange={(e) => setId(e.target.value)} aria-label="Établissement" className="rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-950 px-3 py-2 text-sm">
          <option value="">Choisir…</option>
          {restaurants.map((x) => (
            <option key={x.id} value={x.id}>{x.name}{x.demo ? " · démo" : ""}</option>
          ))}
        </select>
        <button
          type="button"
          disabled={!id || pending}
          onClick={() => start(async () => setOut(await runBrigadeNow(id)))}
          className="min-h-[40px] px-4 rounded-lg bg-gray-900 dark:bg-gray-100 text-white dark:text-gray-900 text-sm font-semibold disabled:opacity-50"
        >
          {pending ? "Passage en cours…" : "Faire passer la brigade maintenant"}
        </button>
      </div>
      {out && !out.ok && <p className="text-sm text-red-700 dark:text-red-400" role="alert">{out.message}</p>}
      {r && (
        <div className="rounded-lg border border-gray-200 dark:border-gray-800 p-3 text-sm space-y-2" role="status">
          <p className="font-semibold text-gray-900 dark:text-gray-100">
            {r.shown} idée{r.shown > 1 ? "s" : ""} montrée{r.shown > 1 ? "s" : ""} · {r.toDecide} à décider · forfait {r.plan}
            {Object.keys(r.discarded).length > 0 ? ` · écartées : ${Object.entries(r.discarded).map(([k, n]) => `${k.replace(/_/g, " ")} ${n}`).join(", ")}` : ""}
          </p>
          <ul className="space-y-1 text-gray-700 dark:text-gray-300">
            {r.generators.map((g) => (
              <li key={g.id}>
                <span className="font-medium">{ASSISTANTS[g.assistant].name}</span> ({g.id}) :{" "}
                {g.error ? <span className="text-red-700 dark:text-red-400">erreur, {g.error}</span> : g.ideas > 0 ? `${g.ideas} idée${g.ideas > 1 ? "s" : ""}` : `rien${g.reason ? ` (${g.reason})` : ""}`}
              </li>
            ))}
          </ul>
          <p className="text-gray-600 dark:text-gray-400">{MESSAGE_TEXT[r.message]}{r.push ? ` Push : ${r.push}.` : ""}</p>
          {r.error && <p className="text-red-700 dark:text-red-400">Erreur : {r.error}</p>}
        </div>
      )}
    </div>
  );
}
