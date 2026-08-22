"use client";

import { useState } from "react";

export type ClientRow = {
  name: string;
  team: string | null;
  orderCount: number;
  totalSpent: number;
  lastVisit: string | null; // déjà formatée côté serveur
  appInstalled: boolean;     // a ouvert l'app en mode installé (complément ADR 0038)
};

// ADR 0030 §7 — « Mes clients » : liste d'activité PSEUDONYMISÉE pour le
// restaurateur. Jamais d'email/téléphone, jamais d'export (ADR 0025 — le
// resto agit via le ciblage broadcast, il ne possède pas le fichier client).
export function ClientsTable({ rows }: { rows: ClientRow[] }) {
  const [query, setQuery] = useState("");

  const q = query.trim().toLowerCase();
  const filtered = q
    ? rows.filter(
        (r) => r.name.toLowerCase().includes(q) || (r.team ?? "").toLowerCase().includes(q)
      )
    : rows;

  return (
    <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5">
      <input
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Rechercher un client ou une équipe…"
        className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm mb-4"
      />

      {filtered.length === 0 ? (
        <p className="text-sm text-gray-400 text-center py-6">
          {rows.length === 0 ? "Aucun client inscrit pour l'instant." : "Aucun résultat."}
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-gray-400 uppercase tracking-wide">
                <th className="pb-2 pr-3 font-semibold">Client</th>
                <th className="pb-2 pr-3 font-semibold">Équipe</th>
                <th className="pb-2 pr-3 font-semibold text-right">Commandes</th>
                <th className="pb-2 pr-3 font-semibold text-right">Dépense</th>
                <th className="pb-2 font-semibold text-right">Dernière visite</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((r, i) => (
                <tr key={`${r.name}-${i}`} className="border-t border-gray-50">
                  <td className="py-2.5 pr-3 font-medium text-gray-900">
                    {r.name}
                    {r.appInstalled && (
                      <span className="ml-1.5 text-xs" title="A installé l'app sur son téléphone">📱</span>
                    )}
                  </td>
                  <td className="py-2.5 pr-3 text-gray-500">{r.team ?? "—"}</td>
                  <td className="py-2.5 pr-3 text-right tabular-nums text-gray-700">{r.orderCount}</td>
                  <td className="py-2.5 pr-3 text-right tabular-nums text-gray-700">
                    €{r.totalSpent.toLocaleString("fr-BE", { maximumFractionDigits: 0 })}
                  </td>
                  <td className="py-2.5 text-right text-gray-500">{r.lastVisit ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <p className="text-xs text-gray-400 mt-4">
        {filtered.length} client{filtered.length > 1 ? "s" : ""}
        {q && rows.length !== filtered.length ? ` (sur ${rows.length})` : ""} · Pour les
        contacter, utilise les <strong>Broadcasts</strong> — la plateforme s&apos;occupe de
        l&apos;envoi.
      </p>
    </div>
  );
}
