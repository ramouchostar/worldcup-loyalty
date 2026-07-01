"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { TeamType } from "@/types";

const TYPE_OPTIONS: { value: TeamType; label: string }[] = [
  { value: "ecole", label: "École" },
  { value: "entreprise", label: "Entreprise" },
  { value: "rue_quartier", label: "Rue / quartier" },
  { value: "taxis", label: "Taxis" },
  { value: "autre", label: "Autre" },
];

type Team = { id: string; name: string; type: TeamType; join_code: string };

export function TeamManager({
  team,
  initialJoinCode,
  restaurantId,
}: {
  team: Team | null;
  initialJoinCode: string | null;
  restaurantId: string;
}) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [type, setType] = useState<TeamType>("ecole");
  const [code, setCode] = useState(initialJoinCode ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showChange, setShowChange] = useState(false);

  async function create() {
    setBusy(true);
    setError(null);
    const res = await fetch("/api/teams", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, type, restaurantId }),
    });
    const body = await res.json();
    if (res.ok) router.refresh();
    else {
      setError(body.error ?? "Erreur.");
      setBusy(false);
    }
  }

  async function join() {
    setBusy(true);
    setError(null);
    const res = await fetch("/api/teams/join", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code, restaurantId }),
    });
    const body = await res.json();
    if (res.ok) router.refresh();
    else {
      setError(body.error ?? "Erreur.");
      setBusy(false);
    }
  }

  // ── Mode gestion : partage du lien + changement ───────────────────────────
  if (team && !showChange) {
    const link =
      typeof window !== "undefined"
        ? `${window.location.origin}/join-team?code=${team.join_code}`
        : `/join-team?code=${team.join_code}`;
    const wa = `https://wa.me/?text=${encodeURIComponent(`Rejoins mon équipe ${team.name} 🎁 ${link}`)}`;

    return (
      <div className="bg-white rounded-2xl border border-gray-100 p-5 space-y-3">
        <div>
          <p className="text-sm font-semibold text-gray-900">Inviter dans ton équipe</p>
          <p className="text-xs text-gray-500">Partage ce lien — chaque membre fait grandir l&apos;équipe.</p>
        </div>
        <div className="flex items-center gap-2">
          <input readOnly value={link} className="flex-1 border border-gray-200 rounded-lg px-3 py-2 text-xs bg-gray-50" />
          <button
            onClick={() => navigator.clipboard?.writeText(link)}
            className="px-3 py-2 bg-gray-100 rounded-lg text-sm font-medium hover:bg-gray-200 shrink-0"
          >
            Copier
          </button>
        </div>
        <a
          href={wa}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center justify-center gap-2 w-full bg-green-500 text-white py-2.5 rounded-xl font-semibold text-sm hover:bg-green-600"
        >
          📲 Partager sur WhatsApp
        </a>
        <button onClick={() => setShowChange(true)} className="text-xs text-gray-400 hover:text-gray-600 underline">
          Changer d&apos;équipe
        </button>
      </div>
    );
  }

  // ── Mode onboarding / changement : rejoindre ou créer ─────────────────────
  return (
    <div className="space-y-4">
      {team && (
        <button onClick={() => setShowChange(false)} className="text-xs text-gray-400 hover:text-gray-600 underline">
          ← Revenir à mon équipe
        </button>
      )}
      {error && <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-sm text-red-700">{error}</div>}

      <div className="bg-white rounded-2xl border border-gray-100 p-5 space-y-3">
        <p className="font-semibold text-gray-900">Rejoindre une équipe</p>
        {initialJoinCode && !team && (
          <p className="text-xs text-brand-gold">Un lien d&apos;invitation t&apos;attend — code prérempli.</p>
        )}
        <div className="flex items-center gap-2">
          <input
            value={code}
            onChange={(e) => setCode(e.target.value.toUpperCase())}
            placeholder="Code (ex. ABC123)"
            maxLength={6}
            className="flex-1 border border-gray-200 rounded-lg px-3 py-2 text-sm uppercase tracking-widest"
          />
          <button
            onClick={join}
            disabled={busy || code.length !== 6}
            className="px-4 py-2 bg-brand-dark text-white rounded-lg text-sm font-semibold disabled:opacity-50 shrink-0"
          >
            Rejoindre
          </button>
        </div>
      </div>

      <div className="bg-white rounded-2xl border border-gray-100 p-5 space-y-3">
        <p className="font-semibold text-gray-900">Créer une équipe</p>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Nom (ex. École Saint-Jean)"
          maxLength={60}
          className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm"
        />
        <select
          value={type}
          onChange={(e) => setType(e.target.value as TeamType)}
          className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm bg-white"
        >
          {TYPE_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>
        <button
          onClick={create}
          disabled={busy || name.trim().length < 2}
          className="w-full px-4 py-2 bg-brand-red text-white rounded-lg text-sm font-semibold disabled:opacity-50 hover:bg-red-700"
        >
          {busy ? "…" : "Créer mon équipe"}
        </button>
      </div>
    </div>
  );
}
