"use client";

import { createPortal } from "react-dom";
import { Check, ChevronDown } from "lucide-react";
import { useAnchoredMenu } from "@/components/platform/useAnchoredMenu";

export type PillSelectOption = {
  value: string;
  label: string;
  emoji?: string;
};

// Select personnalisé habillage clair (maquette fournie) — même mécanique de
// portail/positionnement que FlatSelect.tsx (components/platform/), mais
// habillage propre aux formulaires publics (bordures grises, accent
// brand-red déjà utilisé partout sur ce formulaire) plutôt que le panneau
// sombre fixe de la console plateforme.
export function PillSelect({
  value,
  onChange,
  options,
  ariaLabel,
}: {
  value: string;
  onChange: (value: string) => void;
  options: PillSelectOption[];
  ariaLabel?: string;
}) {
  const { open, setOpen, triggerRef } = useAnchoredMenu<HTMLButtonElement>();
  const selected = options.find((o) => o.value === value) ?? null;

  function pick(v: string) {
    onChange(v);
    setOpen(false);
  }

  const rect = open ? triggerRef.current?.getBoundingClientRect() : null;
  const coords = rect && { top: rect.bottom + 6, left: rect.left, width: rect.width };

  return (
    <div className="inline-block w-full">
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen(!open)}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={ariaLabel ?? selected?.label}
        className={`flex w-full items-center justify-between gap-2 rounded-xl border bg-white px-4 py-3 text-sm text-gray-900 transition-colors ${
          open ? "border-brand-red ring-2 ring-brand-red/20" : "border-gray-300 hover:border-gray-400"
        }`}
      >
        <span className="truncate">
          {selected ? (
            <>
              {selected.emoji && <span aria-hidden="true">{selected.emoji} </span>}
              {selected.label}
            </>
          ) : (
            <span className="text-gray-400">Choisir…</span>
          )}
        </span>
        <ChevronDown
          size={16}
          className={`shrink-0 text-gray-400 transition-transform ${open ? "rotate-180" : ""}`}
          aria-hidden="true"
        />
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
              className="fixed z-50 max-h-72 overflow-y-auto rounded-xl border border-gray-100 bg-white p-1.5 shadow-xl"
            >
              {options.map((opt) => {
                const isSelected = opt.value === value;
                return (
                  <button
                    key={opt.value}
                    type="button"
                    role="option"
                    aria-selected={isSelected}
                    onClick={() => pick(opt.value)}
                    className={`flex w-full items-center gap-2 rounded-lg px-3 py-2.5 text-left text-sm transition-colors ${
                      isSelected ? "bg-red-50 font-medium text-brand-red" : "text-gray-700 hover:bg-gray-50"
                    }`}
                  >
                    {opt.emoji && (
                      <span aria-hidden="true" className="shrink-0">
                        {opt.emoji}
                      </span>
                    )}
                    <span className="truncate">{opt.label}</span>
                    {isSelected && <Check size={15} strokeWidth={2.5} className="ml-auto shrink-0" aria-hidden="true" />}
                  </button>
                );
              })}
            </div>
          </>,
          document.body
        )}
    </div>
  );
}
