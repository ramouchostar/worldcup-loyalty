"use client";

import { useEffect, useState } from "react";

type AdminReferral = {
  id: string;
  referred_at: string;
  referrer_id: string;
  referrer: { display_name: string; email: string } | null;
  referee: { display_name: string; email: string } | null;
};

export default function AdminReferralsPage() {
  const [referrals, setReferrals] = useState<AdminReferral[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/admin/referrals")
      .then((r) => r.json())
      .then((data) => { setReferrals(data); setLoading(false); });
  }, []);

  // Group by referrer to compute token counts
  const byReferrer = referrals.reduce<Record<string, { name: string; email: string; count: number }>>(
    (acc, r) => {
      const name = r.referrer?.display_name ?? "—";
      const email = r.referrer?.email ?? "";
      if (!acc[r.referrer_id]) acc[r.referrer_id] = { name, email, count: 0 };
      acc[r.referrer_id].count += 1;
      return acc;
    },
    {}
  );

  const totalReferrals = referrals.length;
  const totalReferrers = Object.keys(byReferrer).length;

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Parrainages</h1>
        <p className="text-gray-500 text-sm mt-1">
          Attribution automatique à l&apos;inscription via lien WhatsApp. 5 inscrits = 1 jeton.
        </p>
      </div>

      {/* Summary */}
      <div className="grid grid-cols-2 gap-3">
        <div className="bg-white rounded-xl border border-gray-100 p-4">
          <p className="text-xs text-gray-500 uppercase tracking-wide font-medium">Amis inscrits</p>
          <p className="text-3xl font-bold text-gray-900 mt-1">{totalReferrals}</p>
        </div>
        <div className="bg-white rounded-xl border border-gray-100 p-4">
          <p className="text-xs text-gray-500 uppercase tracking-wide font-medium">Parrains actifs</p>
          <p className="text-3xl font-bold text-gray-900 mt-1">{totalReferrers}</p>
        </div>
      </div>

      {/* Referrers leaderboard */}
      {Object.keys(byReferrer).length > 0 && (
        <div>
          <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-3">
            Parrains — jetons gagnés
          </h2>
          <div className="space-y-2">
            {Object.entries(byReferrer)
              .sort((a, b) => b[1].count - a[1].count)
              .map(([uid, data]) => {
                const tokens = Math.floor(data.count / 5);
                const progress = data.count % 5;
                return (
                  <div key={uid} className="bg-white rounded-xl border border-gray-100 p-4 flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <p className="font-semibold text-sm text-gray-900">{data.name}</p>
                      <p className="text-xs text-gray-400">{data.email}</p>
                      <p className="text-xs text-gray-500 mt-1">
                        {data.count} ami{data.count > 1 ? "s" : ""} inscrit{data.count > 1 ? "s" : ""}
                        {" · "}{progress}/5 vers prochain jeton
                      </p>
                    </div>
                    <div className="shrink-0 text-right">
                      {tokens > 0 ? (
                        <span className="inline-flex items-center gap-1 bg-brand-red text-white text-sm font-bold px-3 py-1.5 rounded-full">
                          {tokens} jeton{tokens > 1 ? "s" : ""}
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 bg-gray-100 text-gray-500 text-sm font-medium px-3 py-1.5 rounded-full">
                          {progress}/5
                        </span>
                      )}
                    </div>
                  </div>
                );
              })}
          </div>
        </div>
      )}

      {/* Referral log */}
      <div>
        <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-3">
          Historique des inscriptions
        </h2>

        {loading ? (
          <div className="space-y-3">
            {[1, 2, 3].map((i) => (
              <div key={i} className="bg-white rounded-xl h-16 animate-pulse border border-gray-100" />
            ))}
          </div>
        ) : referrals.length === 0 ? (
          <div className="bg-white rounded-xl border border-gray-100 p-8 text-center">
            <p className="text-gray-400">Aucun parrainage enregistré.</p>
            <p className="text-xs text-gray-300 mt-2">
              Les parrainages s&apos;enregistrent automatiquement quand un ami s&apos;inscrit via un lien WhatsApp.
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            {referrals.map((r) => (
              <div key={r.id} className="bg-white rounded-xl border border-green-200 p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span className="font-semibold text-sm text-gray-900">
                        {r.referrer?.display_name ?? "—"}
                      </span>
                      <span className="text-gray-400 text-xs">a parrainé</span>
                      <span className="font-semibold text-sm text-gray-900">
                        {r.referee?.display_name ?? "—"}
                      </span>
                    </div>
                    <p className="text-xs text-gray-400 mt-0.5">
                      {r.referee?.email} · Inscrit le{" "}
                      {new Date(r.referred_at).toLocaleDateString("fr-BE", {
                        day: "numeric",
                        month: "short",
                        year: "numeric",
                      })}
                    </p>
                  </div>
                  <span className="shrink-0 text-xs font-bold px-2.5 py-1 rounded-full bg-green-100 text-green-800">
                    ✓ Inscrit
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
