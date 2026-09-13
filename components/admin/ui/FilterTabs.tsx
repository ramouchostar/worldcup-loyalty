"use client";

import type { ReactNode } from "react";

// Onglets de filtre avec compteur — Commandes, Cadeaux et Actions en avaient
// trois implémentations quasi identiques, qui divergeaient déjà (l'une posait
// un `bg-red-600` en dur pour l'onglet « Suspectes »).
//
// Le compteur fait partie de l'onglet : sur un écran de comptoir, « En attente
// (0) » et « En attente (14) » ne demandent pas le même geste, et il faut le
// voir sans cliquer.

export type FilterTab<K extends string> = {
  key: K;
  label: ReactNode;
  count?: number;
  /** `danger` : l'onglet qui appelle une décision (tickets suspects). */
  tone?: "default" | "danger";
};

export function FilterTabs<K extends string>({
  tabs,
  value,
  onChange,
  className = "",
}: {
  tabs: readonly FilterTab<K>[];
  value: K;
  onChange: (key: K) => void;
  className?: string;
}) {
  return (
    <div className={`flex gap-2 flex-wrap ${className}`} role="tablist">
      {tabs.map((tab) => {
        const active = value === tab.key;
        // Un onglet `danger` ne crie que s'il a quelque chose à signaler :
        // vide, il reste un onglet ordinaire.
        const alerting = tab.tone === "danger" && (tab.count ?? 0) > 0;
        return (
          <button
            key={tab.key}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onChange(tab.key)}
            className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
              active
                ? alerting
                  ? "bg-danger text-white"
                  : "bg-brand-dark text-white"
                : alerting
                  ? "bg-danger/10 text-danger border border-danger/30 hover:border-danger"
                  : "bg-white text-ink-body border border-paper-border hover:border-ink-faint"
            }`}
          >
            {tab.label}
            {tab.count !== undefined && <span className="ml-1.5 opacity-60">({tab.count})</span>}
          </button>
        );
      })}
    </div>
  );
}
