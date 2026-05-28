"use client";

import { useEffect, useState } from "react";

type AdminReferral = {
  id: string;
  user_id: string;
  referral_email: string;
  status: string;
  submitted_at: string;
  profiles: { display_name: string; email: string } | null;
};

export default function AdminReferralsPage() {
  const [referrals, setReferrals] = useState<AdminReferral[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<"all" | "pending" | "validated" | "rejected">("pending");
  const [busy, setBusy] = useState<string | null>(null);

  async function fetchReferrals() {
    const res = await fetch("/api/admin/referrals");
    if (res.ok) setReferrals(await res.json());
    setLoading(false);
  }

  useEffect(() => {
    fetchReferrals();
  }, []);

  async function handleAction(id: string, action: "validate" | "reject") {
    setBusy(id);
    await fetch("/api/admin/referrals", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, action }),
    });
    await fetchReferrals();
    setBusy(null);
  }

  // Count validated referrals per user to show token progress
  const validatedByUser = referrals.reduce<Record<string, number>>((acc, r) => {
    if (r.status === "validated") acc[r.user_id] = (acc[r.user_id] ?? 0) + 1;
    return acc;
  }, {});

  const filtered = referrals.filter((r) => filter === "all" || r.status === filter);
  const counts = {
    all: referrals.length,
    pending: referrals.filter((r) => r.status === "pending").length,
    validated: referrals.filter((r) => r.status === "validated").length,
    rejected: referrals.filter((r) => r.status === "rejected").length,
  };

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Parrainages</h1>
        <p className="text-gray-500 text-sm mt-1">
          Valider quand l&apos;ami s&apos;est bien inscrit. 5 validés = 1 jeton parrainage.
        </p>
      </div>

      {/* Filters */}
      <div className="flex gap-2 flex-wrap">
        {(["all", "pending", "validated", "rejected"] as const).map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
              filter === f
                ? "bg-brand-dark text-white"
                : "bg-white text-gray-600 border border-gray-200 hover:border-gray-400"
            }`}
          >
            {f === "all" ? "Tous" : f === "pending" ? "En attente" : f === "validated" ? "Validés" : "Rejetés"}
            <span className="ml-1.5 opacity-60">({counts[f]})</span>
          </button>
        ))}
      </div>

      {loading ? (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="bg-white rounded-xl h-16 animate-pulse border border-gray-100" />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-100 p-8 text-center">
          <p className="text-gray-400">Aucun parrainage dans cette catégorie.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map((ref) => {
            const userValidated = validatedByUser[ref.user_id] ?? 0;
            const tokens = Math.floor(userValidated / 5);
            return (
              <div
                key={ref.id}
                className={`bg-white rounded-xl border p-4 ${
                  ref.status === "pending"
                    ? "border-amber-200"
                    : ref.status === "validated"
                    ? "border-green-200"
                    : "border-red-200"
                }`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 mb-1 flex-wrap">
                      <span className="font-semibold text-sm text-gray-900">
                        {ref.profiles?.display_name ?? "—"}
                      </span>
                      <span className="text-xs text-gray-400">{ref.profiles?.email}</span>
                      {tokens > 0 && (
                        <span className="text-xs font-semibold text-brand-red">
                          {tokens} jeton{tokens > 1 ? "s" : ""} parrainage
                        </span>
                      )}
                    </div>
                    <p className="text-sm text-gray-700">
                      Ami : <span className="font-medium">{ref.referral_email}</span>
                    </p>
                    <p className="text-xs text-gray-400 mt-0.5">
                      {userValidated} validé{userValidated > 1 ? "s" : ""} au total · Soumis le{" "}
                      {new Date(ref.submitted_at).toLocaleDateString("fr-BE")}
                    </p>
                  </div>

                  {ref.status === "pending" && (
                    <div className="flex flex-col gap-2 shrink-0">
                      <button
                        onClick={() => handleAction(ref.id, "validate")}
                        disabled={busy === ref.id}
                        className="px-3 py-1.5 bg-green-600 text-white rounded-lg text-xs font-semibold hover:bg-green-700 disabled:opacity-50"
                      >
                        {busy === ref.id ? "..." : "✓ Valider"}
                      </button>
                      <button
                        onClick={() => handleAction(ref.id, "reject")}
                        disabled={busy === ref.id}
                        className="px-3 py-1.5 bg-red-100 text-red-700 rounded-lg text-xs font-semibold hover:bg-red-200 disabled:opacity-50"
                      >
                        ✕ Rejeter
                      </button>
                    </div>
                  )}

                  {ref.status !== "pending" && (
                    <span
                      className={`text-xs font-bold px-2.5 py-1 rounded-full shrink-0 ${
                        ref.status === "validated"
                          ? "bg-green-100 text-green-800"
                          : "bg-red-100 text-red-800"
                      }`}
                    >
                      {ref.status === "validated" ? "Validé ✓" : "Rejeté"}
                    </span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
