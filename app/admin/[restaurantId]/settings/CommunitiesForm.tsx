"use client";

import { useState } from "react";
import { updateTeamSuggestions } from "./actions";
import {
  MAX_SUGGESTIONS,
  SUGGESTION_TYPES,
  normalizeSuggestionName,
  suggestionKey,
  teamTypeEmoji,
} from "@/lib/team-suggestions";
import type { TeamType } from "@/types";

export type CommunityRow = {
  id: string;
  name: string;
  type: TeamType;
  zone: string | null;
  materialized: boolean; // une équipe existe déjà sous ce nom
};

// ADR 0031 — « D'où viennent tes clients ? » côté console.
// Retirer une communauté déjà rejointe ne supprime pas l'équipe : elle vit sa
// vie, seul le raccourci d'adhésion disparaît. C'est dit dans l'UI.
export function CommunitiesForm({
  restaurantId,
  initial,
}: {
  restaurantId: string;
  initial: CommunityRow[];
}) {
  const [rows, setRows] = useState<CommunityRow[]>(initial);
  const [name, setName] = useState("");
  const [type, setType] = useState<TeamType>("ecole");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<{ kind: "error" | "success"; text: string } | null>(null);

  function add() {
    const clean = normalizeSuggestionName(name);
    if (!clean) return;
    if (rows.length >= MAX_SUGGESTIONS) return;
    if (rows.some((r) => suggestionKey(r.name) === suggestionKey(clean))) return;
    setRows([...rows, { id: `new-${clean}`, name: clean, type, zone: null, materialized: false }]);
    setName("");
    setMessage(null);
  }

  function remove(id: string) {
    setRows(rows.filter((r) => r.id !== id));
    setMessage(null);
  }

  async function save() {
    setLoading(true);
    setMessage(null);
    const formData = new FormData();
    rows.forEach((r) =>
      formData.append("communities", JSON.stringify({ name: r.name, type: r.type, zone: r.zone }))
    );
    const result = await updateTeamSuggestions(restaurantId, null, formData);
    setLoading(false);
    if (result.error) setMessage({ kind: "error", text: result.error });
    if (result.success) setMessage({ kind: "success", text: result.success });
  }

  return (
    <div className="bg-white rounded-2xl border border-gray-100 p-5 space-y-4">
      <div>
        <h2 className="font-bold text-gray-900">👥 D&apos;où viennent tes clients ?</h2>
        <p className="text-xs text-gray-400 mt-0.5">
          Les écoles, entreprises et quartiers que tu vois passer le plus. À
          l&apos;inscription, on demande à chaque client s&apos;il s&apos;y
          reconnaît — il rejoint son équipe en un tap au lieu d&apos;avoir à en
          créer une. Un nom n&apos;apparaît nulle part tant que personne ne
          l&apos;a rejoint ({rows.length}/{MAX_SUGGESTIONS}).
        </p>
      </div>

      {rows.length > 0 && (
        <div className="space-y-2">
          {rows.map((r) => (
            <div key={r.id} className="flex items-center gap-3 p-3 rounded-xl bg-gray-50">
              <span className="text-lg shrink-0" aria-hidden="true">{teamTypeEmoji(r.type)}</span>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-gray-900 truncate">{r.name}</p>
                <p className="text-xs text-gray-400">
                  {SUGGESTION_TYPES.find((t) => t.value === r.type)?.label}
                  {r.materialized && " · équipe active"}
                </p>
              </div>
              <button
                type="button"
                onClick={() => remove(r.id)}
                className="text-xs text-gray-400 hover:text-red-600 shrink-0"
              >
                Retirer
              </button>
            </div>
          ))}
        </div>
      )}

      {rows.length < MAX_SUGGESTIONS && (
        <div className="space-y-2">
          <div className="flex gap-2">
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  add();
                }
              }}
              placeholder={SUGGESTION_TYPES.find((t) => t.value === type)?.hint ?? "Nom"}
              maxLength={60}
              className="flex-1 min-w-0 border border-gray-300 rounded-lg px-3 py-2 text-sm"
            />
            <button
              type="button"
              onClick={add}
              className="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg text-sm font-medium hover:bg-gray-200 shrink-0"
            >
              Ajouter
            </button>
          </div>
          <select
            value={type}
            onChange={(e) => setType(e.target.value as TeamType)}
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white"
          >
            {SUGGESTION_TYPES.map((t) => (
              <option key={t.value} value={t.value}>
                {teamTypeEmoji(t.value)} {t.label}
              </option>
            ))}
          </select>
        </div>
      )}

      {rows.some((r) => r.materialized) && (
        <p className="text-xs text-gray-400">
          Retirer une communauté déjà rejointe ne supprime pas son équipe — elle
          reste active, seul le raccourci d&apos;adhésion disparaît.
        </p>
      )}

      {message && (
        <p className={`text-sm ${message.kind === "error" ? "text-red-600" : "text-green-700"}`}>
          {message.text}
        </p>
      )}

      <button
        type="button"
        onClick={save}
        disabled={loading}
        className="w-full bg-brand-red text-white py-3 rounded-xl font-semibold hover:bg-brand-red/85 disabled:opacity-50 transition-colors"
      >
        {loading ? "Enregistrement..." : "Enregistrer les communautés"}
      </button>
    </div>
  );
}
