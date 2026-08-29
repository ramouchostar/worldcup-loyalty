"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Check, ChevronDown, Search, type LucideIcon } from "lucide-react";
import { useAnchoredMenu } from "./useAnchoredMenu";

export type FlatSelectOption = {
  value: string;
  label: string;
  disabled?: boolean;
  /** Icône optionnelle (ex. un statut) — affichée dans le panneau, et dans le
   * déclencheur si `triggerDisplay="icon"`. Couleur pilotée par `iconClassName`. */
  icon?: LucideIcon;
  iconClassName?: string;
};

// Insensible aux accents (« reseau » retrouve « réseau ») — les noms
// d'établissement viennent d'une saisie libre, pas d'une liste normalisée.
function normalize(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

const DEFAULT_TRIGGER_CLS =
  "h-9 inline-flex w-full items-center justify-between gap-2 rounded-lg border border-gray-200 bg-white px-3 text-sm font-medium text-gray-700 hover:border-gray-300 transition-colors";

// Remplace un <select> natif par un menu plat porté vers <body> — inspiré du
// modèle envoyé par Mehdi (menus Figma). Le déclencheur garde l'habillage de
// sa carte (clair aujourd'hui) ; le panneau qui s'ouvre est TOUJOURS sombre,
// comme un menu contextuel d'app (le clic-droit d'un OS reste sombre même
// dans une appli en thème clair) — pas de variante `dark:` conditionnelle,
// juste un choix de présentation fixe pour ce panneau flottant. Positionné
// en `fixed` depuis les coordonnées réelles du bouton — jamais un `absolute`
// imbriqué dans la carte/colonne qui le contient (voir AssigneePicker,
// backlog-ui.tsx : c'était la cause du bug d'attribution invisible/mal
// placée corrigé plus tôt dans le même chantier).
//
// `name` optionnel : posé, un <input type="hidden"> synchronisé permet au
// composant de participer à un <form action={...}> exactement comme un
// select natif (FormData le lit normalement). Omis, c'est un simple contrôle
// contrôlé (value/onChange) pour un filtre client.
export function FlatSelect({
  value,
  onChange,
  options,
  name,
  placeholder = "Choisir…",
  ariaLabel,
  triggerClassName,
  menuClassName,
  align = "start",
  menuWidth = 224,
  triggerDisplay = "label",
  checkPosition = "start",
  searchable = false,
  minSearchChars = 3,
  searchPlaceholder = "Rechercher…",
}: {
  value: string;
  onChange: (value: string) => void;
  options: FlatSelectOption[];
  name?: string;
  placeholder?: string;
  ariaLabel?: string;
  triggerClassName?: string;
  menuClassName?: string;
  align?: "start" | "end";
  /** Largeur du menu en px pour "end" (calage sur le bord droit du déclencheur) — w-56 par défaut. */
  menuWidth?: number;
  /** "icon" : le déclencheur montre l'icône de l'option sélectionnée (option.icon requis) au lieu de son libellé — le nom reste lisible via `title`/`ariaLabel`. */
  triggerDisplay?: "label" | "icon";
  /** Position de la coche dans le panneau — "end" pour un alignement à droite façon liste d'organisations. */
  checkPosition?: "start" | "end";
  /** Ajoute un champ de recherche en tête de panneau — pour une longue liste (ex. tous les établissements). */
  searchable?: boolean;
  /** En dessous de ce nombre de caractères tapés, un indice s'affiche au lieu de filtrer — évite qu'une recherche à 1-2 lettres renvoie encore la moitié de la liste. */
  minSearchChars?: number;
  searchPlaceholder?: string;
}) {
  const { open, setOpen, triggerRef } = useAnchoredMenu<HTMLButtonElement>();
  const selected = options.find((o) => o.value === value) ?? null;
  const [query, setQuery] = useState("");
  const searchRef = useRef<HTMLInputElement>(null);

  // Repart d'une recherche vide à chaque ouverture, et rend le focus au champ
  // sans que l'utilisateur ait à cliquer dedans — c'est la seule chose à
  // faire après avoir cliqué le déclencheur.
  useEffect(() => {
    if (open && searchable) {
      setQuery("");
      const id = requestAnimationFrame(() => searchRef.current?.focus());
      return () => cancelAnimationFrame(id);
    }
  }, [open, searchable]);

  const trimmed = query.trim();
  const belowThreshold = searchable && trimmed.length > 0 && trimmed.length < minSearchChars;
  const visibleOptions =
    searchable && trimmed.length >= minSearchChars
      ? options.filter((o) => normalize(o.label).includes(normalize(trimmed)))
      : options;

  function toggle() {
    if (open) {
      setOpen(false);
      return;
    }
    setOpen(true);
  }

  function pick(v: string) {
    onChange(v);
    setOpen(false);
  }

  const rect = open ? triggerRef.current?.getBoundingClientRect() : null;
  const coords =
    rect &&
    (align === "end"
      ? { top: rect.bottom + 6, left: Math.max(8, rect.right - menuWidth), width: menuWidth }
      : { top: rect.bottom + 6, left: rect.left, width: Math.max(rect.width, menuWidth) });

  return (
    <div className="inline-block w-full">
      {name && <input type="hidden" name={name} value={value} />}
      <button
        ref={triggerRef}
        type="button"
        onClick={toggle}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={ariaLabel ?? selected?.label}
        title={triggerDisplay === "icon" ? selected?.label : undefined}
        className={triggerClassName ?? DEFAULT_TRIGGER_CLS}
      >
        {triggerDisplay === "icon" && selected?.icon ? (
          <selected.icon size={16} className={selected.iconClassName ?? "shrink-0"} aria-hidden="true" />
        ) : (
          <span className={`truncate ${selected ? "" : "text-gray-400"}`}>
            {selected ? selected.label : placeholder}
          </span>
        )}
        <ChevronDown size={15} className="shrink-0 text-gray-400" aria-hidden="true" />
      </button>

      {open &&
        coords &&
        typeof document !== "undefined" &&
        createPortal(
          <>
            <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} aria-hidden="true" />
            <div
              role={searchable ? undefined : "listbox"}
              style={{ top: coords.top, left: coords.left, width: coords.width }}
              className={
                menuClassName ??
                `fixed z-50 rounded-xl border border-white/10 bg-neutral-900 shadow-xl ${
                  searchable ? "flex max-h-80 flex-col" : "max-h-72 overflow-y-auto p-1"
                }`
              }
            >
              {searchable && (
                <div className="flex shrink-0 items-center gap-2 border-b border-white/10 px-2.5 py-2">
                  <Search size={15} className="shrink-0 text-neutral-500" aria-hidden="true" />
                  <input
                    ref={searchRef}
                    type="text"
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder={searchPlaceholder}
                    className="w-full bg-transparent text-sm text-white placeholder:text-neutral-500 focus:outline-none"
                  />
                </div>
              )}
              <div role={searchable ? "listbox" : undefined} className={searchable ? "overflow-y-auto p-1" : undefined}>
                {belowThreshold ? (
                  <p className="px-2.5 py-3 text-xs text-neutral-500">
                    Encore {minSearchChars - trimmed.length} caractère{minSearchChars - trimmed.length > 1 ? "s" : ""}…
                  </p>
                ) : visibleOptions.length === 0 ? (
                  <p className="px-2.5 py-3 text-xs text-neutral-500">Aucun résultat.</p>
                ) : (
                  visibleOptions.map((opt) => {
                    const isSelected = opt.value === value;
                    const Icon = opt.icon;
                    const check = (
                      <Check
                        size={15}
                        strokeWidth={2.5}
                        className={`shrink-0 ${isSelected ? "text-platform-accent opacity-100" : "opacity-0"}`}
                        aria-hidden="true"
                      />
                    );
                    return (
                      <button
                        key={opt.value}
                        type="button"
                        role="option"
                        aria-selected={isSelected}
                        disabled={opt.disabled}
                        onClick={() => !opt.disabled && pick(opt.value)}
                        className={`flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-left text-sm transition-colors ${
                          opt.disabled
                            ? "cursor-not-allowed text-neutral-600"
                            : isSelected
                              ? "font-semibold text-white"
                              : "text-neutral-300 hover:bg-white/5"
                        }`}
                      >
                        {checkPosition === "start" && check}
                        {Icon && (
                          <Icon size={15} className={`shrink-0 ${opt.iconClassName ?? "text-neutral-400"}`} aria-hidden="true" />
                        )}
                        <span className="truncate">{opt.label}</span>
                        {checkPosition === "end" && <span className="ml-auto flex items-center">{check}</span>}
                      </button>
                    );
                  })
                )}
              </div>
            </div>
          </>,
          document.body
        )}
    </div>
  );
}
