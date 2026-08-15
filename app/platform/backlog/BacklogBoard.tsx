"use client";

import { useState } from "react";
import { useFormStatus } from "react-dom";
import Link from "next/link";
import { ConfirmSubmitButton } from "@/components/ConfirmSubmitButton";
import {
  BACKLOG_AREAS,
  BACKLOG_PEOPLE,
  BACKLOG_STATUSES,
  OPEN_STATUSES,
  CLOSED_STATUSES,
  STATUS_LABEL,
  AREA_LABEL,
  personColor,
  personInitials,
  priorityLabel,
  priorityScore,
  sortByPriority,
  type BacklogItem,
  type BacklogStatus,
} from "@/lib/backlog-model";
import {
  addBacklogItem,
  editBacklogItem,
  removeBacklogItem,
  setBacklogOwnerFromForm,
  setBacklogStatus,
  setBacklogStatusFromForm,
} from "./actions";

export type RestaurantOption = { id: string; name: string };

const STATUS_CLS: Record<BacklogStatus, string> = {
  idee: "bg-gray-100 text-gray-600",
  a_faire: "bg-blue-100 text-blue-800",
  en_cours: "bg-amber-100 text-amber-800",
  bloque: "bg-red-100 text-red-800",
  fait: "bg-green-100 text-green-800",
  abandonne: "bg-gray-100 text-gray-400",
};

// L'ordre d'affichage n'est pas l'ordre du cycle de vie : ce qui est engagé
// passe devant ce qui n'est qu'une idée.
const OPEN_ORDER: BacklogStatus[] = ["en_cours", "a_faire", "bloque", "idee"];

const SCALE = [1, 2, 3, 4, 5];

// Gabarit commun de tous les contrôles d'une carte : même hauteur, même rayon,
// même graisse. Avant, chaque bouton portait ses propres paddings et la rangée
// donnait trois tailles différentes côte à côte.
const CTRL = "h-8 inline-flex items-center gap-1.5 px-3 rounded-lg text-xs font-semibold transition-colors";

function fmtDate(iso: string | null): string | null {
  if (!iso) return null;
  return new Date(iso).toLocaleDateString("fr-BE", { day: "numeric", month: "short" });
}

function SubmitButton({ children, className }: { children: React.ReactNode; className: string }) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending} className={`${className} disabled:opacity-50`}>
      {pending ? "…" : children}
    </button>
  );
}

// Pastille d'identité. Les initiales sur fond coloré se reconnaissent d'un coup
// d'œil dans une liste, ce qu'un prénom en texte ne fait pas.
function Avatar({ name, size = 28 }: { name: string | null; size?: number }) {
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

// Attribution en un clic depuis la carte. Le panneau se ferme sur un clic
// n'importe où ailleurs (calque transparent) — sans ça, ouvrir deux cartes
// laisse deux menus ouverts en même temps.
function AssigneePicker({ item }: { item: BacklogItem }) {
  const [open, setOpen] = useState(false);

  return (
    <div className="relative shrink-0">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={item.owner ? `Attribué à ${item.owner} — changer` : "Attribuer cette action"}
        title={item.owner ?? "Attribuer"}
        className="rounded-full ring-offset-2 hover:ring-2 hover:ring-gray-300 focus:outline-none focus-visible:ring-2 focus-visible:ring-gray-400 transition"
      >
        <Avatar name={item.owner} />
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-20" onClick={() => setOpen(false)} aria-hidden="true" />
          <div
            role="menu"
            className="absolute right-0 top-10 z-30 w-48 bg-white rounded-xl shadow-lg border border-gray-200 p-1"
          >
            {BACKLOG_PEOPLE.map((p) => (
              <form key={p} action={setBacklogOwnerFromForm}>
                <input type="hidden" name="id" value={item.id} />
                <input type="hidden" name="owner" value={p} />
                <button
                  type="submit"
                  role="menuitem"
                  onClick={() => setOpen(false)}
                  className="w-full flex items-center gap-2 px-2 py-1.5 rounded-lg text-sm text-gray-800 hover:bg-gray-100"
                >
                  <Avatar name={p} size={22} />
                  {p}
                  {item.owner === p && <span className="ml-auto text-gray-400">✓</span>}
                </button>
              </form>
            ))}
            {item.owner && (
              <form action={setBacklogOwnerFromForm}>
                <input type="hidden" name="id" value={item.id} />
                <input type="hidden" name="owner" value="" />
                <button
                  type="submit"
                  role="menuitem"
                  onClick={() => setOpen(false)}
                  className="w-full flex items-center gap-2 px-2 py-1.5 rounded-lg text-sm text-gray-500 hover:bg-gray-100 border-t border-gray-100 mt-1 pt-2"
                >
                  <Avatar name={null} size={22} />
                  Personne
                </button>
              </form>
            )}
          </div>
        </>
      )}
    </div>
  );
}

// Même motif contrôlé que PlanFlipForm (/platform) : React 19 réinitialise les
// champs non contrôlés d'un <form action={…}> dès que l'action se termine, et
// un <select> en defaultValue retomberait visuellement sur sa valeur d'origine
// juste après l'enregistrement.
function StatusFlip({ item }: { item: BacklogItem }) {
  const [value, setValue] = useState<BacklogStatus>(item.status);
  const [serverValue, setServerValue] = useState<BacklogStatus>(item.status);
  if (serverValue !== item.status) {
    setServerValue(item.status);
    setValue(item.status);
  }

  return (
    <form action={setBacklogStatusFromForm} className="flex items-center gap-1">
      <input type="hidden" name="id" value={item.id} />
      <select
        name="status"
        value={value}
        onChange={(e) => setValue(e.target.value as BacklogStatus)}
        aria-label={`État de « ${item.title} »`}
        className="h-8 text-xs font-semibold text-gray-700 border border-gray-200 rounded-lg pl-2.5 pr-7 bg-white hover:bg-gray-50 transition-colors"
      >
        {BACKLOG_STATUSES.map((s) => (
          <option key={s} value={s}>
            {STATUS_LABEL[s]}
          </option>
        ))}
      </select>
      {value !== item.status && (
        <SubmitButton className={`${CTRL} text-white bg-gray-900 hover:bg-gray-700`}>
          Enregistrer
        </SubmitButton>
      )}
    </form>
  );
}

function ItemFields({
  item,
  restaurants,
}: {
  item?: BacklogItem;
  restaurants: RestaurantOption[];
}) {
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
          <select
            name="area"
            defaultValue={item?.area ?? "produit"}
            className="mt-0.5 w-full border border-gray-300 rounded-lg px-2 py-2 text-sm bg-white"
          >
            {BACKLOG_AREAS.map((a) => (
              <option key={a} value={a}>
                {AREA_LABEL[a]}
              </option>
            ))}
          </select>
        </label>
        <label className="text-xs text-gray-500">
          État
          <select
            name="status"
            defaultValue={item?.status ?? "idee"}
            className="mt-0.5 w-full border border-gray-300 rounded-lg px-2 py-2 text-sm bg-white"
          >
            {BACKLOG_STATUSES.map((s) => (
              <option key={s} value={s}>
                {STATUS_LABEL[s]}
              </option>
            ))}
          </select>
        </label>
        <label className="text-xs text-gray-500">
          Impact (1–5)
          <select
            name="impact"
            defaultValue={item?.impact ?? 3}
            className="mt-0.5 w-full border border-gray-300 rounded-lg px-2 py-2 text-sm bg-white"
          >
            {SCALE.map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>
        </label>
        <label className="text-xs text-gray-500">
          Effort (1–5)
          <select
            name="effort"
            defaultValue={item?.effort ?? 3}
            className="mt-0.5 w-full border border-gray-300 rounded-lg px-2 py-2 text-sm bg-white"
          >
            {SCALE.map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>
        </label>
        <label className="text-xs text-gray-500">
          Qui s&apos;en charge
          <select
            name="owner"
            defaultValue={item?.owner ?? ""}
            className="mt-0.5 w-full border border-gray-300 rounded-lg px-2 py-2 text-sm bg-white"
          >
            <option value="">— personne —</option>
            {BACKLOG_PEOPLE.map((p) => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
            {/* Un nom saisi avant la liste close reste sélectionné et
                enregistrable — on ne le fait pas disparaître en silence. */}
            {item?.owner && !BACKLOG_PEOPLE.includes(item.owner as (typeof BACKLOG_PEOPLE)[number]) && (
              <option value={item.owner}>{item.owner}</option>
            )}
          </select>
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
        <select
          name="restaurant_id"
          defaultValue={item?.restaurant_id ?? ""}
          className="mt-0.5 w-full border border-gray-300 rounded-lg px-2 py-2 text-sm bg-white"
        >
          <option value="">— aucun en particulier —</option>
          {restaurants.map((r) => (
            <option key={r.id} value={r.id}>
              {r.name}
            </option>
          ))}
        </select>
      </label>
    </>
  );
}

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

function ItemCard({
  item,
  restaurants,
  restaurantName,
}: {
  item: BacklogItem;
  restaurants: RestaurantOption[];
  restaurantName: string | null;
}) {
  const [editing, setEditing] = useState(false);
  const due = fmtDate(item.due_date);
  const overdue =
    item.due_date !== null &&
    !CLOSED_STATUSES.includes(item.status) &&
    item.due_date < new Date().toISOString().slice(0, 10);

  if (editing) {
    return (
      <form
        action={async (formData: FormData) => {
          await editBacklogItem(null, formData);
          setEditing(false);
        }}
        className="border border-brand-red/30 rounded-xl p-4 space-y-3 bg-red-50/30"
      >
        <input type="hidden" name="id" value={item.id} />
        <ItemFields item={item} restaurants={restaurants} />
        <div className="flex gap-2">
          <SubmitButton className="bg-brand-red text-white text-sm font-semibold px-4 py-1.5 rounded-lg hover:bg-brand-red/85">
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
    <div className="border border-gray-200 rounded-xl p-4">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className={`font-semibold ${CLOSED_STATUSES.includes(item.status) ? "text-gray-400 line-through" : "text-gray-900"}`}>
            {item.title}
          </p>
          <p className="text-xs text-gray-400 mt-0.5 flex flex-wrap gap-x-2">
            <span>{AREA_LABEL[item.area]}</span>
            <span>· {priorityLabel(item)} ({priorityScore(item).toFixed(1)})</span>
            <span>· impact {item.impact} / effort {item.effort}</span>
            {/* Le porteur n'est plus répété ici : la pastille en haut à droite
                le dit, et le répéter en texte gris allongeait la ligne de méta
                sans rien ajouter. */}
            {due && (
              <span className={overdue ? "text-danger font-semibold" : undefined}>
                · {overdue ? "en retard depuis" : "pour"} le {due}
              </span>
            )}
            {restaurantName && (
              <Link href={`/admin/${item.restaurant_id}`} className="hover:underline">
                · {restaurantName}
              </Link>
            )}
          </p>
        </div>
        <div className="shrink-0 flex items-center gap-2">
          <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${STATUS_CLS[item.status]}`}>
            {STATUS_LABEL[item.status]}
          </span>
          <AssigneePicker item={item} />
        </div>
      </div>

      {item.details && <p className="text-sm text-gray-600 mt-2 whitespace-pre-line">{item.details}</p>}

      {/* Barre d'actions : tous les contrôles au même gabarit (CTRL), séparée
          du contenu par un filet — avant, les boutons flottaient sous le texte
          à trois hauteurs différentes. « Supprimer » est repoussé à droite et
          reste discret jusqu'au survol : c'est la seule action irréversible. */}
      <div className="flex flex-wrap items-center gap-1.5 mt-3 pt-3 border-t border-gray-100">
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

// ADR 0033 §3 — plan d'action partagé entre associés. Une seule liste, groupée
// par état et ordonnée par rentabilité (impact ÷ effort) : on ouvre la page et
// la première ligne est ce qu'il faut faire ensuite.
export function BacklogBoard({
  items,
  restaurants,
}: {
  items: BacklogItem[];
  restaurants: RestaurantOption[];
}) {
  const [area, setArea] = useState<string>("tous");
  const [owner, setOwner] = useState<string>("tous");

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
      )}

      {items.length === 0 ? (
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-8 text-center">
          <p className="text-sm text-gray-500 font-semibold">Le backlog est vide.</p>
          <p className="text-xs text-gray-400 mt-1">
            Note ici tout ce qui doit être décidé ou fait — la liste s&apos;ordonne toute seule
            par rapport impact / effort.
          </p>
        </div>
      ) : (
        <>
          {OPEN_ORDER.map((status) => {
            const group = sortByPriority(open.filter((i) => i.status === status));
            if (group.length === 0) return null;
            return (
              <section key={status} className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5">
                <h2 className="font-bold text-gray-900 mb-3">
                  {STATUS_LABEL[status]}
                  <span className="ml-2 text-xs font-normal text-gray-400">{group.length}</span>
                </h2>
                <div className="space-y-3">
                  {group.map((item) => (
                    <ItemCard
                      key={item.id}
                      item={item}
                      restaurants={restaurants}
                      restaurantName={item.restaurant_id ? restaurantNames.get(item.restaurant_id) ?? null : null}
                    />
                  ))}
                </div>
              </section>
            );
          })}

          {open.length === 0 && (
            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-8 text-center">
              <p className="text-sm text-gray-500">Rien en cours avec ces filtres.</p>
            </div>
          )}

          {closed.length > 0 && (
            <details className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5">
              <summary className="font-bold text-gray-900 cursor-pointer">
                Clôturées
                <span className="ml-2 text-xs font-normal text-gray-400">{closed.length}</span>
              </summary>
              <div className="space-y-3 mt-3">
                {closed.map((item) => (
                  <ItemCard
                    key={item.id}
                    item={item}
                    restaurants={restaurants}
                    restaurantName={item.restaurant_id ? restaurantNames.get(item.restaurant_id) ?? null : null}
                  />
                ))}
              </div>
            </details>
          )}
        </>
      )}
    </div>
  );
}
