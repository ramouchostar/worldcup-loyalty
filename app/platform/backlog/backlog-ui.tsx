"use client";

import { useState } from "react";
import { createPortal } from "react-dom";
import { useFormStatus } from "react-dom";
import Link from "next/link";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Check, GripVertical } from "lucide-react";
import { ConfirmSubmitButton } from "@/components/ConfirmSubmitButton";
import { FlatSelect } from "@/components/platform/FlatSelect";
import { useAnchoredMenu } from "@/components/platform/useAnchoredMenu";
import {
  BACKLOG_AREAS,
  BACKLOG_PEOPLE,
  BACKLOG_STATUSES,
  CLOSED_STATUSES,
  STATUS_LABEL,
  AREA_LABEL,
  personColor,
  personInitials,
  priorityLabel,
  priorityScore,
  type BacklogItem,
  type BacklogStatus,
} from "@/lib/backlog-model";
import {
  editBacklogItem,
  removeBacklogItem,
  setBacklogOwnerFromForm,
  setBacklogStatus,
} from "./actions";

// Composants et gabarits partagés entre la vue Liste (BacklogList.tsx) et la
// vue Kanban (BacklogKanban.tsx) — extraits de l'ancien BacklogBoard.tsx
// monolithique pour que les deux vues affichent exactement la même carte.

export type RestaurantOption = { id: string; name: string };

export const STATUS_CLS: Record<BacklogStatus, string> = {
  idee: "bg-gray-100 text-gray-600",
  a_faire: "bg-blue-100 text-blue-800",
  en_cours: "bg-amber-100 text-amber-800",
  bloque: "bg-red-100 text-red-800",
  fait: "bg-green-100 text-green-800",
  abandonne: "bg-gray-100 text-gray-400",
};

// Couleur de l'étiquette de décision (lib/backlog-model.priorityLabel) — pas
// du score seul : le couple impact/effort qu'elle résume oriente la lecture
// (vert = à faire en premier, rouge = ambigu, ça mérite d'être tranché).
export const PRIORITY_CLS: Record<string, string> = {
  "Coup facile": "bg-good/10 text-good",
  "Gros chantier": "bg-brand-gold/15 text-amber-800",
  "Bouche-trou": "bg-gray-100 text-gray-500",
  "À trancher": "bg-danger/10 text-danger",
};

export const SCALE = [1, 2, 3, 4, 5];

// Gabarit commun de tous les contrôles d'une carte : même hauteur, même rayon,
// même graisse. Avant, chaque bouton portait ses propres paddings et la rangée
// donnait trois tailles différentes côte à côte.
export const CTRL = "h-8 inline-flex items-center gap-1.5 px-3 rounded-lg text-xs font-semibold transition-colors";

export function fmtDate(iso: string | null): string | null {
  if (!iso) return null;
  return new Date(iso).toLocaleDateString("fr-BE", { day: "numeric", month: "short" });
}

export function SubmitButton({ children, className }: { children: React.ReactNode; className: string }) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending} className={`${className} disabled:opacity-50`}>
      {pending ? "…" : children}
    </button>
  );
}

// Pastille d'identité. Les initiales sur fond coloré se reconnaissent d'un coup
// d'œil dans une liste, ce qu'un prénom en texte ne fait pas.
export function Avatar({ name, size = 28 }: { name: string | null; size?: number }) {
  if (!name) {
    return (
      <span
        aria-hidden="true"
        className="inline-grid place-items-center rounded-full border border-dashed border-gray-300 text-gray-400"
        style={{ width: size, height: size, fontSize: size * 0.5, lineHeight: 1 }}
      >
        +
      </span>
    );
  }
  return (
    <span
      aria-hidden="true"
      className="inline-grid place-items-center rounded-full text-white font-bold tracking-tight"
      style={{ width: size, height: size, background: personColor(name), fontSize: size * 0.36 }}
    >
      {personInitials(name)}
    </span>
  );
}

// Attribution en un clic depuis la carte. Même traitement que FlatSelect
// (backlog-ui.tsx) : déclencheur inchangé (avatar sur la carte claire),
// panneau TOUJOURS sombre comme un menu contextuel d'app — coche à gauche de
// l'option active, pas de fond coloré. Porté vers <body> et positionné en
// `fixed` depuis les coordonnées réelles du bouton — jamais un `absolute`
// imbriqué dans la carte : une carte peut vivre dans un conteneur qui défile
// (colonne Kanban), un menu `absolute` classique s'y retrouve coupé par le
// premier ancêtre en overflow ou repositionné par le premier ancêtre
// transformé (dnd-kit applique un `transform` aux cartes en plein
// glisser-déposer), invisible ou mal placé sans qu'on comprenne pourquoi.
// `useAnchoredMenu` (partagé avec FlatSelect) gère le cycle ouvert/fermé —
// scroll, resize, Échap ferment toujours le menu.
export function AssigneePicker({ item }: { item: BacklogItem }) {
  const { open, setOpen, triggerRef } = useAnchoredMenu<HTMLButtonElement>();
  const MENU_WIDTH = 192; // w-48

  async function assign(owner: string) {
    setOpen(false);
    const fd = new FormData();
    fd.set("id", item.id);
    fd.set("owner", owner);
    await setBacklogOwnerFromForm(fd);
  }

  const rect = open ? triggerRef.current?.getBoundingClientRect() : null;
  const coords =
    rect && { top: rect.bottom + 6, left: Math.max(8, Math.min(rect.right - MENU_WIDTH, window.innerWidth - MENU_WIDTH - 8)) };

  return (
    <div className="shrink-0">
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen(!open)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={item.owner ? `Attribué à ${item.owner} — changer` : "Attribuer cette action"}
        title={item.owner ?? "Attribuer"}
        className="rounded-full ring-offset-2 hover:ring-2 hover:ring-gray-300 focus:outline-none focus-visible:ring-2 focus-visible:ring-gray-400 transition"
      >
        <Avatar name={item.owner} />
      </button>

      {open &&
        coords &&
        typeof document !== "undefined" &&
        createPortal(
          <>
            <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} aria-hidden="true" />
            <div
              role="menu"
              style={{ top: coords.top, left: coords.left, width: MENU_WIDTH }}
              className="fixed z-50 rounded-xl border border-white/10 bg-neutral-900 p-1 shadow-xl"
            >
              {BACKLOG_PEOPLE.map((p) => (
                <button
                  key={p}
                  type="button"
                  role="menuitem"
                  onClick={() => assign(p)}
                  className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-sm text-neutral-200 hover:bg-white/5"
                >
                  <Check
                    size={14}
                    strokeWidth={2.5}
                    className={`shrink-0 ${item.owner === p ? "text-platform-accent opacity-100" : "opacity-0"}`}
                    aria-hidden="true"
                  />
                  <Avatar name={p} size={22} />
                  {p}
                </button>
              ))}
              {item.owner && (
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => assign("")}
                  className="mt-1 flex w-full items-center gap-2 rounded-lg border-t border-white/10 px-2 py-1.5 pt-2.5 text-left text-sm text-neutral-400 hover:bg-white/5"
                >
                  <Check size={14} strokeWidth={2.5} className="shrink-0 opacity-0" aria-hidden="true" />
                  <Avatar name={null} size={22} />
                  Personne
                </button>
              )}
            </div>
          </>,
          document.body
        )}
    </div>
  );
}

// Changer d'état est le geste le plus fréquent d'une revue à deux : un clic
// sur une option applique tout de suite (FlatSelect appelle directement
// l'action serveur, pas de bouton "Enregistrer" à part) — le déclencheur
// reprend la couleur du statut choisi (STATUS_CLS) pour rester lisible
// fermé, comme avant.
export function StatusFlip({ item }: { item: BacklogItem }) {
  return (
    <FlatSelect
      value={item.status}
      onChange={(v) => {
        void setBacklogStatus(item.id, v as BacklogStatus);
      }}
      options={BACKLOG_STATUSES.map((s) => ({ value: s, label: STATUS_LABEL[s] }))}
      ariaLabel={`État de « ${item.title} »`}
      align="end"
      triggerClassName={`h-8 inline-flex items-center gap-1 rounded-lg px-2.5 text-xs font-bold transition-opacity hover:opacity-80 ${STATUS_CLS[item.status]}`}
    />
  );
}

// Gabarit du déclencheur FlatSelect quand il remplace un <select> de
// formulaire — même hauteur/bordure que les autres champs (input, textarea)
// juste au-dessus, pour que le formulaire reste visuellement homogène.
const FIELD_SELECT_CLS =
  "mt-0.5 h-9 w-full inline-flex items-center justify-between gap-2 rounded-lg border border-gray-300 bg-white px-2 text-sm text-gray-900 hover:border-gray-400 transition-colors";

export function ItemFields({
  item,
  restaurants,
}: {
  item?: BacklogItem;
  restaurants: RestaurantOption[];
}) {
  // FlatSelect n'est pas un <select> natif : il ne peut pas rester non
  // contrôlé via `defaultValue` (rien ne le lie au DOM du navigateur). Un
  // input caché synchronisé (prop `name`) le fait quand même participer au
  // FormData du formulaire, exactement comme avant.
  const [area, setArea] = useState<string>(item?.area ?? "produit");
  const [status, setStatus] = useState<string>(item?.status ?? "idee");
  const [impact, setImpact] = useState<string>(String(item?.impact ?? 3));
  const [effort, setEffort] = useState<string>(String(item?.effort ?? 3));
  const [owner, setOwner] = useState<string>(item?.owner ?? "");
  const [restaurantId, setRestaurantId] = useState<string>(item?.restaurant_id ?? "");

  return (
    <>
      <input
        name="title"
        required
        defaultValue={item?.title}
        placeholder="Action à mener (ex. « Rappeler les 3 restos de Molenbeek »)"
        className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
      />
      <textarea
        name="details"
        rows={2}
        defaultValue={item?.details ?? ""}
        placeholder="Contexte, décision prise, prochaine étape… (optionnel)"
        className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
      />
      <div className="grid grid-cols-2 gap-2">
        <label className="text-xs text-gray-500">
          Chantier
          <FlatSelect
            name="area"
            value={area}
            onChange={setArea}
            ariaLabel="Chantier"
            options={BACKLOG_AREAS.map((a) => ({ value: a, label: AREA_LABEL[a] }))}
            triggerClassName={FIELD_SELECT_CLS}
          />
        </label>
        <label className="text-xs text-gray-500">
          État
          <FlatSelect
            name="status"
            value={status}
            onChange={setStatus}
            ariaLabel="État"
            options={BACKLOG_STATUSES.map((s) => ({ value: s, label: STATUS_LABEL[s] }))}
            triggerClassName={FIELD_SELECT_CLS}
          />
        </label>
        <label className="text-xs text-gray-500">
          Impact (1–5)
          <FlatSelect
            name="impact"
            value={impact}
            onChange={setImpact}
            ariaLabel="Impact"
            options={SCALE.map((n) => ({ value: String(n), label: String(n) }))}
            triggerClassName={FIELD_SELECT_CLS}
          />
        </label>
        <label className="text-xs text-gray-500">
          Effort (1–5)
          <FlatSelect
            name="effort"
            value={effort}
            onChange={setEffort}
            ariaLabel="Effort"
            options={SCALE.map((n) => ({ value: String(n), label: String(n) }))}
            triggerClassName={FIELD_SELECT_CLS}
          />
        </label>
        <label className="text-xs text-gray-500">
          Qui s&apos;en charge
          <FlatSelect
            name="owner"
            value={owner}
            onChange={setOwner}
            ariaLabel="Qui s'en charge"
            placeholder="— personne —"
            options={[
              { value: "", label: "— personne —" },
              ...BACKLOG_PEOPLE.map((p) => ({ value: p, label: p })),
              // Un nom saisi avant la liste close reste sélectionné et
              // enregistrable — on ne le fait pas disparaître en silence.
              ...(item?.owner && !BACKLOG_PEOPLE.includes(item.owner as (typeof BACKLOG_PEOPLE)[number])
                ? [{ value: item.owner, label: item.owner }]
                : []),
            ]}
            triggerClassName={FIELD_SELECT_CLS}
          />
        </label>
        <label className="text-xs text-gray-500">
          Échéance
          <input
            name="due_date"
            type="date"
            defaultValue={item?.due_date ?? ""}
            className="mt-0.5 w-full border border-gray-300 rounded-lg px-2 py-2 text-sm"
          />
        </label>
      </div>
      <label className="text-xs text-gray-500 block">
        Établissement concerné (optionnel)
        <FlatSelect
          name="restaurant_id"
          value={restaurantId}
          onChange={setRestaurantId}
          ariaLabel="Établissement concerné"
          placeholder="— aucun en particulier —"
          options={[
            { value: "", label: "— aucun en particulier —" },
            ...restaurants.map((r) => ({ value: r.id, label: r.name })),
          ]}
          triggerClassName={FIELD_SELECT_CLS}
        />
      </label>
    </>
  );
}

// Carte d'action — design commun aux deux vues (Liste et Kanban). L'étiquette
// de décision (priorityLabel) est en évidence en haut : c'est elle qui dit
// quoi faire, pas le statut (déjà porté par la section/colonne qui contient
// la carte). `dragHandleProps` est injecté par SortableItemCard ci-dessous ;
// une carte sans ce prop (aucun contexte actuellement, gardé pour réemploi
// futur) reste utilisable sans poignée.
export function ItemCard({
  item,
  restaurants,
  restaurantName,
  dragHandleProps,
}: {
  item: BacklogItem;
  restaurants: RestaurantOption[];
  restaurantName: string | null;
  dragHandleProps?: React.HTMLAttributes<HTMLButtonElement>;
}) {
  const [editing, setEditing] = useState(false);
  const due = fmtDate(item.due_date);
  const overdue =
    item.due_date !== null &&
    !CLOSED_STATUSES.includes(item.status) &&
    item.due_date < new Date().toISOString().slice(0, 10);
  const closed = CLOSED_STATUSES.includes(item.status);
  const label = priorityLabel(item);

  if (editing) {
    return (
      <form
        action={async (formData: FormData) => {
          await editBacklogItem(null, formData);
          setEditing(false);
        }}
        className="border border-platform-accent/40 rounded-2xl p-4 space-y-3 bg-platform-accent/5"
      >
        <input type="hidden" name="id" value={item.id} />
        <ItemFields item={item} restaurants={restaurants} />
        <div className="flex gap-2">
          <SubmitButton className="bg-platform-accent text-brand-dark text-sm font-semibold px-4 py-1.5 rounded-lg hover:bg-platform-accent/85">
            Enregistrer
          </SubmitButton>
          <button
            type="button"
            onClick={() => setEditing(false)}
            className="text-sm font-semibold text-gray-600 px-3 py-1.5 rounded-lg hover:bg-gray-100"
          >
            Annuler
          </button>
        </div>
      </form>
    );
  }

  return (
    <div
      className={`rounded-2xl border bg-white p-4 shadow-sm transition-shadow ${
        overdue ? "border-danger/30 ring-1 ring-danger/15" : "border-gray-200"
      }`}
    >
      <div className="flex items-start gap-2">
        {dragHandleProps && (
          <button
            type="button"
            aria-label={`Réordonner « ${item.title} »`}
            className="-ml-1 mt-0.5 h-7 w-7 shrink-0 touch-none cursor-grab place-items-center rounded-lg text-gray-300 transition-colors hover:bg-gray-50 hover:text-gray-500 active:cursor-grabbing grid"
            {...dragHandleProps}
          >
            <GripVertical className="h-4 w-4" aria-hidden="true" />
          </button>
        )}

        <div className="min-w-0 flex-1">
          <div className="mb-1.5 flex items-center justify-between gap-2">
            <span className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${PRIORITY_CLS[label]}`}>
              {label}
            </span>
            {due && (
              <span className={`shrink-0 text-[11px] font-medium ${overdue ? "text-danger" : "text-gray-400"}`}>
                {overdue ? "en retard · " : ""}
                {due}
              </span>
            )}
          </div>

          <p className={`font-semibold leading-snug ${closed ? "text-gray-400 line-through" : "text-gray-900"}`}>
            {item.title}
          </p>

          {item.details && <p className="mt-1 line-clamp-2 text-sm text-gray-500">{item.details}</p>}

          <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
            <span className="rounded-full bg-gray-100 px-2 py-0.5 text-[11px] font-semibold text-gray-500">
              {AREA_LABEL[item.area]}
            </span>
            <span className="text-[11px] text-gray-400">{priorityScore(item).toFixed(1)} pts</span>
            {restaurantName && (
              <Link
                href={`/admin/${item.restaurant_id}`}
                className="truncate text-[11px] text-gray-400 hover:underline"
              >
                {restaurantName}
              </Link>
            )}
            <span className={`ml-auto shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold ${STATUS_CLS[item.status]}`}>
              {STATUS_LABEL[item.status]}
            </span>
            <AssigneePicker item={item} />
          </div>
        </div>
      </div>

      {/* Barre d'actions : tous les contrôles au même gabarit (CTRL), séparée
          du contenu par un filet — avant, les boutons flottaient sous le texte
          à trois hauteurs différentes. « Supprimer » est repoussé à droite et
          reste discret jusqu'au survol : c'est la seule action irréversible. */}
      <div className="mt-3 flex flex-wrap items-center gap-1.5 border-t border-gray-100 pt-3">
        <StatusFlip item={item} />
        {item.status !== "fait" && (
          <form action={setBacklogStatus.bind(null, item.id, "fait")}>
            <SubmitButton className={`${CTRL} text-green-700 bg-green-50 hover:bg-green-100`}>
              ✓ Fait
            </SubmitButton>
          </form>
        )}
        <button
          type="button"
          onClick={() => setEditing(true)}
          className={`${CTRL} text-gray-700 bg-gray-100 hover:bg-gray-200`}
        >
          Modifier
        </button>
        <form action={removeBacklogItem.bind(null, item.id)} className="ml-auto">
          <ConfirmSubmitButton
            confirmMessage={`Supprimer « ${item.title} » ? L'action disparaît définitivement — préfère « Abandonné » pour garder la trace.`}
            className={`${CTRL} text-gray-400 hover:text-red-700 hover:bg-red-50`}
          >
            Supprimer
          </ConfirmSubmitButton>
        </form>
      </div>
    </div>
  );
}

// Enveloppe dnd-kit de ItemCard : la poignée (icône ⣿) porte seule les
// listeners de drag, jamais la carte entière — sur mobile, une carte
// entièrement draggable entre en conflit avec le défilement de la page et
// avec le tap sur ses propres boutons (Modifier, assigner…).
export function SortableItemCard({
  item,
  restaurants,
  restaurantName,
}: {
  item: BacklogItem;
  restaurants: RestaurantOption[];
  restaurantName: string | null;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: item.id });

  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={isDragging ? "relative z-10 opacity-60" : undefined}
    >
      <ItemCard
        item={item}
        restaurants={restaurants}
        restaurantName={restaurantName}
        dragHandleProps={{ ...attributes, ...listeners } as React.HTMLAttributes<HTMLButtonElement>}
      />
    </div>
  );
}
