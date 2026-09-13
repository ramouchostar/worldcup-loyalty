"use client";

import { useState } from "react";
import { Users } from "lucide-react";
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
      <div className="bg-white rounded-xl border border-paper-border p-8 text-center">
        <Users size={28} strokeWidth={1.6} className="mx-auto mb-3 text-ink-muted" aria-hidden="true" />
        <p className="font-semibold text-ink">Aucune équipe pour l&apos;instant</p>
        <p className="text-sm text-ink-muted mt-1">
          Une équipe naît quand un client se reconnaît dans une des communautés que tu as déclarées.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {error && (
        <p className="text-sm text-danger bg-danger/10 border border-danger/30 rounded-lg px-3 py-2">{error}</p>
      )}

      {teams.map((team) => {
        const open = openId === team.id;
        const busy = busyId === team.id;
        return (
          <div
            key={team.id}
            className={`bg-white rounded-xl border p-4 ${team.isActive ? "border-paper-border" : "border-paper-border bg-paper"}`}
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
                      className="flex-1 border border-paper-border rounded-lg px-3 py-1.5 text-sm"
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
                      className="text-sm text-ink-muted px-2 hover:text-ink-body"
                    >
                      Annuler
                    </button>
                  </div>
                ) : (
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-bold text-ink">{team.name}</span>
                    <span className="text-xs text-ink-muted">{TYPE_LABELS[team.type] ?? team.type}</span>
                    {!team.isActive && (
                      <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-paper-border text-ink-body">
                        Archivée
                      </span>
                    )}
                    {team.fromSuggestion && (
                      <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-paper-subtle text-ink-body">
                        Communauté déclarée
                      </span>
                    )}
                  </div>
                )}

                <p className="text-sm text-ink-muted mt-0.5">
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
                    className="text-ink-muted hover:text-ink"
                  >
                    Renommer
                  </button>
                  {team.isActive ? (
                    <button
                      onClick={() => act(team.id, "archive")}
                      disabled={busy}
                      className="text-ink-muted hover:text-ink disabled:opacity-50"
                    >
                      Archiver
                    </button>
                  ) : (
                    <button
                      onClick={() => act(team.id, "restore")}
                      disabled={busy}
                      className="text-ink-muted hover:text-ink disabled:opacity-50"
                    >
                      Réactiver
                    </button>
                  )}
                  {team.canDelete && (
                    <button
                      onClick={() => setConfirmDelete(team.id)}
                      disabled={busy}
                      className="text-danger hover:underline disabled:opacity-50"
                    >
                      Supprimer
                    </button>
                  )}
                </div>

                {confirmDelete === team.id && (
                  <div className="mt-3 bg-danger/10 border border-danger/30 rounded-lg p-3">
                    <p className="text-sm text-danger">
                      Supprimer « {team.name} » ?{" "}
                      {team.memberCount > 0
                        ? `Ses ${team.memberCount} membre${team.memberCount > 1 ? "s" : ""} se retrouveront sans équipe — ils gardent leur compte et peuvent continuer à envoyer leurs tickets.`
                        : "Elle n'a aucun membre."}
                    </p>
                    <div className="flex gap-2 mt-2">
                      <button
                        onClick={() => act(team.id, "delete")}
                        disabled={busy}
                        className="bg-danger text-white px-3 py-1.5 rounded-lg text-sm font-semibold disabled:opacity-50"
                      >
                        {busy ? "Suppression..." : "Confirmer"}
                      </button>
                      <button onClick={() => setConfirmDelete(null)} className="text-sm text-ink-body px-2">
                        Annuler
                      </button>
                    </div>
                  </div>
                )}

                {open && (
                  <div className="mt-3 border-t border-paper-border pt-3">
                    {team.members.length === 0 ? (
                      <p className="text-sm text-ink-faint">Aucun membre.</p>
                    ) : (
                      <ul className="space-y-1.5">
                        {team.members.map((m) => (
                          <li key={m.userId} className="flex justify-between gap-3 text-sm">
                            <span className="text-ink truncate">{m.name}</span>
                            <span className="text-ink-muted shrink-0">
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
