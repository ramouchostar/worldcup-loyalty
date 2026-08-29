"use client";

import { useState } from "react";
import { Plus } from "lucide-react";
import {
  BACKLOG_PEOPLE,
  OPEN_STATUSES,
  STATUS_LABEL,
  priorityLabel,
  priorityScore,
  type BacklogItem,
} from "@/lib/backlog-model";
import { Avatar, ItemFields, type RestaurantOption } from "./backlog-ui";
import { addBacklogItem } from "./actions";

// Valeur de filtre pour « non attribuée ». Une chaîne réservée plutôt que ""
// ou null : `owner` est un état de sélection, pas la valeur du champ.
export const NO_OWNER = "__aucun__";

function StatCard({
  label,
  value,
  active,
  onClick,
  avatar,
}: {
  label: string;
  value: number;
  active?: boolean;
  onClick?: () => void;
  avatar?: React.ReactNode;
}) {
  const El = onClick ? "button" : "div";
  return (
    <El
      type={onClick ? "button" : undefined}
      onClick={onClick}
      aria-pressed={onClick ? active : undefined}
      className={`rounded-2xl border px-3.5 py-3 text-left transition-colors ${
        active
          ? "border-brand-red bg-brand-red/5"
          : "border-gray-200 bg-white hover:border-gray-300"
      } ${onClick ? "" : "cursor-default"}`}
    >
      <div className="flex items-center gap-1.5">
        {avatar}
        <p className="text-xs text-gray-400 truncate">{label}</p>
      </div>
      <p className="text-2xl font-bold text-gray-900 mt-0.5 tabular-nums">{value}</p>
    </El>
  );
}

// Bouton compact, pensé pour vivre DANS la grille de cartes — le panneau
// complet (AddFormPanel ci-dessous) ne peut pas partager cette grille : un
// formulaire entier écrasé dans une case de grille serait inutilisable. Les
// deux partagent l'état `open` du parent.
function AddTrigger({ onOpen }: { onOpen: () => void }) {
  return (
    <button
      type="button"
      onClick={onOpen}
      className="rounded-2xl bg-brand-red text-white px-3.5 py-3 flex items-center justify-center gap-1.5 font-semibold text-sm hover:bg-brand-red/85 transition-colors"
    >
      <Plus size={16} strokeWidth={2.5} aria-hidden="true" />
      Nouvelle action
    </button>
  );
}

function AddFormPanel({ restaurants, onClose }: { restaurants: RestaurantOption[]; onClose: () => void }) {
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    setLoading(true);
    setError(null);
    setSuccess(null);
    const res = await addBacklogItem(null, new FormData(form));
    setLoading(false);
    if (res.error) setError(res.error);
    if (res.success) {
      setSuccess(res.success);
      form.reset();
    }
  }

  return (
    <form onSubmit={handleSubmit} className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5 space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="font-bold text-gray-900">Nouvelle action</h2>
        <button type="button" onClick={onClose} className="text-xs text-gray-400 hover:text-gray-700">
          Fermer
        </button>
      </div>

      <ItemFields restaurants={restaurants} />

      {error && <p className="text-sm text-red-600">{error}</p>}
      {success && <p className="text-sm text-green-700">{success}</p>}

      <button
        type="submit"
        disabled={loading}
        className="w-full bg-brand-red text-white py-2.5 rounded-lg font-semibold text-sm hover:bg-brand-red/85 disabled:opacity-50 transition-colors"
      >
        {loading ? "Enregistrement…" : "Ajouter au backlog"}
      </button>
    </form>
  );
}

function fmtDone(iso: string | null): string | null {
  if (!iso) return null;
  return new Date(iso).toLocaleDateString("fr-BE", { day: "numeric", month: "short" });
}

// Rangée qui s'enroule (flex-wrap) plutôt qu'un <details> vertical (ancien
// comportement) ou un scroll latéral (essai précédent, retiré à la demande
// de Mehdi — assez de largeur en desktop pour tout afficher sans défiler) :
// l'historique clôturé se consulte d'un coup d'œil, sur plusieurs lignes si
// besoin, sans manger la hauteur d'écran que réclamerait une liste verticale.
function ClosedTasksGrid({ closed }: { closed: BacklogItem[] }) {
  if (closed.length === 0) return null;
  return (
    <div>
      <p className="text-xs font-bold text-gray-400 uppercase tracking-wide mb-2 px-0.5">
        Clôturées <span className="font-normal normal-case text-gray-400">({closed.length})</span>
      </p>
      <div className="flex flex-wrap gap-2.5">
        {closed.map((item) => (
          <div key={item.id} className="w-52 rounded-xl border border-gray-200 bg-white p-3">
            <div className="flex items-center justify-between gap-2">
              <span className="text-[10px] font-bold uppercase tracking-wide text-gray-400">
                {STATUS_LABEL[item.status]}
              </span>
              {item.done_at && <span className="text-[10px] text-gray-400">{fmtDone(item.done_at)}</span>}
            </div>
            <p className="text-sm font-semibold text-gray-600 line-clamp-2 mt-1">{item.title}</p>
            <div className="flex items-center gap-1.5 mt-2">
              <Avatar name={item.owner} size={16} />
              <span className="text-[11px] text-gray-400 truncate">{item.owner ?? "Non attribuée"}</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ADR 0033 §3 — résumé du backlog : compte les actions en cours et par
// personne (les pastilles de filtre d'avant, agrandies en cartes façon
// tableau de bord), la prochaine action à traiter, et un accès rapide à ce
// qui vient d'être clôturé. Les compteurs portent toujours sur `items` (non
// filtré) : une carte de filtre qui recompterait son propre filtre n'aurait
// plus de sens.
export function BacklogSummary({
  items,
  closed,
  restaurants,
  owner,
  onOwnerChange,
  legacyOwners,
  next,
}: {
  items: BacklogItem[];
  closed: BacklogItem[];
  restaurants: RestaurantOption[];
  owner: string;
  onOwnerChange: (owner: string) => void;
  legacyOwners: string[];
  next: BacklogItem | null;
}) {
  const [addOpen, setAddOpen] = useState(false);

  const inProgress = items.filter((i) => i.status === "en_cours").length;
  const doneCount = items.filter((i) => i.status === "fait").length;
  const unassigned = items.filter((i) => !i.owner && OPEN_STATUSES.includes(i.status)).length;

  function countFor(person: string): number {
    return items.filter((i) => i.owner === person && OPEN_STATUSES.includes(i.status)).length;
  }

  function toggleOwner(value: string) {
    onOwnerChange(owner === value ? "tous" : value);
  }

  return (
    <div className="space-y-3">
      {/* grid, pas un scroll latéral (essai retiré à la demande de Mehdi) :
          2 colonnes sur mobile (plusieurs étages plutôt qu'un défilement au
          doigt), jusqu'à 6 en une seule ligne dès qu'il y a la largeur —
          desktop étant l'usage principal du backlog. */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2.5">
        <StatCard label="En cours" value={inProgress} />
        {BACKLOG_PEOPLE.map((p) => (
          <StatCard
            key={p}
            label={p}
            value={countFor(p)}
            active={owner === p}
            onClick={() => toggleOwner(p)}
            avatar={<Avatar name={p} size={16} />}
          />
        ))}
        <StatCard
          label="Non attribuées"
          value={unassigned}
          active={owner === NO_OWNER}
          onClick={() => toggleOwner(NO_OWNER)}
        />
        <StatCard label="Terminées" value={doneCount} />
        <AddTrigger onOpen={() => setAddOpen(true)} />
      </div>

      {addOpen && <AddFormPanel restaurants={restaurants} onClose={() => setAddOpen(false)} />}

      {legacyOwners.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5 px-0.5">
          <span className="text-[11px] text-gray-400">Autres :</span>
          {legacyOwners.map((o) => (
            <button
              key={o}
              type="button"
              onClick={() => toggleOwner(o)}
              aria-pressed={owner === o}
              className={`text-[11px] font-semibold px-2 py-0.5 rounded-full transition-colors ${
                owner === o ? "bg-brand-red text-white" : "bg-gray-100 text-gray-500 hover:bg-gray-200"
              }`}
            >
              {o}
            </button>
          ))}
        </div>
      )}

      {next && (
        <div className="bg-brand-dark text-white rounded-2xl p-5">
          <p className="text-xs text-brand-gold font-semibold uppercase tracking-wide">Prochaine action</p>
          <p className="font-bold text-lg mt-1">{next.title}</p>
          <p className="text-xs text-gray-400 mt-1">
            {priorityLabel(next)} — impact {next.impact} / effort {next.effort} — score{" "}
            {priorityScore(next).toFixed(1)}
            {next.owner && <> · {next.owner}</>}
          </p>
        </div>
      )}

      <ClosedTasksGrid closed={closed} />
    </div>
  );
}
