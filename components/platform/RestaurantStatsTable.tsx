"use client";

import { useState } from "react";
import Link from "next/link";
import type { RestaurantStatRow } from "@/lib/platform-stats";

// Tableau détaillé par établissement — le complément indispensable des
// graphiques : les séries disent la tendance du réseau, ce tableau dit QUEL
// établissement la porte (et lequel décroche).
//
// Le tri est côté client : le réseau tient en mémoire, et un aller-retour
// serveur pour trier une trentaine de lignes serait du gaspillage.

type SortKey = "name" | "members" | "activeMembers30d" | "orders30d" | "orders12m" | "revenue12m" | "activatedAt";

const COLUMNS: { key: SortKey; label: string; numeric: boolean; hint?: string }[] = [
  { key: "name", label: "Établissement", numeric: false },
  { key: "activatedAt", label: "Activé le", numeric: false },
  { key: "members", label: "Membres", numeric: true },
  { key: "activeMembers30d", label: "Actifs 30 j", numeric: true, hint: "membres ayant fait valider un ticket" },
  { key: "orders30d", label: "Tickets 30 j", numeric: true },
  { key: "orders12m", label: "Tickets 12 m", numeric: true },
  { key: "revenue12m", label: "CA 12 m", numeric: true, hint: "somme des tickets validés" },
];

const euro = new Intl.NumberFormat("fr-BE", {
  style: "currency",
  currency: "EUR",
  maximumFractionDigits: 0,
});

function shortDate(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("fr-BE", { month: "short", year: "2-digit" });
}

export function RestaurantStatsTable({ rows }: { rows: RestaurantStatRow[] }) {
  const [sort, setSort] = useState<SortKey>("members");
  const [asc, setAsc] = useState(false);

  const sorted = [...rows].sort((a, b) => {
    const dir = asc ? 1 : -1;
    if (sort === "name") return dir * a.name.localeCompare(b.name);
    if (sort === "activatedAt") return dir * (a.activatedAt ?? "").localeCompare(b.activatedAt ?? "");
    return dir * ((a[sort] as number) - (b[sort] as number));
  });

  function toggle(key: SortKey) {
    if (key === sort) setAsc(!asc);
    else {
      setSort(key);
      setAsc(key === "name");
    }
  }

  if (rows.length === 0) {
    return <p className="text-sm text-gray-400 text-center py-6">Aucun établissement dans ce périmètre.</p>;
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="text-xs text-gray-400 uppercase tracking-wide">
            {COLUMNS.map((c) => (
              <th
                key={c.key}
                scope="col"
                className={`pb-2 pr-3 font-semibold ${c.numeric ? "text-right" : "text-left"}`}
              >
                <button
                  type="button"
                  onClick={() => toggle(c.key)}
                  title={c.hint}
                  className="hover:text-gray-700 transition-colors whitespace-nowrap"
                >
                  {c.label}
                  {sort === c.key && <span aria-hidden="true"> {asc ? "↑" : "↓"}</span>}
                </button>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {sorted.map((r) => (
            <tr key={r.id} className="border-t border-gray-50">
              <td className="py-2.5 pr-3">
                <Link href={`/admin/${r.id}`} className="font-semibold text-gray-900 hover:text-brand-red">
                  {r.name}
                </Link>
                <span className="block text-xs text-gray-400">
                  {r.sector ?? "secteur non renseigné"}
                  {r.status !== "active" && <> · {r.status === "pending" ? "en attente" : "désactivé"}</>}
                  {r.plan !== "gratuit" && <> · {r.plan}</>}
                  {!r.hasOwner && <> · sans restaurateur</>}
                  {r.isDemo && <> · démo</>}
                </span>
              </td>
              <td className="py-2.5 pr-3 text-gray-500 whitespace-nowrap">{shortDate(r.activatedAt)}</td>
              <td className="py-2.5 pr-3 text-right tabular-nums font-semibold text-gray-900">{r.members}</td>
              <td className="py-2.5 pr-3 text-right tabular-nums text-gray-700">{r.activeMembers30d}</td>
              <td className="py-2.5 pr-3 text-right tabular-nums text-gray-700">{r.orders30d}</td>
              <td className="py-2.5 pr-3 text-right tabular-nums text-gray-700">{r.orders12m}</td>
              <td className="py-2.5 text-right tabular-nums text-gray-700">{euro.format(r.revenue12m)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
