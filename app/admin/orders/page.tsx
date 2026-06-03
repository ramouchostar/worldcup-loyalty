"use client";

import { useEffect, useState } from "react";

type AdminOrder = {
  id: string;
  amount: number;
  order_date: string;
  order_time: string;
  status: string;
  rejection_reason: string | null;
  submitted_at: string;
  profiles: { display_name: string; email: string } | null;
  teams: { name: string; flag_emoji: string } | null;
};

const STATUS_FILTER = ["all", "pending", "validated", "rejected"] as const;
type Filter = (typeof STATUS_FILTER)[number];

export default function AdminOrdersPage() {
  const [orders, setOrders] = useState<AdminOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<Filter>("pending");
  const [rejectId, setRejectId] = useState<string | null>(null);
  const [rejectReason, setRejectReason] = useState("");
  const [busy, setBusy] = useState<string | null>(null);

  async function fetchOrders() {
    const res = await fetch("/api/admin/orders");
    if (res.ok) setOrders(await res.json());
    setLoading(false);
  }

  useEffect(() => { fetchOrders(); }, []);

  async function handleAction(id: string, action: "validate" | "reject", reason?: string) {
    setBusy(id);
    await fetch("/api/admin/orders", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, action, rejection_reason: reason }),
    });
    setRejectId(null);
    setRejectReason("");
    await fetchOrders();
    setBusy(null);
  }

  const filtered = orders.filter((o) => filter === "all" || o.status === filter);
  const counts = {
    all: orders.length,
    pending: orders.filter((o) => o.status === "pending").length,
    validated: orders.filter((o) => o.status === "validated").length,
    rejected: orders.filter((o) => o.status === "rejected").length,
  };

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Commandes</h1>
        <p className="text-gray-500 text-sm mt-1">Valider ou rejeter les commandes soumises par les membres.</p>
      </div>

      {/* Filtres */}
      <div className="flex gap-2 flex-wrap">
        {STATUS_FILTER.map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
              filter === f
                ? "bg-brand-dark text-white"
                : "bg-white text-gray-600 border border-gray-200 hover:border-gray-400"
            }`}
          >
            {f === "all" ? "Toutes" : f === "pending" ? "En attente" : f === "validated" ? "Validées" : "Rejetées"}
            <span className="ml-1.5 opacity-60">({counts[f]})</span>
          </button>
        ))}
      </div>

      {loading ? (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="bg-white rounded-xl h-24 animate-pulse border border-gray-100" />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-100 p-8 text-center">
          <p className="text-gray-400">Aucune commande dans cette catégorie.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map((order) => (
            <div key={order.id} className={`bg-white rounded-xl border p-4 ${
              order.status === "pending" ? "border-amber-200" :
              order.status === "validated" ? "border-green-200" :
              "border-red-200"
            }`}>
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-base">{order.teams?.flag_emoji}</span>
                    <span className="font-semibold text-gray-900 text-sm">
                      {order.profiles?.display_name ?? "—"}
                    </span>
                    <span className="text-xs text-gray-400">{order.profiles?.email}</span>
                  </div>
                  <p className="text-xl font-black text-gray-900">
                    {Number(order.amount).toLocaleString("fr-BE", { style: "currency", currency: "EUR" })}
                  </p>
                  <p className="text-xs text-gray-500 mt-0.5">
                    {new Date(order.order_date).toLocaleDateString("fr-BE")} à {String(order.order_time).substring(0, 5)}
                    {" · "}Soumis le {new Date(order.submitted_at).toLocaleDateString("fr-BE")}
                  </p>
                  <p className="text-xs text-gray-400 mt-0.5 font-mono">{order.teams?.name}</p>
                  {order.rejection_reason && (
                    <p className="text-xs text-red-600 mt-1">Rejet : {order.rejection_reason}</p>
                  )}
                </div>

                {/* Actions */}
                {order.status === "pending" && (
                  <div className="flex flex-col gap-2 shrink-0">
                    <button
                      onClick={() => handleAction(order.id, "validate")}
                      disabled={busy === order.id}
                      className="px-3 py-1.5 bg-green-600 text-white rounded-lg text-xs font-semibold hover:bg-green-700 disabled:opacity-50"
                    >
                      {busy === order.id ? "..." : "✓ Valider"}
                    </button>
                    <button
                      onClick={() => setRejectId(order.id)}
                      disabled={busy === order.id}
                      className="px-3 py-1.5 bg-red-100 text-red-700 rounded-lg text-xs font-semibold hover:bg-red-200 disabled:opacity-50"
                    >
                      ✕ Rejeter
                    </button>
                  </div>
                )}

                {order.status !== "pending" && (
                  <span className={`text-xs font-bold px-2.5 py-1 rounded-full shrink-0 ${
                    order.status === "validated"
                      ? "bg-green-100 text-green-800"
                      : "bg-red-100 text-red-800"
                  }`}>
                    {order.status === "validated" ? "Validée ✓" : "Rejetée"}
                  </span>
                )}
              </div>

              {/* Formulaire rejet inline */}
              {rejectId === order.id && (
                <div className="mt-3 border-t border-gray-100 pt-3 flex gap-2">
                  <input
                    type="text"
                    value={rejectReason}
                    onChange={(e) => setRejectReason(e.target.value)}
                    placeholder="Motif du rejet..."
                    className="flex-1 px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-red-400"
                  />
                  <button
                    onClick={() => handleAction(order.id, "reject", rejectReason)}
                    disabled={!rejectReason.trim()}
                    className="px-3 py-2 bg-red-600 text-white rounded-lg text-sm font-semibold disabled:opacity-50 hover:bg-red-700"
                  >
                    Confirmer
                  </button>
                  <button
                    onClick={() => { setRejectId(null); setRejectReason(""); }}
                    className="px-3 py-2 border border-gray-200 rounded-lg text-sm text-gray-600 hover:bg-gray-50"
                  >
                    Annuler
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
