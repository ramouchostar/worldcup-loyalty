"use client";

import { useState } from "react";
import { ArrowLeft, Kanban, List } from "lucide-react";
import {
  BACKLOG_AREAS,
  BACKLOG_PEOPLE,
  CLOSED_STATUSES,
  DONE_WINDOWS,
  DONE_WINDOW_LABEL,
  OPEN_STATUSES,
  AREA_LABEL,
  doneWindowRange,
  isBoundedRange,
  matchesDoneWindow,
  sortByPriority,
  type BacklogItem,
  type DayRange,
  type DoneWindow,
} from "@/lib/backlog-model";
import { FlatSelect } from "@/components/platform/FlatSelect";
import { type RestaurantOption } from "./backlog-ui";
import { BacklogSummary, NO_OWNER, type BacklogScope } from "./BacklogSummary";
import { BacklogList, CLOSED_ORDER } from "./BacklogList";
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

const FILTER_CTRL =
  "h-8 inline-flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-2.5 text-xs font-semibold text-gray-700 hover:border-gray-300 transition-colors";

function fmtDay(day: string): string {
  // « T00:00:00 » explicite : `new Date("2026-08-01")` est interprété en UTC et
  // s'affiche le 31 juillet à Bruxelles.
  return new Date(`${day}T00:00:00`).toLocaleDateString("fr-BE", { day: "numeric", month: "short" });
}

/** « du 1 août au 15 août », « depuis le 1 août », « jusqu'au 15 août ». */
function rangeLabel(range: DayRange): string {
  if (range.from && range.to) return `du ${fmtDay(range.from)} au ${fmtDay(range.to)}`;
  if (range.from) return `depuis le ${fmtDay(range.from)}`;
  if (range.to) return `jusqu'au ${fmtDay(range.to)}`;
  return "";
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
  const [scope, setScope] = useState<BacklogScope>("ouvertes");
  const [doneWindow, setDoneWindow] = useState<DoneWindow>("tout");
  const [customRange, setCustomRange] = useState<DayRange>({ from: null, to: null });

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

  // La fenêtre de clôture ne s'applique QU'aux terminées : une date
  // d'achèvement ne veut rien dire pour une action encore ouverte. Bornes
  // calculées à chaque rendu, mais `tout` (le défaut) ne dépend d'aucune date
  // — le premier rendu serveur et le rendu client disent donc la même chose.
  const range = doneWindowRange(doneWindow, customRange);
  const bounded = isBoundedRange(range);
  const closedInWindow = closed.filter((i) => matchesDoneWindow(i, range));
  // Les abandons n'ont pas de date de clôture (lib/backlog.ts n'horodate que
  // « fait ») : ils sortent de toute fenêtre bornée. On l'annonce plutôt que
  // de laisser des actions disparaître sans explication.
  const undated = bounded ? closed.filter((i) => !i.done_at).length : 0;

  const personOptions = [
    { value: "tous", label: "Tout le monde" },
    ...BACKLOG_PEOPLE.map((p) => ({ value: p as string, label: p as string })),
    { value: NO_OWNER, label: "Non attribuée" },
    ...legacyOwners.map((o) => ({ value: o, label: o })),
  ];

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
        scope={scope}
        onScopeChange={setScope}
        legacyOwners={legacyOwners}
        next={next}
      />

      {items.length > 0 && (
        <div className="space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            {/* Pas de bascule Liste/Kanban sur les clôturées : les colonnes du
                Kanban sont les quatre états ouverts, et y glisser une carte
                sert à changer son statut — un Kanban des actions terminées
                n'aurait aucune colonne à afficher. */}
            {scope === "ouvertes" ? (
              <ViewSwitcher view={view} onChange={setView} />
            ) : (
              <button
                type="button"
                onClick={() => setScope("ouvertes")}
                className="h-9 inline-flex items-center gap-1.5 rounded-xl bg-gray-100 px-3.5 text-xs font-bold text-gray-700 hover:bg-gray-200 transition-colors"
              >
                <ArrowLeft className="w-3.5 h-3.5" aria-hidden="true" />
                Actions ouvertes
              </button>
            )}

            <FlatSelect
              value={area}
              onChange={setArea}
              ariaLabel="Filtrer par chantier"
              options={[
                { value: "tous", label: "Tous les chantiers" },
                ...BACKLOG_AREAS.map((a) => ({ value: a, label: AREA_LABEL[a] })),
              ]}
              triggerClassName={FILTER_CTRL}
              menuWidth={180}
            />

            {/* Même état `owner` que les cartes-personnes du résumé : les deux
                contrôles ne peuvent donc jamais se contredire. Le menu, lui,
                atteint aussi les noms hérités, qu'aucune carte ne porte. */}
            <FlatSelect
              value={owner}
              onChange={setOwner}
              ariaLabel="Filtrer par personne"
              options={personOptions}
              triggerClassName={FILTER_CTRL}
              menuWidth={180}
            />

            {scope === "terminees" && (
              <>
                <FlatSelect
                  value={doneWindow}
                  onChange={(v) => setDoneWindow(v as DoneWindow)}
                  ariaLabel="Filtrer par date d'achèvement"
                  options={DONE_WINDOWS.map((w) => ({ value: w, label: DONE_WINDOW_LABEL[w] }))}
                  triggerClassName={FILTER_CTRL}
                  menuWidth={200}
                />

                {/* Bornes libres : une seule des deux suffit (« depuis le 1er
                    août »). `max`/`min` croisés empêchent nativement de choisir
                    une période inversée. */}
                {doneWindow === "precise" && (
                  <span className="inline-flex items-center gap-1.5">
                    <label className="text-xs text-gray-400" htmlFor="done-from">
                      du
                    </label>
                    <input
                      id="done-from"
                      type="date"
                      value={customRange.from ?? ""}
                      max={customRange.to ?? undefined}
                      onChange={(e) => setCustomRange((r) => ({ ...r, from: e.target.value || null }))}
                      className="h-8 rounded-lg border border-gray-200 bg-white px-2 text-xs font-semibold text-gray-700 hover:border-gray-300 transition-colors"
                    />
                    <label className="text-xs text-gray-400" htmlFor="done-to">
                      au
                    </label>
                    <input
                      id="done-to"
                      type="date"
                      value={customRange.to ?? ""}
                      min={customRange.from ?? undefined}
                      onChange={(e) => setCustomRange((r) => ({ ...r, to: e.target.value || null }))}
                      className="h-8 rounded-lg border border-gray-200 bg-white px-2 text-xs font-semibold text-gray-700 hover:border-gray-300 transition-colors"
                    />
                  </span>
                )}
              </>
            )}
          </div>

          <p className="text-xs text-gray-400 px-0.5">
            {scope === "terminees" ? (
              <>
                {bounded ? `Clôturées ${rangeLabel(range)}` : "Tour des clôturées"} —{" "}
                {closedInWindow.length} action{closedInWindow.length > 1 ? "s" : ""}
                {undated > 0 && (
                  <> · {undated} sans date d&apos;achèvement, hors période</>
                )}{" "}
                · {open.length} encore ouverte{open.length > 1 ? "s" : ""}
              </>
            ) : (
              <>
                {open.length} en cours · {closed.length} clôturée{closed.length > 1 ? "s" : ""}
              </>
            )}
          </p>
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
      ) : scope === "terminees" ? (
        <BacklogList
          items={closedInWindow}
          order={CLOSED_ORDER}
          emptyLabel={
            bounded
              ? `Aucune action clôturée ${rangeLabel(range)} avec ces filtres.`
              : "Aucune action clôturée avec ces filtres."
          }
          restaurants={restaurants}
          restaurantNames={restaurantNames}
        />
      ) : view === "kanban" ? (
        <BacklogKanban items={open} restaurants={restaurants} restaurantNames={restaurantNames} />
      ) : (
        <BacklogList items={open} restaurants={restaurants} restaurantNames={restaurantNames} />
      )}
    </div>
  );
}
