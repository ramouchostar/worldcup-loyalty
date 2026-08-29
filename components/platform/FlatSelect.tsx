"use client";

import { createPortal } from "react-dom";
import { Check, ChevronDown } from "lucide-react";
import { useAnchoredMenu } from "./useAnchoredMenu";

export type FlatSelectOption = {
  value: string;
  label: string;
  disabled?: boolean;
};

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
}) {
  const { open, setOpen, triggerRef } = useAnchoredMenu<HTMLButtonElement>();
  const selected = options.find((o) => o.value === value) ?? null;

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
        aria-label={ariaLabel}
        className={triggerClassName ?? DEFAULT_TRIGGER_CLS}
      >
        <span className={`truncate ${selected ? "" : "text-gray-400"}`}>
          {selected ? selected.label : placeholder}
        </span>
        <ChevronDown size={15} className="shrink-0 text-gray-400" aria-hidden="true" />
      </button>

      {open &&
        coords &&
        typeof document !== "undefined" &&
        createPortal(
          <>
            <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} aria-hidden="true" />
            <div
              role="listbox"
              style={{ top: coords.top, left: coords.left, width: coords.width }}
              className={
                menuClassName ??
                "fixed z-50 max-h-72 overflow-y-auto rounded-xl border border-white/10 bg-neutral-900 p-1 shadow-xl"
              }
            >
              {options.map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  role="option"
                  aria-selected={opt.value === value}
                  disabled={opt.disabled}
                  onClick={() => !opt.disabled && pick(opt.value)}
                  className={`flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-left text-sm transition-colors ${
                    opt.disabled
                      ? "cursor-not-allowed text-neutral-600"
                      : opt.value === value
                        ? "font-semibold text-white"
                        : "text-neutral-300 hover:bg-white/5"
                  }`}
                >
                  <Check
                    size={15}
                    strokeWidth={2.5}
                    className={`shrink-0 ${opt.value === value ? "text-platform-accent opacity-100" : "opacity-0"}`}
                    aria-hidden="true"
                  />
                  <span className="truncate">{opt.label}</span>
                </button>
              ))}
            </div>
          </>,
          document.body
        )}
    </div>
  );
}
