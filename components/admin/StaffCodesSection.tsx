"use client";

import { useState } from "react";
import { readJsonSafe, describeHttpFailure } from "@/lib/fetch-json";
import type { StaffStats } from "@/lib/staff-codes";

// ADR 0053 — « Équipe en salle » : qui apporte des clients, prénom par prénom.
// Caissier ou serveur : AUCUNE distinction de poste (décision du porteur) —
// juste le prénom. Le badge de chacun est une page publique à envoyer par
// WhatsApp : il l'affiche depuis son téléphone ou l'imprime au format carte.
export function StaffCodesSection({
  restaurantId,
  initialStats,
  migrationMissing,
}: {
  restaurantId: string;
  initialStats: StaffStats[];
  migrationMissing: boolean;
}) {
  const [stats, setStats] = useState<StaffStats[]>(initialStats);
  const [label, setLabel] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  if (migrationMissing) {
    return (
      <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 text-sm text-amber-900">
        La mesure « Équipe en salle » attend la migration{" "}
        <code className="bg-amber-100 px-1 rounded">20260910-1430-codes-personnel-salle.sql</code>{" "}
        (éditeur SQL Supabase). Rien d&apos;autre n&apos;est bloqué.
      </div>
    );
  }

  async function creer(e: React.FormEvent) {
    e.preventDefault();
    if (!label.trim() || busy) return;
    setBusy(true);
    setError(null);
    const res = await fetch("/api/admin/staff-codes", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ restaurantId, label: label.trim() }),
    });
    const { data } = await readJsonSafe<{ id: string; code: string; label: string; error?: string }>(res);
    if (res.status === 201 && data) {
      setStats((s) => [
        ...s,
        { id: data.id, code: data.code, label: data.label, isActive: true, landings30d: 0, signupsTotal: 0, signups30d: 0, withTicket: 0 },
      ]);
      setLabel("");
    } else {
      setError(describeHttpFailure(res.status, data?.error));
    }
    setBusy(false);
  }

  async function basculer(codeId: string, isActive: boolean) {
    const res = await fetch("/api/admin/staff-codes", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ restaurantId, codeId, isActive }),
    });
    if (res.ok) {
      setStats((s) => s.map((c) => (c.id === codeId ? { ...c, isActive } : c)));
    }
  }

  async function copierBadge(id: string, code: string) {
    try {
      await navigator.clipboard.writeText(`${window.location.origin}/badge/${code}`);
      setCopiedId(id);
      setTimeout(() => setCopiedId(null), 2000);
    } catch {}
  }

  return (
    <div className="space-y-3">
      {stats.length > 0 && (
        <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-left text-[11px] uppercase tracking-wide text-gray-500">
              <tr>
                <th className="px-4 py-2">Prénom</th>
                <th className="px-2 py-2 text-right" title="Arrivées sur ta page via son QR, 30 derniers jours">Arrivées 30 j</th>
                <th className="px-2 py-2 text-right">Inscrits</th>
                <th className="px-2 py-2 text-right" title="Parmi ses inscrits, combien ont envoyé au moins un ticket validé">Dont 1 ticket ✓</th>
                <th className="px-4 py-2 text-right">Badge</th>
              </tr>
            </thead>
            <tbody>
              {stats.map((c) => (
                <tr key={c.id} className={`border-t border-gray-100 ${c.isActive ? "" : "opacity-50"}`}>
                  <td className="px-4 py-2.5 font-semibold text-gray-900">
                    {c.label}
                    {!c.isActive && <span className="ml-2 text-[11px] text-gray-400 font-normal">désactivé</span>}
                  </td>
                  <td className="px-2 py-2.5 text-right tabular-nums">{c.landings30d}</td>
                  <td className="px-2 py-2.5 text-right tabular-nums font-bold">
                    {c.signupsTotal}
                    {c.signups30d > 0 && c.signups30d !== c.signupsTotal && (
                      <span className="text-[11px] text-gray-400 font-normal"> ({c.signups30d} / 30 j)</span>
                    )}
                  </td>
                  <td className="px-2 py-2.5 text-right tabular-nums">{c.withTicket}</td>
                  <td className="px-4 py-2.5 text-right whitespace-nowrap">
                    <a
                      href={`/badge/${c.code}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-brand-red font-semibold text-xs hover:underline"
                    >
                      Voir
                    </a>
                    <button
                      type="button"
                      onClick={() => void copierBadge(c.id, c.code)}
                      className="ml-2 text-xs font-semibold text-gray-600 hover:text-gray-900"
                    >
                      {copiedId === c.id ? "✓ Copié" : "Copier le lien"}
                    </button>
                    <button
                      type="button"
                      onClick={() => void basculer(c.id, !c.isActive)}
                      className="ml-2 text-xs text-gray-400 hover:text-gray-700"
                    >
                      {c.isActive ? "Désactiver" : "Réactiver"}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <form onSubmit={creer} className="flex gap-2">
        <input
          type="text"
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          placeholder="Prénom (ex. Sofia)"
          maxLength={40}
          className="flex-1 border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-brand-red"
        />
        <button
          type="submit"
          disabled={busy || !label.trim()}
          className="bg-brand-dark text-white text-sm font-bold px-4 py-2 rounded-xl hover:opacity-90 disabled:opacity-50 transition-opacity"
        >
          {busy ? "…" : "Créer son QR"}
        </button>
      </form>
      {error && <p className="text-red-600 text-xs bg-red-50 px-3 py-2 rounded-lg">{error}</p>}
      <p className="text-xs text-gray-400">
        Envoie le lien du badge par WhatsApp : la personne l&apos;affiche depuis son
        téléphone ou l&apos;imprime au format carte. La phrase à dire est au dos.
      </p>
    </div>
  );
}
