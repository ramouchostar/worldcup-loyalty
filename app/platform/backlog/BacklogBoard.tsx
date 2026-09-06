"use client";

import { useState } from "react";
import { Kanban, List } from "lucide-react";
import {
  BACKLOG_AREAS,
  BACKLOG_PEOPLE,
  CLOSED_STATUSES,
  OPEN_STATUSES,
  AREA_LABEL,
  sortByPriority,
  type BacklogItem,
} from "@/lib/backlog-model";
import { FlatSelect } from "@/components/platform/FlatSelect";
import { type RestaurantOption } from "./backlog-ui";
import { BacklogSummary, NO_OWNER } from "./BacklogSummary";
import { BacklogList } from "./BacklogList";
import { BacklogKanban } from "./BacklogKanban";

export type { RestaurantOption };

type View = "liste" | "kanban";

// Deux vues « bloquées » en haut de la page, façon segmented control : la vue
// courante reste visible en permanence pendant qu'on filtre/scrolle en
// dessous, elle ne dépend d'aucun scroll de page (pas de position sticky
// nécessaire — la bascule est toujours la première chose sous le résumé).
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

// ADR 0033 §3 — plan d'action partagé entre associés. BacklogSummary porte le
// résumé (comptes, prochaine action, tâches clôturées), en dessous la liste
// groupée par état (rentabilité impact ÷ effort) ou le Kanban — glisser une
// carte entre colonnes change son statut. Les deux vues partagent les mêmes
// filtres et la même carte (backlog-ui.tsx).
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
        .flatMap((i) => i.owners)
        .filter((o) => !BACKLOG_PEOPLE.includes(o as (typeof BACKLOG_PEOPLE)[number]))
    )
  ).sort();

  // Une action co-attribuée apparaît dans le filtre de CHACUNE des personnes
  // concernées : c'est le point de la co-attribution — « mes actions » doit
  // montrer tout ce qui attend un geste de ma part.
  const visible = items.filter(
    (i) =>
      (area === "tous" || i.area === area) &&
      (owner === "tous" || (owner === NO_OWNER ? i.owners.length === 0 : i.owners.includes(owner)))
  );
  const open = visible.filter((i) => OPEN_STATUSES.includes(i.status));
  const closed = visible.filter((i) => CLOSED_STATUSES.includes(i.status));
  const next = sortByPriority(open.filter((i) => i.status !== "bloque"))[0] ?? null;

  return (
    <div className="space-y-4">
      {/* Toujours rendu, backlog vide ou pas : c'est ici que vit le bouton
          « Nouvelle action », seul moyen d'ajouter le tout premier item. Les
          cartes de comptage retombent simplement à 0 tant qu'il n'y a rien. */}
      <BacklogSummary
        items={items}
        closed={closed}
        restaurants={restaurants}
        owner={owner}
        onOwnerChange={setOwner}
        legacyOwners={legacyOwners}
        next={next}
      />

      {items.length > 0 && (
        <div className="flex flex-wrap items-center gap-2">
          <ViewSwitcher view={view} onChange={setView} />

          <FlatSelect
            value={area}
            onChange={setArea}
            ariaLabel="Filtrer par chantier"
            options={[
              { value: "tous", label: "Tous les chantiers" },
              ...BACKLOG_AREAS.map((a) => ({ value: a, label: AREA_LABEL[a] })),
            ]}
            triggerClassName="h-8 inline-flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-2.5 text-xs font-semibold text-gray-700 hover:border-gray-300 transition-colors"
            menuWidth={180}
          />

          <span className="text-xs text-gray-400">
            {open.length} en cours · {closed.length} clôturée{closed.length > 1 ? "s" : ""}
          </span>
        </div>
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
        <BacklogList open={open} restaurants={restaurants} restaurantNames={restaurantNames} />
      )}
    </div>
  );
}
