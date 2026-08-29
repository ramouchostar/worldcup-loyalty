"use client";

import { useState } from "react";
import { Kanban, List } from "lucide-react";
import {
  BACKLOG_AREAS,
  BACKLOG_PEOPLE,
  CLOSED_STATUSES,
  OPEN_STATUSES,
  AREA_LABEL,
  type BacklogItem,
} from "@/lib/backlog-model";
import { addBacklogItem } from "./actions";
import { Avatar, ItemFields, type RestaurantOption } from "./backlog-ui";
import { BacklogList } from "./BacklogList";
import { BacklogKanban } from "./BacklogKanban";

export type { RestaurantOption };

function AddForm({ restaurants }: { restaurants: RestaurantOption[] }) {
  const [open, setOpen] = useState(false);
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

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="w-full bg-brand-red text-white py-2.5 rounded-xl font-semibold text-sm hover:bg-brand-red/85 transition-colors"
      >
        + Ajouter une action
      </button>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5 space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="font-bold text-gray-900">Nouvelle action</h2>
        <button type="button" onClick={() => setOpen(false)} className="text-xs text-gray-400 hover:text-gray-700">
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

// Valeur de filtre pour « non attribuée ». Une chaîne réservée plutôt que ""
// ou null : `owner` est un état de sélection, pas la valeur du champ.
const NO_OWNER = "__aucun__";

function countFor(items: BacklogItem[], person: string): number {
  return items.filter((i) => i.owner === person && OPEN_STATUSES.includes(i.status)).length;
}

// Pastille de filtre. Le compteur affiché est celui des actions ENCORE
// OUVERTES : « Mehdi 3 » doit dire ce qui reste à faire, pas l'historique.
function FilterChip({
  active,
  onClick,
  title,
  children,
}: {
  active: boolean;
  onClick: () => void;
  title?: string;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      aria-pressed={active}
      className={`h-8 inline-flex items-center gap-1.5 px-2.5 rounded-lg text-xs font-semibold transition-colors ${
        active ? "bg-white text-gray-900 shadow-sm" : "text-gray-500 hover:text-gray-900"
      }`}
    >
      {children}
    </button>
  );
}

type View = "liste" | "kanban";

// Deux vues « bloquées » en haut de la page, façon segmented control : la vue
// courante reste visible en permanence pendant qu'on filtre/scrolle en
// dessous, elle ne dépend d'aucun scroll de page (pas de position sticky
// nécessaire — la bascule est toujours la première chose sous le titre).
function ViewSwitcher({ view, onChange }: { view: View; onChange: (v: View) => void }) {
  const base = "h-9 inline-flex items-center gap-1.5 px-3.5 rounded-lg text-xs font-bold transition-colors";
  return (
    <div
      role="tablist"
      aria-label="Vue du backlog"
      className="inline-flex items-center gap-0.5 bg-gray-100 rounded-xl p-1"
    >
      <button
        type="button"
        role="tab"
        aria-selected={view === "liste"}
        onClick={() => onChange("liste")}
        className={`${base} ${view === "liste" ? "bg-white text-gray-900 shadow-sm" : "text-gray-500 hover:text-gray-900"}`}
      >
        <List className="w-3.5 h-3.5" aria-hidden="true" />
        Liste
      </button>
      <button
        type="button"
        role="tab"
        aria-selected={view === "kanban"}
        onClick={() => onChange("kanban")}
        className={`${base} ${view === "kanban" ? "bg-white text-gray-900 shadow-sm" : "text-gray-500 hover:text-gray-900"}`}
      >
        <Kanban className="w-3.5 h-3.5" aria-hidden="true" />
        Kanban
      </button>
    </div>
  );
}

// ADR 0033 §3 — plan d'action partagé entre associés. Liste groupée par état
// et ordonnée par rentabilité (impact ÷ effort), ou même backlog en vue
// Kanban (glisser une carte entre colonnes change son statut). Les deux vues
// partagent les mêmes filtres et la même carte (backlog-ui.tsx).
export function BacklogBoard({
  items,
  restaurants,
}: {
  items: BacklogItem[];
  restaurants: RestaurantOption[];
}) {
  const [area, setArea] = useState<string>("tous");
  const [owner, setOwner] = useState<string>("tous");
  const [view, setView] = useState<View>("liste");

  const restaurantNames = new Map(restaurants.map((r) => [r.id, r.name]));
  // Noms hérités d'avant la liste close : encore filtrables, jamais proposés
  // à l'attribution.
  const legacyOwners = Array.from(
    new Set(
      items
        .map((i) => i.owner)
        .filter((o): o is string => !!o && !BACKLOG_PEOPLE.includes(o as (typeof BACKLOG_PEOPLE)[number]))
    )
  ).sort();

  const visible = items.filter(
    (i) =>
      (area === "tous" || i.area === area) &&
      (owner === "tous" || (owner === NO_OWNER ? !i.owner : i.owner === owner))
  );
  const open = visible.filter((i) => OPEN_STATUSES.includes(i.status));
  const closed = visible.filter((i) => CLOSED_STATUSES.includes(i.status));

  return (
    <div className="space-y-4">
      <AddForm restaurants={restaurants} />

      {items.length > 0 && (
        <>
          <ViewSwitcher view={view} onChange={setView} />

          <div className="flex flex-wrap items-center gap-2">
            {/* « Mes tâches » en premier et en pastilles : c'est le filtre qu'on
                utilise le plus (chacun veut sa liste), il ne doit pas être noyé
                dans un menu déroulant à côté des chantiers. */}
            <div
              className="flex items-center gap-0.5 bg-gray-100 rounded-xl p-1"
              role="group"
              aria-label="Filtrer par personne"
            >
              <FilterChip active={owner === "tous"} onClick={() => setOwner("tous")}>
                Tous
              </FilterChip>
              {BACKLOG_PEOPLE.map((p) => (
                <FilterChip key={p} active={owner === p} onClick={() => setOwner(p)} title={`Tâches de ${p}`}>
                  <Avatar name={p} size={20} />
                  <span className="hidden sm:inline">{p}</span>
                  <span className="text-gray-400 tabular-nums">{countFor(items, p)}</span>
                </FilterChip>
              ))}
              <FilterChip active={owner === NO_OWNER} onClick={() => setOwner(NO_OWNER)} title="Non attribuées">
                Non attribuées
                <span className="text-gray-400 tabular-nums">{items.filter((i) => !i.owner).length}</span>
              </FilterChip>
              {legacyOwners.map((o) => (
                <FilterChip key={o} active={owner === o} onClick={() => setOwner(o)}>
                  {o}
                </FilterChip>
              ))}
            </div>

            <select
              value={area}
              onChange={(e) => setArea(e.target.value)}
              aria-label="Filtrer par chantier"
              className="h-8 text-xs font-semibold text-gray-700 border border-gray-200 rounded-lg pl-2.5 pr-7 bg-white"
            >
              <option value="tous">Tous les chantiers</option>
              {BACKLOG_AREAS.map((a) => (
                <option key={a} value={a}>
                  {AREA_LABEL[a]}
                </option>
              ))}
            </select>

            <span className="text-xs text-gray-400">
              {open.length} en cours · {closed.length} clôturée{closed.length > 1 ? "s" : ""}
            </span>
          </div>
        </>
      )}

      {items.length === 0 ? (
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-8 text-center">
          <p className="text-sm text-gray-500 font-semibold">Le backlog est vide.</p>
          <p className="text-xs text-gray-400 mt-1">
            Note ici tout ce qui doit être décidé ou fait — la liste s&apos;ordonne toute seule
            par rapport impact / effort.
          </p>
        </div>
      ) : view === "kanban" ? (
        <BacklogKanban items={open} restaurants={restaurants} restaurantNames={restaurantNames} />
      ) : (
        <BacklogList open={open} closed={closed} restaurants={restaurants} restaurantNames={restaurantNames} />
      )}
    </div>
  );
}
