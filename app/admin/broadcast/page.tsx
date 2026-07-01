"use client";

import { useEffect, useState } from "react";
import type { TeamType } from "@/types";

type TargetKind = "all" | "types" | "teams";
type Team = { id: string; name: string; type: TeamType; flag_emoji: string };
type Result = { targeted: number; sent: number; skipped: number };

const TYPE_OPTIONS: { value: TeamType; label: string }[] = [
  { value: "ecole", label: "🎓 Écoles" },
  { value: "entreprise", label: "🏢 Entreprises" },
  { value: "rue_quartier", label: "🏘️ Rues / quartiers" },
  { value: "taxis", label: "🚕 Taxis" },
  { value: "autre", label: "👥 Autres" },
];

export default function AdminBroadcastPage() {
  const [message, setMessage] = useState("");
  const [kind, setKind] = useState<TargetKind>("all");
  const [types, setTypes] = useState<TeamType[]>([]);
  const [teamIds, setTeamIds] = useState<string[]>([]);
  const [teams, setTeams] = useState<Team[]>([]);
  const [sending, setSending] = useState(false);
  const [result, setResult] = useState<Result | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/teams").then(async (r) => { if (r.ok) setTeams(await r.json()); });
  }, []);

  function toggle<T>(list: T[], v: T): T[] {
    return list.includes(v) ? list.filter((x) => x !== v) : [...list, v];
  }

  async function send() {
    setError(null);
    setResult(null);

    let target: unknown;
    if (kind === "all") target = { kind: "all" };
    else if (kind === "types") target = { kind: "types", types };
    else target = { kind: "teams", teamIds };

    if (kind === "types" && types.length === 0) { setError("Choisis au moins un type."); return; }
    if (kind === "teams" && teamIds.length === 0) { setError("Choisis au moins une équipe."); return; }
    if (!window.confirm("Envoyer ce broadcast ? Les membres ciblés seront notifiés.")) return;

    setSending(true);
    const res = await fetch("/api/admin/broadcast", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message, target }),
    });
    const body = await res.json();
    if (res.ok) { setResult(body); setMessage(""); }
    else setError(body.error ?? "Échec de l'envoi.");
    setSending(false);
  }

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Broadcasts</h1>
        <p className="text-gray-500 text-sm mt-1">
          Envoie une notification à tes équipes — par exemple un menu étudiant aux écoles, ou un service
          de nuit aux taxis. Push gratuit, WhatsApp en secours.
        </p>
      </div>

      {/* Message */}
      <div className="bg-white rounded-xl border border-gray-100 p-5 space-y-2">
        <label className="text-sm font-semibold text-gray-900">Message</label>
        <textarea
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          maxLength={280}
          rows={3}
          placeholder="Ex. Menu étudiant à 8,90 € ce midi sur présentation de l'app 🎓"
          className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm"
        />
        <p className="text-xs text-gray-400 text-right">{message.length}/280</p>
      </div>

      {/* Cible */}
      <div className="bg-white rounded-xl border border-gray-100 p-5 space-y-3">
        <p className="text-sm font-semibold text-gray-900">Destinataires</p>

        <div className="flex flex-wrap gap-2">
          {([["all", "Toutes les équipes"], ["types", "Par type"], ["teams", "Par équipe"]] as [TargetKind, string][]).map(
            ([value, label]) => (
              <button
                key={value}
                onClick={() => setKind(value)}
                className={`px-3 py-1.5 rounded-lg text-sm font-medium border ${
                  kind === value ? "bg-brand-dark text-white border-brand-dark" : "bg-white text-gray-700 border-gray-200 hover:bg-gray-50"
                }`}
              >
                {label}
              </button>
            )
          )}
        </div>

        {kind === "types" && (
          <div className="flex flex-wrap gap-2 pt-1">
            {TYPE_OPTIONS.map((o) => (
              <button
                key={o.value}
                onClick={() => setTypes((prev) => toggle(prev, o.value))}
                className={`px-3 py-1.5 rounded-full text-sm border ${
                  types.includes(o.value) ? "bg-brand-gold/20 border-brand-gold/50 text-amber-800" : "bg-white border-gray-200 text-gray-600"
                }`}
              >
                {o.label}
              </button>
            ))}
          </div>
        )}

        {kind === "teams" && (
          <div className="pt-1 max-h-60 overflow-y-auto space-y-1">
            {teams.length === 0 ? (
              <p className="text-sm text-gray-400">Aucune équipe pour l&apos;instant.</p>
            ) : (
              teams.map((t) => (
                <label key={t.id} className="flex items-center gap-2 p-2 rounded-lg hover:bg-gray-50 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={teamIds.includes(t.id)}
                    onChange={() => setTeamIds((prev) => toggle(prev, t.id))}
                  />
                  <span>{t.flag_emoji}</span>
                  <span className="text-sm text-gray-800">{t.name}</span>
                </label>
              ))
            )}
          </div>
        )}
      </div>

      {error && <div className="bg-red-50 border border-red-200 rounded-xl p-3 text-sm text-red-700">{error}</div>}
      {result && (
        <div className="bg-green-50 border border-green-200 rounded-xl p-3 text-sm text-green-800">
          Envoyé à {result.sent} membre(s) sur {result.targeted} ciblé(s).
          {result.skipped > 0 && ` ${result.skipped} ignoré(s) (quota hebdo atteint).`}
        </div>
      )}

      <button
        onClick={send}
        disabled={sending || message.trim().length < 3}
        className="px-5 py-2.5 bg-brand-red text-white rounded-lg text-sm font-semibold hover:bg-red-700 disabled:opacity-50"
      >
        {sending ? "Envoi en cours…" : "Envoyer le broadcast"}
      </button>
    </div>
  );
}
