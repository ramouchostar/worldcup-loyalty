"use client";

import { useEffect, useMemo, useState } from "react";
import { Receipt, TriangleAlert, Trophy, Users, Utensils, X } from "lucide-react";
import { useParams } from "next/navigation";
import type { PendingReward } from "@/types";
import { PageHeader, FilterTabs, StatusBadge } from "@/components/admin/ui";

type AdminPendingReward = PendingReward & {
  profiles: { display_name: string; email: string } | null;
  orders: { amount: number; order_date: string } | null;
};

// Cadeaux sans commande en face — gros cadeau échangé contre la réserve
// (ADR 0021 / 0060) ou cadeau d'anniversaire (ADR 0024). Le comptoir sait
// d'un coup d'œil qu'aucun ticket du jour ne l'accompagne. Les cadeaux liés à
// un ticket, l'immense majorité, n'ont AUCUNE étiquette : la liste reste
// aussi légère qu'avant (ADR 0054 — pastille neutre, jamais d'alerte).
function sourceLabel(source: string | null | undefined): string | null {
  if (source === "saver") return "Gros cadeau · réserve";
  if (source === "birthday") return "Anniversaire";
  if (source === "catalog") return "Choisi avec ses points";
  if (source === "team") return "Cadeau d'équipe";
  return null;
}

function sourceNote(source: string | null | undefined): string | null {
  if (source === "saver") return "Échangé contre des points de réserve";
  if (source === "birthday") return "Offert pour l'anniversaire";
  if (source === "catalog") return "Choisi au catalogue avec ses points (ADR 0061)";
  if (source === "team") return "Offert à chaque membre quand l'équipe a franchi un palier (ADR 0061)";
  return null;
}

export default function AdminPendingRewardsPage() {
  const { restaurantId } = useParams<{ restaurantId: string }>();
  const [rewards, setRewards] = useState<AdminPendingReward[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<"available" | "redeemed">("available");
  const [search, setSearch] = useState("");
  const [actionError, setActionError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  async function fetchRewards() {
    const res = await fetch(`/api/admin/pending-rewards?restaurantId=${restaurantId}`);
    if (res.ok) setRewards(await res.json());
    setLoading(false);
  }

  useEffect(() => { fetchRewards(); }, [restaurantId]);

  async function markRedeemed(id: string) {
    setBusy(id);
    const res = await fetch("/api/admin/pending-rewards", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, restaurantId }),
    });
    if (!res.ok) {
      const body = await res.json().catch(() => null);
      setActionError(body?.error ?? "Échec — la récompense n'a pas été marquée comme récupérée.");
    }
    await fetchRewards();
    setBusy(null);
  }

  const pending  = rewards.filter(r => r.status === "available");
  const redeemed = rewards.filter(r => r.status === "redeemed");

  const counts = { available: pending.length, redeemed: redeemed.length };

  // Résumé des items à distribuer (pending seulement)
  const distribution = useMemo(() => {
    const map: Record<string, number> = {};
    for (const r of pending) {
      for (const item of [r.solo_item, r.community_item, r.advancement_item]) {
        if (item) map[item] = (map[item] ?? 0) + 1;
      }
    }
    return Object.entries(map).sort((a, b) => b[1] - a[1]);
  }, [pending]);

  const filtered = (filter === "available" ? pending : redeemed).filter(r => {
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    return (
      r.profiles?.display_name?.toLowerCase().includes(q) ||
      r.profiles?.email?.toLowerCase().includes(q)
    );
  });

  return (
    <div className="space-y-5">
      {actionError && (
        <div className="bg-danger/10 border border-danger/30 rounded-xl p-3 text-sm text-danger flex items-start justify-between gap-2">
          <span className="flex items-start gap-2">
            <TriangleAlert size={15} strokeWidth={1.8} className="shrink-0 mt-0.5" aria-hidden="true" />
            {actionError}
          </span>
          <button onClick={() => setActionError(null)} className="text-danger/60 hover:text-danger shrink-0" aria-label="Fermer">
            <X size={15} strokeWidth={2} aria-hidden="true" />
          </button>
        </div>
      )}
      <PageHeader
        title={<>Récompenses en attente</>}
        subtitle={<>Marque comme récupérée quand le membre passe au comptoir.</>}
      />

      {/* Résumé distribution */}
      {distribution.length > 0 && (
        <div className="bg-brand-gold/10 border border-brand-gold/30 rounded-xl p-4">
          <p className="text-xs font-semibold text-ink-body uppercase tracking-wide mb-2">
            <Receipt size={14} strokeWidth={1.8} className="inline-block mr-1.5 -mt-0.5" aria-hidden="true" />
          À préparer ({pending.length} récompense{pending.length > 1 ? "s" : ""})
          </p>
          <div className="flex flex-wrap gap-2">
            {distribution.map(([item, count]) => (
              <span
                key={item}
                className="inline-flex items-center gap-1 bg-white border border-paper-border text-ink text-sm font-medium px-3 py-1 rounded-full"
              >
                <span className="font-bold text-brand-red">{count}×</span> {item}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Filtres + recherche */}
      <div className="flex flex-col gap-3">
        <FilterTabs
          value={filter}
          onChange={setFilter}
          tabs={(["available", "redeemed"] as const).map((f) => ({
            key: f,
            label: f === "available" ? "À récupérer" : "Récupérées",
            count: counts[f],
          }))}
        />

        <input
          type="search"
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Rechercher par nom ou email..."
          className="w-full px-4 py-2.5 border border-paper-border rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-brand-red text-ink placeholder:text-ink-faint"
        />
      </div>

      {/* Liste */}
      {loading ? (
        <div className="space-y-3">
          {[1, 2, 3].map(i => (
            <div key={i} className="bg-white rounded-xl h-20 animate-pulse border border-paper-border" />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div className="bg-white rounded-xl border border-paper-border p-8 text-center">
          <p className="text-ink-faint">
            {search ? "Aucun résultat pour cette recherche." :
             filter === "available" ? "Aucune récompense en attente." : "Aucune récompense récupérée."}
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map(r => (
            <div
              key={r.id}
              className={`bg-white rounded-xl border p-4 ${
                r.status === "available" ? "border-brand-gold/40" : "border-paper-border opacity-70"
              }`}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2 mb-2 flex-wrap">
                    <span className="font-bold text-sm text-ink">
                      {r.profiles?.display_name ?? "—"}
                    </span>
                    <span className="text-xs text-ink-faint">{r.profiles?.email}</span>
                    {sourceLabel(r.source) && <StatusBadge>{sourceLabel(r.source)}</StatusBadge>}
                  </div>

                  {/* Cadeaux par couche */}
                  <div className="space-y-1 mb-2">
                    {r.solo_item && (
                      <div className="flex items-center gap-1.5 text-sm">
                        <span className="text-ink-faint" aria-hidden="true"><Utensils size={14} strokeWidth={1.7} /></span>
                        <span className="font-medium text-ink">{r.solo_item}</span>
                        {/* « palier solo » n'est vrai que pour un cadeau issu d'un ticket :
                            un gros cadeau de réserve ou d'anniversaire portait ce libellé à tort. */}
                        {!sourceLabel(r.source) && <span className="text-xs text-ink-faint">— palier solo</span>}
                      </div>
                    )}
                    {r.community_item && (
                      <div className="flex items-center gap-1.5 text-sm">
                        <span className="text-ink-faint" aria-hidden="true"><Users size={14} strokeWidth={1.7} /></span>
                        <span className="font-medium text-ink">{r.solo_item ? "+ " : ""}{r.community_item}</span>
                        <span className="text-xs text-ink-faint">— cadeau d&apos;équipe</span>
                      </div>
                    )}
                    {r.advancement_item && (
                      <div className="flex items-center gap-1.5 text-sm">
                        <span className="text-ink-faint" aria-hidden="true"><Trophy size={14} strokeWidth={1.7} /></span>
                        <span className="font-medium text-ink">+ {r.advancement_item}</span>
                        <span className="text-xs text-ink-faint">— bonus d&apos;équipe</span>
                      </div>
                    )}
                  </div>

                  <p className="text-xs text-ink-faint">
                    {r.orders
                      ? `Commande ${Number(r.orders.amount).toLocaleString("fr-BE", { style: "currency", currency: "EUR" })} — ${new Date(r.orders.order_date).toLocaleDateString("fr-BE")}`
                      : sourceNote(r.source) ?? "Commande —"
                    }{" "}
                    · Généré le{" "}
                    {new Date(r.created_at).toLocaleDateString("fr-BE")}
                  </p>
                </div>

                {r.status === "available" ? (
                  <button
                    onClick={() => markRedeemed(r.id)}
                    disabled={busy === r.id}
                    className="shrink-0 px-3 py-1.5 bg-good text-white rounded-lg text-xs font-semibold hover:bg-good disabled:opacity-50 transition-colors"
                  >
                    {busy === r.id ? "…" : "Récupéré"}
                  </button>
                ) : (
                  <div className="shrink-0 text-right">
                    <span className="text-xs font-bold px-2.5 py-1 rounded-full bg-paper-subtle text-ink-muted">
                      Récupéré
                    </span>
                    {r.redeemed_at && (
                      <p className="text-xs text-ink-faint mt-1">
                        {new Date(r.redeemed_at).toLocaleDateString("fr-BE")}
                      </p>
                    )}
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
