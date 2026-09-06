"use client";

import { useMemo, useState } from "react";
import { Search } from "lucide-react";

// ADR 0030 §7 — « Membres » : liste nominative complète, réservée au
// super-admin (la plateforme est l'unique responsable de traitement,
// ADR 0025). Le pendant restaurateur (« Mes clients », ClientsTable) reste
// pseudonymisé : ne jamais rapprocher les deux composants.
//
// Déplacé de components/admin/ vers components/platform/ : ce tableau ne
// s'affiche que dans la console plateforme, et il porte désormais l'accent
// réservé à cet espace (tailwind.config.ts, `platform.accent`).

export type MemberStatus = "actif" | "nouveau" | "endormi" | "inactif";

export type MemberRow = {
  name: string;
  email: string | null;
  restaurant: string;
  team: string | null;
  /** Déjà formaté par la page (fr-BE). */
  joined: string;
  orderCount: number;
  lastActivity: string | null;
  /** « iPhone · depuis le 22 août 2026 » si l'app est installée, sinon null. */
  app: string | null;
  status: MemberStatus;
};

// Étiquette + explication : un statut ne se déduit jamais de sa seule couleur.
export const STATUS_META: Record<MemberStatus, { label: string; cls: string; help: string }> = {
  actif: {
    label: "Actif",
    cls: "bg-green-50 text-green-700",
    help: "Au moins un ticket validé dans les 30 derniers jours",
  },
  nouveau: {
    label: "Nouveau",
    cls: "bg-sky-50 text-sky-700",
    help: "Inscrit depuis moins de 15 jours, pas encore de ticket",
  },
  endormi: {
    label: "Endormi",
    cls: "bg-amber-50 text-amber-700",
    help: "A déjà commandé, mais plus rien depuis 30 jours",
  },
  inactif: {
    label: "Inactif",
    cls: "bg-gray-100 text-gray-500",
    help: "Inscrit depuis plus de 15 jours, aucun ticket",
  },
};

const FILTERS: { key: MemberStatus | "tous"; label: string }[] = [
  { key: "tous", label: "Tous" },
  { key: "actif", label: "Actifs" },
  { key: "nouveau", label: "Nouveaux" },
  { key: "endormi", label: "Endormis" },
  { key: "inactif", label: "Inactifs" },
];

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  const first = parts[0][0] ?? "";
  const last = parts.length > 1 ? (parts[parts.length - 1][0] ?? "") : "";
  return (first + last).toUpperCase();
}

function StatusPill({ status }: { status: MemberStatus }) {
  const meta = STATUS_META[status];
  return (
    <span
      className={`inline-flex whitespace-nowrap rounded-md px-2 py-0.5 text-xs font-semibold ${meta.cls}`}
      title={meta.help}
    >
      {meta.label}
    </span>
  );
}

const TH = "pb-2 pr-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-400";

export function MembersTable({ rows }: { rows: MemberRow[] }) {
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<MemberStatus | "tous">("tous");

  const counts = useMemo(() => {
    const c: Record<string, number> = { tous: rows.length, actif: 0, nouveau: 0, endormi: 0, inactif: 0 };
    for (const r of rows) c[r.status] += 1;
    return c;
  }, [rows]);

  const q = query.trim().toLowerCase();
  const filtered = rows.filter((r) => {
    if (status !== "tous" && r.status !== status) return false;
    if (!q) return true;
    return (
      r.name.toLowerCase().includes(q) ||
      (r.email ?? "").toLowerCase().includes(q) ||
      r.restaurant.toLowerCase().includes(q) ||
      (r.team ?? "").toLowerCase().includes(q)
    );
  });

  return (
    <section className="rounded-2xl border border-gray-100 bg-white shadow-sm">
      <div className="flex flex-wrap items-center gap-2 border-b border-gray-100 px-4 py-3">
        <div className="relative min-w-[220px] flex-1">
          <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" aria-hidden="true" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Rechercher par nom, email, resto ou équipe…"
            aria-label="Rechercher un membre"
            className="h-9 w-full rounded-lg border border-gray-200 bg-white pl-9 pr-3 text-sm text-gray-700 placeholder:text-gray-400 focus:border-gray-300 focus:outline-none"
          />
        </div>
        <div className="flex flex-wrap items-center gap-1">
          {FILTERS.map((f) => {
            const on = status === f.key;
            return (
              <button
                key={f.key}
                type="button"
                onClick={() => setStatus(f.key)}
                aria-pressed={on}
                className={`rounded-lg px-2.5 py-1.5 text-xs font-semibold transition-colors ${
                  on ? "bg-gray-900 text-white" : "text-gray-500 hover:bg-gray-100"
                }`}
              >
                {f.label}
                <span className={`ml-1.5 tabular-nums ${on ? "opacity-60" : "text-gray-400"}`}>{counts[f.key]}</span>
              </button>
            );
          })}
        </div>
      </div>

      {filtered.length === 0 ? (
        <p className="py-10 text-center text-sm text-gray-400">
          {rows.length === 0 ? "Aucune adhésion." : "Aucun résultat."}
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100">
                <th className={`${TH} pl-4 pt-3`}>Membre</th>
                <th className={`${TH} pt-3`}>Établissement</th>
                <th className={`${TH} pt-3`}>Équipe</th>
                <th className={`${TH} pt-3`}>App</th>
                <th className={`${TH} pt-3`}>Statut</th>
                <th className={`${TH} pt-3 text-right`}>Inscrit le</th>
                <th className={`${TH} pt-3 text-right`}>Tickets</th>
                <th className={`${TH} pt-3 pr-4 text-right`}>Dernière activité</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((r, i) => (
                <tr
                  key={`${r.email ?? r.name}-${r.restaurant}-${i}`}
                  className="border-b border-gray-50 last:border-0 hover:bg-gray-50/70"
                >
                  <td className="py-2.5 pl-4 pr-3">
                    <div className="flex items-center gap-2.5">
                      <span
                        aria-hidden="true"
                        className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-gray-100 text-[11px] font-bold text-gray-500"
                      >
                        {initials(r.name)}
                      </span>
                      <span className="min-w-0">
                        <span className="block truncate font-medium text-gray-900">{r.name}</span>
                        {r.email && <span className="block truncate text-xs text-gray-400">{r.email}</span>}
                      </span>
                    </div>
                  </td>
                  <td className="py-2.5 pr-3 text-gray-700">{r.restaurant}</td>
                  <td className="py-2.5 pr-3 text-gray-500">{r.team ?? "—"}</td>
                  <td className="whitespace-nowrap py-2.5 pr-3 text-gray-500">
                    {r.app ? <span title={r.app}>📱 {r.app.split(" · ")[0]}</span> : <span className="text-gray-300">—</span>}
                  </td>
                  <td className="py-2.5 pr-3">
                    <StatusPill status={r.status} />
                  </td>
                  <td className="whitespace-nowrap py-2.5 pr-3 text-right tabular-nums text-gray-500">{r.joined}</td>
                  <td className="py-2.5 pr-3 text-right tabular-nums text-gray-700">{r.orderCount}</td>
                  <td className="whitespace-nowrap py-2.5 pr-4 text-right tabular-nums text-gray-500">
                    {r.lastActivity ?? "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <p className="border-t border-gray-100 px-4 py-3 text-xs text-gray-400">
        {filtered.length} adhésion{filtered.length > 1 ? "s" : ""}
        {filtered.length !== rows.length ? ` affichée${filtered.length > 1 ? "s" : ""} sur ${rows.length}` : ""} — un même
        membre apparaît une fois par établissement rejoint. 📱 = app installée (ouverte en mode app au moins une fois
        depuis la mise en place de la mesure). Statuts : {FILTERS.filter((f) => f.key !== "tous").map((f) => STATUS_META[f.key as MemberStatus].label).join(" · ")} —
        passe la souris sur une étiquette pour sa définition.
      </p>
    </section>
  );
}
