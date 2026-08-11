"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { MAX_ZONES, sanitizeZones } from "@/lib/zones";
import type { TeamType } from "@/types";

const TYPE_OPTIONS: { value: TeamType; label: string }[] = [
  { value: "ecole", label: "École" },
  { value: "entreprise", label: "Entreprise" },
  { value: "rue_quartier", label: "Rue / quartier" },
  { value: "taxis", label: "Taxis" },
  { value: "autre", label: "Autre" },
];

type Team = { id: string; name: string; type: TeamType; join_code: string };

// Équipe proposée par la découverte de zone (ADR 0018)
export type NearbyTeam = {
  id: string;
  name: string;
  type: TeamType;
  flag_emoji: string;
  zone: string;
  member_count: number;
  score: number;
};

export function TeamManager({
  team,
  initialJoinCode,
  restaurantId,
  zones,
  nearbyTeams,
}: {
  team: Team | null;
  initialJoinCode: string | null;
  restaurantId: string;
  zones: string[];
  nearbyTeams: NearbyTeam[];
}) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [type, setType] = useState<TeamType>("ecole");
  const [teamZone, setTeamZone] = useState(zones[0] ?? "");
  const [customZone, setCustomZone] = useState("");
  const [code, setCode] = useState(initialJoinCode ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showChange, setShowChange] = useState(false);
  // Feedback « ✓ Copié » pendant 2 s après le tap (audit UX 2026-08-11)
  const [copied, setCopied] = useState(false);
  // ADR 0030 §6 — suite de parcours : après avoir créé/rejoint, on célèbre et
  // on propose le classement (l'état survit au router.refresh(), même instance).
  const [justJoined, setJustJoined] = useState(false);

  async function create() {
    setBusy(true);
    setError(null);
    const zone = teamZone === "__custom__" ? customZone : teamZone;
    try {
      const res = await fetch("/api/teams", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, type, restaurantId, zone: zone || null }),
      });
      const body = await res.json().catch(() => ({}));
      if (res.ok) { setJustJoined(true); setShowChange(false); router.refresh(); return; }
      setError(body.error ?? "Erreur.");
    } catch {
      setError("Erreur réseau. Réessaie.");
    } finally {
      setBusy(false);
    }
  }

  async function join(payload: { code?: string; teamId?: string }) {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/teams/join", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...payload, restaurantId }),
      });
      const body = await res.json().catch(() => ({}));
      if (res.ok) { setJustJoined(true); setShowChange(false); router.refresh(); return; }
      setError(body.error ?? "Erreur.");
    } catch {
      setError("Erreur réseau. Réessaie.");
    } finally {
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
      <div className="space-y-3">
        {justJoined && (
          <div className="bg-green-50 border border-green-200 rounded-2xl p-4 text-center space-y-2">
            <p className="font-bold text-green-900">🎉 Te voilà dans l&apos;équipe {team.name} !</p>
            <p className="text-sm text-green-700">
              Chaque commande directe de l&apos;équipe fait grimper votre score.
            </p>
            <Link
              href={`/r/${restaurantId}/leaderboard`}
              className="inline-block bg-green-600 text-white px-4 py-2 rounded-xl text-sm font-semibold hover:bg-green-700 transition-colors"
            >
              Voir le classement →
            </Link>
          </div>
        )}
      <div className="bg-white rounded-2xl border border-gray-100 p-5 space-y-3">
        <div>
          <p className="text-sm font-semibold text-gray-900">Inviter dans ton équipe</p>
          <p className="text-sm text-gray-600">Partage ce lien — chaque membre fait grandir l&apos;équipe.</p>
        </div>
        <div className="flex items-center gap-2">
          <input readOnly value={link} className="flex-1 border border-gray-200 rounded-lg px-3 py-2 text-xs bg-gray-50" />
          <button
            onClick={() => {
              navigator.clipboard?.writeText(link);
              setCopied(true);
              setTimeout(() => setCopied(false), 2000);
            }}
            className="px-3 py-2 min-h-[44px] bg-gray-100 rounded-lg text-sm font-medium hover:bg-gray-200 shrink-0"
          >
            {copied ? "✓ Copié" : "Copier"}
          </button>
        </div>
        <a
          href={wa}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center justify-center gap-2 w-full bg-green-500 text-white py-3 rounded-xl font-semibold text-sm hover:bg-green-600"
        >
          📲 Partager sur WhatsApp
        </a>
        <button
          onClick={() => setShowChange(true)}
          className="text-sm text-gray-600 hover:text-gray-800 underline min-h-[44px] inline-flex items-center px-2"
        >
          Changer d&apos;équipe
        </button>
      </div>
      </div>
    );
  }

  // ── Mode onboarding / changement : découvrir, rejoindre ou créer ──────────
  return (
    <div className="space-y-4">
      {team && (
        <button
          onClick={() => setShowChange(false)}
          className="text-sm text-gray-600 hover:text-gray-800 underline min-h-[44px] inline-flex items-center px-2"
        >
          ← Revenir à mon équipe
        </button>
      )}
      {error && <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-sm text-red-700">{error}</div>}

      {/* Zones du membre (ADR 0018) */}
      <ZonesCard zones={zones} onSaved={() => router.refresh()} />

      {/* Équipes dans ta zone */}
      {zones.length > 0 && (
        <div className="bg-white rounded-2xl border border-gray-100 p-5 space-y-3">
          <div>
            <p className="font-semibold text-gray-900">Équipes dans ta zone</p>
            <p className="text-sm text-gray-600">
              Actives à {zones.join(", ")} — rejoins-en une en un clic.
            </p>
          </div>
          {nearbyTeams.length === 0 ? (
            <p className="text-sm text-gray-500 text-center py-3">
              Aucune équipe dans tes zones pour l&apos;instant — sois la première à en créer une ! 👇
            </p>
          ) : (
            <div className="space-y-2">
              {nearbyTeams.map((t) => (
                <div key={t.id} className="flex items-center gap-3 p-3 rounded-xl bg-gray-50">
                  <span className="text-xl shrink-0">{t.flag_emoji}</span>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-gray-900 truncate">{t.name}</p>
                    <p className="text-xs text-gray-500">
                      📍 {t.zone} · {t.member_count} membre{t.member_count > 1 ? "s" : ""} ·{" "}
                      {t.score.toLocaleString("fr-BE", { maximumFractionDigits: 0 })} pts
                    </p>
                  </div>
                  <button
                    onClick={() => join({ teamId: t.id })}
                    disabled={busy}
                    className="px-4 py-3 min-h-[44px] bg-brand-red text-white rounded-lg text-sm font-semibold disabled:opacity-50 hover:bg-brand-red/85 shrink-0"
                  >
                    Rejoindre
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      <div className="bg-white rounded-2xl border border-gray-100 p-5 space-y-3">
        <p className="font-semibold text-gray-900">Rejoindre avec un code d&apos;invitation</p>
        {initialJoinCode && !team && (
          <p className="text-sm text-brand-red">Un lien d&apos;invitation t&apos;attend — code prérempli.</p>
        )}
        <div>
          <label htmlFor="team-join-code" className="block text-sm text-gray-700 mb-1">
            Code d&apos;invitation
          </label>
          <div className="flex items-center gap-2">
            <input
              id="team-join-code"
              value={code}
              onChange={(e) => setCode(e.target.value.toUpperCase())}
              placeholder="Code (ex. ABC123)"
              maxLength={6}
              className="flex-1 border border-gray-200 rounded-lg px-3 py-2 text-sm uppercase tracking-widest"
            />
            <button
              onClick={() => join({ code })}
              disabled={busy || code.length !== 6}
              className="px-4 py-3 bg-brand-dark text-white rounded-lg text-sm font-semibold disabled:opacity-50 shrink-0"
            >
              Rejoindre
            </button>
          </div>
          {code.length !== 6 && (
            <p className="text-sm text-gray-500 mt-1">Le code fait 6 caractères.</p>
          )}
        </div>
      </div>

      <div className="bg-white rounded-2xl border border-gray-100 p-5 space-y-3">
        <p className="font-semibold text-gray-900">Créer une équipe</p>
        <div>
          <label htmlFor="team-name" className="block text-sm text-gray-700 mb-1">
            Nom de l&apos;équipe
          </label>
          <input
            id="team-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Ex. École Saint-Jean"
            maxLength={60}
            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm"
          />
        </div>
        <div>
          <label htmlFor="team-type" className="block text-sm text-gray-700 mb-1">
            Type d&apos;équipe
          </label>
          <select
            id="team-type"
            value={type}
            onChange={(e) => setType(e.target.value as TeamType)}
            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm bg-white"
          >
            {TYPE_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
        </div>
        {/* Zone de l'équipe : proposée aux membres de cette zone (ADR 0018) */}
        <div>
          <label htmlFor="team-zone" className="block text-sm text-gray-700 mb-1">
            Zone
          </label>
          <select
            id="team-zone"
            value={teamZone}
            onChange={(e) => setTeamZone(e.target.value)}
            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm bg-white"
          >
            {zones.map((z) => (
              <option key={z} value={z}>📍 {z}</option>
            ))}
            <option value="__custom__">Autre zone…</option>
            <option value="">Sans zone (invitation uniquement)</option>
          </select>
        </div>
        {teamZone === "__custom__" && (
          <div>
            <label htmlFor="team-custom-zone" className="block text-sm text-gray-700 mb-1">
              Nom de la zone
            </label>
            <input
              id="team-custom-zone"
              value={customZone}
              onChange={(e) => setCustomZone(e.target.value)}
              placeholder="Ville ou quartier de l'équipe"
              maxLength={40}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm"
            />
          </div>
        )}
        <button
          onClick={create}
          disabled={busy || name.trim().length < 2}
          className="w-full px-4 py-3 min-h-[48px] bg-brand-red text-white rounded-lg text-sm font-semibold disabled:opacity-50 hover:bg-brand-red/85"
        >
          {busy ? "…" : "Créer mon équipe"}
        </button>
      </div>
    </div>
  );
}

// Zones du membre : affichage + édition inline (PUT /api/profile/zones).
// Ouvre directement l'éditeur si aucune zone (membres d'avant l'ADR 0018).
function ZonesCard({ zones, onSaved }: { zones: string[]; onSaved: () => void }) {
  const [editing, setEditing] = useState(zones.length === 0);
  const [fields, setFields] = useState<string[]>([
    zones[0] ?? "",
    zones[1] ?? "",
    zones[2] ?? "",
  ]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    const clean = sanitizeZones(fields);
    if (clean.length === 0) {
      setError("Indique au moins une zone (ville ou quartier).");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/profile/zones", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ zones: clean }),
      });
      const body = await res.json().catch(() => ({}));
      if (res.ok) {
        setEditing(false);
        onSaved();
      } else {
        setError(body.error ?? "Erreur.");
      }
    } catch {
      setError("Erreur réseau. Réessaie.");
    } finally {
      setBusy(false);
    }
  }

  if (!editing) {
    return (
      <div className="bg-white rounded-2xl border border-gray-100 p-4 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 flex-wrap min-w-0">
          <span className="text-sm text-gray-500 shrink-0">Tes zones :</span>
          {zones.map((z) => (
            <span key={z} className="text-xs bg-gray-100 text-gray-700 px-2 py-1 rounded-full font-medium">
              📍 {z}
            </span>
          ))}
        </div>
        <button
          onClick={() => setEditing(true)}
          className="text-sm text-gray-600 hover:text-gray-800 underline min-h-[44px] inline-flex items-center px-2 shrink-0"
        >
          Modifier
        </button>
      </div>
    );
  }

  const LABELS = ["Zone où tu vis", "Zone de travail (facultatif)", "Zone d'école (facultatif)"];
  return (
    <div className="bg-white rounded-2xl border border-gray-100 p-5 space-y-3">
      <div>
        <p className="font-semibold text-gray-900">Tes zones</p>
        <p className="text-sm text-gray-600">
          Ville ou quartier — on te propose les équipes actives dans tes zones (max {MAX_ZONES}).
        </p>
      </div>
      {fields.map((v, i) => (
        <div key={i}>
          {/* Libellé de champ = porteur → même gabarit que les autres labels du formulaire */}
          <label className="block text-sm text-gray-700 mb-1">{LABELS[i]}</label>
          <input
            value={v}
            onChange={(e) =>
              setFields((prev) => prev.map((p, j) => (j === i ? e.target.value : p)))
            }
            placeholder={i === 0 ? "Ex : Molenbeek" : "Ex : Anderlecht"}
            maxLength={40}
            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm"
          />
        </div>
      ))}
      {error && <p className="text-red-600 text-sm bg-red-50 px-3 py-2 rounded-lg">{error}</p>}
      <div className="flex items-center gap-2">
        <button
          onClick={save}
          disabled={busy}
          className="px-4 py-3 bg-brand-dark text-white rounded-lg text-sm font-semibold disabled:opacity-50"
        >
          {busy ? "…" : "Enregistrer"}
        </button>
        {zones.length > 0 && (
          <button
            onClick={() => setEditing(false)}
            className="text-sm text-gray-600 hover:text-gray-800 underline min-h-[44px] inline-flex items-center px-2"
          >
            Annuler
          </button>
        )}
      </div>
    </div>
  );
}
