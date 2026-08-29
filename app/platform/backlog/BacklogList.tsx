"use client";

import { useState } from "react";
import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import { restrictToParentElement, restrictToVerticalAxis } from "@dnd-kit/modifiers";
import { SortableContext, arrayMove, sortableKeyboardCoordinates, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { STATUS_LABEL, sortByPriority, type BacklogItem, type BacklogStatus } from "@/lib/backlog-model";
import { SortableItemCard, type RestaurantOption } from "./backlog-ui";

// L'ordre d'affichage n'est pas l'ordre du cycle de vie : ce qui est engagé
// passe devant ce qui n'est qu'une idée.
const OPEN_ORDER: BacklogStatus[] = ["en_cours", "a_faire", "bloque", "idee"];

// Une section = un statut. Le tri par défaut reste celui de l'ADR 0033 §3
// (impact ÷ effort, calculé) ; glisser une carte ne fait que réordonner
// l'AFFICHAGE au sein de cette même catégorie pour la session en cours — ça
// ne réécrit pas la priorité, qui reste calculée. Si le backlog évolue
// pendant qu'on glisse (item ajouté/retiré/statut changé ailleurs), l'ordre
// manuel se resynchronise sans effacer le tri déjà posé pour les cartes
// encore présentes.
function StatusSection({
  status,
  items,
  restaurants,
  restaurantNames,
}: {
  status: BacklogStatus;
  items: BacklogItem[];
  restaurants: RestaurantOption[];
  restaurantNames: Map<string, string>;
}) {
  const computedIds = sortByPriority(items).map((i) => i.id);
  const [orderedIds, setOrderedIds] = useState<string[]>(computedIds);

  const signature = computedIds.slice().sort().join(",");
  const [lastSignature, setLastSignature] = useState(signature);
  if (signature !== lastSignature) {
    setLastSignature(signature);
    setOrderedIds((prev) => {
      const known = new Set(computedIds);
      const kept = prev.filter((id) => known.has(id));
      const extra = computedIds.filter((id) => !kept.includes(id));
      return [...kept, ...extra];
    });
  }

  const byId = new Map(items.map((i) => [i.id, i]));
  const ordered = orderedIds.map((id) => byId.get(id)).filter((i): i is BacklogItem => !!i);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  function handleDragEnd(e: DragEndEvent) {
    const { active, over } = e;
    if (!over || active.id === over.id) return;
    setOrderedIds((prev) => {
      const from = prev.indexOf(String(active.id));
      const to = prev.indexOf(String(over.id));
      if (from === -1 || to === -1) return prev;
      return arrayMove(prev, from, to);
    });
  }

  return (
    <section className="bg-white rounded-2xl shadow-sm border border-gray-100 p-4 sm:p-5">
      <h2 className="font-bold text-gray-900 mb-3">
        {STATUS_LABEL[status]}
        <span className="ml-2 text-xs font-normal text-gray-400">{ordered.length}</span>
      </h2>
      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        modifiers={[restrictToVerticalAxis, restrictToParentElement]}
        onDragEnd={handleDragEnd}
      >
        <SortableContext items={orderedIds} strategy={verticalListSortingStrategy}>
          <div className="space-y-3">
            {ordered.map((item) => (
              <SortableItemCard
                key={item.id}
                item={item}
                restaurants={restaurants}
                restaurantName={item.restaurant_id ? restaurantNames.get(item.restaurant_id) ?? null : null}
              />
            ))}
          </div>
        </SortableContext>
      </DndContext>
    </section>
  );
}

// Les tâches clôturées ne sont plus listées ici : BacklogSummary.tsx en
// affiche un carrousel horizontal en haut de page (ADR 0033 §3 — gagner de
// la hauteur d'écran pour cette vue, qui ne montre plus que le travail
// ouvert).
export function BacklogList({
  open,
  restaurants,
  restaurantNames,
}: {
  open: BacklogItem[];
  restaurants: RestaurantOption[];
  restaurantNames: Map<string, string>;
}) {
  return (
    <>
      {OPEN_ORDER.map((status) => {
        const group = open.filter((i) => i.status === status);
        if (group.length === 0) return null;
        return (
          <StatusSection
            key={status}
            status={status}
            items={group}
            restaurants={restaurants}
            restaurantNames={restaurantNames}
          />
        );
      })}

      {open.length === 0 && (
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-8 text-center">
          <p className="text-sm text-gray-500">Rien en cours avec ces filtres.</p>
        </div>
      )}
    </>
  );
}
