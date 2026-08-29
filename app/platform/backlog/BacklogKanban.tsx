"use client";

import { useState } from "react";
import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  closestCorners,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragOverEvent,
} from "@dnd-kit/core";
import { SortableContext, arrayMove, sortableKeyboardCoordinates, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { STATUS_LABEL, sortByPriority, type BacklogItem, type BacklogStatus } from "@/lib/backlog-model";
import { setBacklogStatus } from "./actions";
import { SortableItemCard, type RestaurantOption } from "./backlog-ui";

// Ordre de travail (gauche → droite), distinct de OPEN_ORDER (List.tsx, trié
// par rentabilité) : un Kanban se lit comme un flux, de l'idée jusqu'au
// blocage éventuel — pas par priorité.
const KANBAN_STATUSES: BacklogStatus[] = ["idee", "a_faire", "en_cours", "bloque"];

const DOT_CLS: Record<BacklogStatus, string> = {
  idee: "bg-gray-300",
  a_faire: "bg-blue-400",
  en_cours: "bg-amber-400",
  bloque: "bg-red-400",
  fait: "bg-green-400",
  abandonne: "bg-gray-300",
};

function containerIdFor(id: string): string {
  return `col:${id}`;
}

function statusFromContainerId(id: string): BacklogStatus | null {
  if (!id.startsWith("col:")) return null;
  const status = id.slice(4) as BacklogStatus;
  return KANBAN_STATUSES.includes(status) ? status : null;
}

function Column({
  status,
  ids,
  itemsById,
  restaurants,
  restaurantNames,
}: {
  status: BacklogStatus;
  ids: string[];
  itemsById: Map<string, BacklogItem>;
  restaurants: RestaurantOption[];
  restaurantNames: Map<string, string>;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: containerIdFor(status) });

  return (
    <div className="flex w-[85vw] max-w-sm shrink-0 snap-start flex-col sm:w-80">
      <div className="mb-2 flex items-center gap-2 px-1">
        <span className={`h-2 w-2 rounded-full ${DOT_CLS[status]}`} aria-hidden="true" />
        <h3 className="text-sm font-bold text-gray-800">{STATUS_LABEL[status]}</h3>
        <span className="text-xs text-gray-400">{ids.length}</span>
      </div>
      <div
        ref={setNodeRef}
        className={`flex-1 rounded-2xl border p-2 transition-colors ${
          isOver ? "border-brand-red/40 bg-red-50/40" : "border-transparent bg-gray-100/70"
        }`}
      >
        <SortableContext items={ids} strategy={verticalListSortingStrategy}>
          <div className="min-h-[72px] space-y-2">
            {ids.map((id) => {
              const item = itemsById.get(id);
              if (!item) return null;
              return (
                <SortableItemCard
                  key={id}
                  item={item}
                  restaurants={restaurants}
                  restaurantName={item.restaurant_id ? restaurantNames.get(item.restaurant_id) ?? null : null}
                />
              );
            })}
            {ids.length === 0 && (
              <div className="rounded-xl border border-dashed border-gray-300 py-6 text-center text-xs text-gray-400">
                Rien ici
              </div>
            )}
          </div>
        </SortableContext>
      </div>
    </div>
  );
}

// ADR 0033 §3 — même backlog, vue en flux plutôt qu'en liste groupée : glisser
// une carte d'une colonne à l'autre change son statut (setBacklogStatus,
// l'action serveur existante — aucun nouveau champ). Glisser DANS une colonne
// ne fait que réordonner l'affichage, comme en vue Liste (BacklogList.tsx) :
// la priorité reste calculée, jamais saisie.
export function BacklogKanban({
  items,
  restaurants,
  restaurantNames,
}: {
  items: BacklogItem[];
  restaurants: RestaurantOption[];
  restaurantNames: Map<string, string>;
}) {
  function computeColumns(source: BacklogItem[]): Record<BacklogStatus, string[]> {
    const result = {} as Record<BacklogStatus, string[]>;
    for (const status of KANBAN_STATUSES) {
      result[status] = sortByPriority(source.filter((i) => i.status === status)).map((i) => i.id);
    }
    return result;
  }

  const [columns, setColumns] = useState<Record<BacklogStatus, string[]>>(() => computeColumns(items));

  // Resynchronise sans écraser un tri déjà glissé : un item qui a changé de
  // statut ailleurs (StatusFlip, ✓ Fait) doit changer de colonne, un item
  // encore présent garde sa position manuelle.
  const signature = items.map((i) => `${i.id}:${i.status}`).sort().join(",");
  const [lastSignature, setLastSignature] = useState(signature);
  if (signature !== lastSignature) {
    setLastSignature(signature);
    setColumns((prev) => {
      const computed = computeColumns(items);
      const next = {} as Record<BacklogStatus, string[]>;
      for (const status of KANBAN_STATUSES) {
        const kept = (prev[status] ?? []).filter((id) => computed[status].includes(id));
        const extra = computed[status].filter((id) => !kept.includes(id));
        next[status] = [...kept, ...extra];
      }
      return next;
    });
  }

  const itemsById = new Map(items.map((i) => [i.id, i]));

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  function containerOf(id: string): BacklogStatus | null {
    for (const status of KANBAN_STATUSES) {
      if (columns[status]?.includes(id)) return status;
    }
    return null;
  }

  function targetContainer(overId: string): BacklogStatus | null {
    return statusFromContainerId(overId) ?? containerOf(overId);
  }

  // Déplace la carte entre colonnes DÈS le survol, pour un retour visuel
  // immédiat pendant le glisser — le motif « multi-conteneurs » standard de
  // dnd-kit. onDragEnd (ci-dessous) se charge seul de persister le statut.
  function handleDragOver(e: DragOverEvent) {
    const { active, over } = e;
    if (!over) return;
    const activeId = String(active.id);
    const from = containerOf(activeId);
    const to = targetContainer(String(over.id));
    if (!from || !to || from === to) return;

    setColumns((prev) => {
      const fromIds = prev[from].filter((id) => id !== activeId);
      const overIndex = prev[to].indexOf(String(over.id));
      const toIds = [...prev[to]];
      toIds.splice(overIndex === -1 ? toIds.length : overIndex, 0, activeId);
      return { ...prev, [from]: fromIds, [to]: toIds };
    });
  }

  function handleDragEnd(e: DragEndEvent) {
    const { active, over } = e;
    if (!over) return;
    const activeId = String(active.id);
    const originalStatus = itemsById.get(activeId)?.status ?? null;
    const finalStatus = targetContainer(String(over.id));
    if (!finalStatus) return;

    if (originalStatus && finalStatus !== originalStatus) {
      // Fire-and-forget : l'action serveur revalide la page, qui refera
      // redescendre `items` à jour ; la colonne locale est déjà correcte
      // depuis handleDragOver.
      void setBacklogStatus(activeId, finalStatus);
      return;
    }

    setColumns((prev) => {
      const ids = prev[finalStatus];
      const from = ids.indexOf(activeId);
      const to = ids.indexOf(String(over.id));
      if (from === -1 || to === -1 || from === to) return prev;
      return { ...prev, [finalStatus]: arrayMove(ids, from, to) };
    });
  }

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCorners}
      onDragOver={handleDragOver}
      onDragEnd={handleDragEnd}
    >
      <div className="-mx-4 flex snap-x snap-mandatory gap-3 overflow-x-auto px-4 pb-2 sm:mx-0 sm:px-0">
        {KANBAN_STATUSES.map((status) => (
          <Column
            key={status}
            status={status}
            ids={columns[status] ?? []}
            itemsById={itemsById}
            restaurants={restaurants}
            restaurantNames={restaurantNames}
          />
        ))}
      </div>
    </DndContext>
  );
}
