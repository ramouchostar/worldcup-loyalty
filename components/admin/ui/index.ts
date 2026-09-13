// Primitives de la console restaurateur (ADR 0054).
//
// Ce fichier est la liste FERMÉE de ce dont une page de la console a besoin.
// Une page qui repose un `text-2xl font-bold text-gray-900` ou un
// `bg-white rounded-2xl shadow-sm border-gray-100` à la main recrée la
// divergence que ce socle vient de refermer — si une primitive manque, on
// l'ajoute ici plutôt que de la réinventer sur place.
//
// Jetons de la console : `ink-*` / `paper-*` pour les neutres,
// `danger` / `warn` / `good` pour les statuts, `brand-*` pour l'accent de
// l'établissement. Jamais de `gray-*` ni de `red-600` en dur.

export { PageHeader } from "./PageHeader";
export { Card, CardRow, SectionLabel } from "./Card";
export { FilterTabs, type FilterTab } from "./FilterTabs";
export { EmptyState } from "./EmptyState";
export { StatTile } from "./StatTile";
export { StatusBadge, type BadgeTone } from "./StatusBadge";
export { Restricted } from "./Restricted";
