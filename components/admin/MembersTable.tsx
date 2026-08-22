"use client";

import { useState } from "react";

export type MemberRow = {
  name: string;
  email: string | null;
  restaurant: string;
  team: string | null;
  joined: string;
  orderCount: number;
  lastActivity: string | null;
  // « iPhone · depuis le 22 août 2026 » si l'app est installée, sinon null
  app: string | null;
};

// ADR 0030 §7 — « Membres » : liste nominative complète, réservée au
// super-admin (la plateforme est l'unique responsable de traitement, ADR 0025).
export function MembersTable({ rows }: { rows: MemberRow[] }) {
  const [query, setQuery] = useState("");

  const q = query.trim().toLowerCase();
  const filtered = q
    ? rows.filter(
        (r) =>
          r.name.toLowerCase().includes(q) ||
          (r.email ?? "").toLowerCase().includes(q) ||
          r.restaurant.toLowerCase().includes(q) ||
          (r.team ?? "").toLowerCase().includes(q)
      )
    : rows;

  return (
    <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5">
      <input
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Rechercher par nom, email, resto ou équipe…"
        className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm mb-4"
      />

      {filtered.length === 0 ? (
        <p className="text-sm text-gray-400 text-center py-6">
          {rows.length === 0 ? "Aucune adhésion." : "Aucun résultat."}
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-gray-400 uppercase tracking-wide">
                <th className="pb-2 pr-3 font-semibold">Membre</th>
                <th className="pb-2 pr-3 font-semibold">Établissement</th>
                <th className="pb-2 pr-3 font-semibold">Équipe</th>
                <th className="pb-2 pr-3 font-semibold">App</th>
                <th className="pb-2 pr-3 font-semibold text-right">Inscrit le</th>
                <th className="pb-2 pr-3 font-semibold text-right">Commandes</th>
                <th className="pb-2 font-semibold text-right">Dernière activité</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((r, i) => (
                <tr key={`${r.email ?? r.name}-${r.restaurant}-${i}`} className="border-t border-gray-50 align-top">
                  <td className="py-2.5 pr-3">
                    <p className="font-medium text-gray-900">{r.name}</p>
                    {r.email && <p className="text-xs text-gray-400">{r.email}</p>}
                  </td>
                  <td className="py-2.5 pr-3 text-gray-700">{r.restaurant}</td>
                  <td className="py-2.5 pr-3 text-gray-500">{r.team ?? "—"}</td>
                  <td className="py-2.5 pr-3 text-gray-500 whitespace-nowrap">
                    {r.app ? <span title={r.app}>📱 {r.app.split(" · ")[0]}</span> : <span className="text-gray-300">—</span>}
                  </td>
                  <td className="py-2.5 pr-3 text-right text-gray-500 whitespace-nowrap">{r.joined}</td>
                  <td className="py-2.5 pr-3 text-right tabular-nums text-gray-700">{r.orderCount}</td>
                  <td className="py-2.5 text-right text-gray-500 whitespace-nowrap">{r.lastActivity ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <p className="text-xs text-gray-400 mt-4">
        {filtered.length} adhésion{filtered.length > 1 ? "s" : ""}
        {q && rows.length !== filtered.length ? ` (sur ${rows.length})` : ""} — un même
        membre apparaît une fois par établissement rejoint. 📱 = app installée (ouverte en mode
        app au moins une fois depuis la mise en place de la mesure).
      </p>
    </div>
  );
}
