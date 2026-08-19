"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { AdminTeam } from "@/lib/teams-admin";

const TYPE_LABELS: Record<string, string> = {
  ecole: "École",
  entreprise: "Entreprise",
  rue_quartier: "Rue / quartier",
  taxis: "Taxis",
  autre: "Autre",
};

const euros = (n: number) => n.toLocaleString("fr-BE", { style: "currency", currency: "EUR" });

export function TeamsManager({ restaurantId, teams }: { restaurantId: string; teams: AdminTeam[] }) {
  const router = useRouter();
  const [openId, setOpenId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draftName, setDraftName] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);

  async function act(teamId: string, action: string, extra: Record<string, unknown> = {}) {
    setBusyId(teamId);
    setError(null);
    const res = await fetch("/api/admin/teams", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action, restaurantId, teamId, ...extra }),
    });
    setBusyId(null);
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data.error ?? "Erreur. Réessaie.");
      return false;
    }
    setEditingId(null);
    setConfirmDelete(null);
    router.refresh();
    return true;
  }

  if (teams.length === 0) {
    return (
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-8 text-center">
        <p className="text-4xl mb-3">👥</p>
        <p className="font-semibold text-gray-900">Aucune équipe pour l&apos;instant</p>
        <p className="text-sm text-gray-500 mt-1">
          Une équipe naît quand un client se reconnaît dans une des communautés que tu as déclarées.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {error && (
        <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{error}</p>
      )}

      {teams.map((team) => {
        const open = openId === team.id;
        const busy = busyId === team.id;
        return (
          <div
            key={team.id}
            className={`bg-white rounded-2xl shadow-sm border p-4 ${team.isActive ? "border-gray-100" : "border-gray-200 bg-gray-50"}`}
          >
            <div className="flex items-start gap-3">
              <span className="text-2xl shrink-0">{team.emoji}</span>

              <div className="min-w-0 flex-1">
                {editingId === team.id ? (
                  <div className="flex gap-2">
                    <input
                      value={draftName}
                      onChange={(e) => setDraftName(e.target.value)}
                      maxLength={60}
                      autoFocus
                      className="flex-1 border border-gray-300 rounded-lg px-3 py-1.5 text-sm"
                    />
                    <button
                      onClick={() => act(team.id, "rename", { name: draftName })}
                      disabled={busy}
                      className="bg-brand-red text-white px-3 py-1.5 rounded-lg text-sm font-semibold disabled:opacity-50"
                    >
                      Enregistrer
                    </button>
                    <button
                      onClick={() => setEditingId(null)}
                      className="text-sm text-gray-500 px-2 hover:text-gray-700"
                    >
                      Annuler
                    </button>
                  </div>
                ) : (
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-bold text-gray-900">{team.name}</span>
                    <span className="text-xs text-gray-500">{TYPE_LABELS[team.type] ?? team.type}</span>
                    {!team.isActive && (
                      <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-gray-200 text-gray-600">
                        Archivée
                      </span>
                    )}
                    {team.fromSuggestion && (
                      <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-blue-50 text-blue-700">
                        Communauté déclarée
                      </span>
                    )}
                  </div>
                )}

                <p className="text-sm text-gray-500 mt-0.5">
                  {team.memberCount} membre{team.memberCount > 1 ? "s" : ""} · {euros(team.totalSpent)} cumulés ·{" "}
                  {team.orderCount} commande{team.orderCount > 1 ? "s" : ""}
                  {team.joinCode && <> · code {team.joinCode}</>}
                </p>

                <div className="flex gap-3 mt-2 text-xs font-semibold">
                  <button
                    onClick={() => setOpenId(open ? null : team.id)}
                    className="text-brand-red hover:underline"
                  >
                    {open ? "Masquer les membres" : "Voir les membres"}
                  </button>
                  <button
                    onClick={() => {
                      setEditingId(team.id);
                      setDraftName(team.name);
                    }}
                    className="text-gray-500 hover:text-gray-800"
                  >
                    Renommer
                  </button>
                  {team.isActive ? (
                    <button
                      onClick={() => act(team.id, "archive")}
                      disabled={busy}
                      className="text-gray-500 hover:text-gray-800 disabled:opacity-50"
                    >
                      Archiver
                    </button>
                  ) : (
                    <button
                      onClick={() => act(team.id, "restore")}
                      disabled={busy}
                      className="text-gray-500 hover:text-gray-800 disabled:opacity-50"
                    >
                      Réactiver
                    </button>
                  )}
                  {team.canDelete && (
                    <button
                      onClick={() => setConfirmDelete(team.id)}
                      disabled={busy}
                      className="text-red-600 hover:underline disabled:opacity-50"
                    >
                      Supprimer
                    </button>
                  )}
                </div>

                {confirmDelete === team.id && (
                  <div className="mt-3 bg-red-50 border border-red-200 rounded-lg p-3">
                    <p className="text-sm text-red-900">
                      Supprimer « {team.name} » ?{" "}
                      {team.memberCount > 0
                        ? `Ses ${team.memberCount} membre${team.memberCount > 1 ? "s" : ""} se retrouveront sans équipe — ils gardent leur compte et peuvent continuer à envoyer leurs tickets.`
                        : "Elle n'a aucun membre."}
                    </p>
                    <div className="flex gap-2 mt-2">
                      <button
                        onClick={() => act(team.id, "delete")}
                        disabled={busy}
                        className="bg-red-600 text-white px-3 py-1.5 rounded-lg text-sm font-semibold disabled:opacity-50"
                      >
                        {busy ? "Suppression..." : "Confirmer"}
                      </button>
                      <button onClick={() => setConfirmDelete(null)} className="text-sm text-gray-600 px-2">
                        Annuler
                      </button>
                    </div>
                  </div>
                )}

                {open && (
                  <div className="mt-3 border-t border-gray-100 pt-3">
                    {team.members.length === 0 ? (
                      <p className="text-sm text-gray-400">Aucun membre.</p>
                    ) : (
                      <ul className="space-y-1.5">
                        {team.members.map((m) => (
                          <li key={m.userId} className="flex justify-between gap-3 text-sm">
                            <span className="text-gray-900 truncate">{m.name}</span>
                            <span className="text-gray-500 shrink-0">
                              {m.orderCount} cmd · {euros(m.totalSpent)}
                            </span>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
