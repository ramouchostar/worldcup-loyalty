import Link from "next/link";

// ADR 0084 — la navigation du module Prestataires dans la console plateforme : quatre pages, une seule barre.
const TABS = [
  { key: "prestataires", href: "/platform/prestataires", label: "Prestataires" },
  { key: "missions", href: "/platform/prestataires/missions", label: "Missions" },
  { key: "litiges", href: "/platform/prestataires/litiges", label: "Litiges" },
  { key: "reglages", href: "/platform/prestataires/reglages", label: "Réglages" },
] as const;

export type SubNavKey = (typeof TABS)[number]["key"];

export function SubNav({ active, disputes = 0 }: { active: SubNavKey; disputes?: number }) {
  return (
    <nav aria-label="Module Prestataires" className="flex flex-wrap gap-2">
      {TABS.map((t) => (
        <Link
          key={t.key}
          href={t.href}
          aria-current={t.key === active ? "page" : undefined}
          className={`rounded-lg px-3 py-2 text-sm font-semibold border ${t.key === active ? "bg-gray-900 text-white border-gray-900 dark:bg-white dark:text-gray-900" : "border-gray-300 dark:border-gray-700 text-gray-700 dark:text-gray-200"}`}
        >
          {t.label}
          {t.key === "litiges" && disputes > 0 ? <span className="ml-1.5 rounded-full bg-red-600 text-white text-xs px-1.5 py-0.5">{disputes}</span> : null}
        </Link>
      ))}
    </nav>
  );
}
