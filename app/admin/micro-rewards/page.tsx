"use client";

import { useEffect, useState } from "react";

type AdminClaim = {
  id: string;
  user_id: string;
  reward_type: string;
  proof_url: string | null;
  status: string;
  claimed_at: string;
  profiles: { display_name: string; email: string } | null;
};

const TYPE_LABELS: Record<string, string> = {
  google_review: "⭐ Avis Google",
  social_follow: "📱 Abonnement réseaux",
  social_share: "🔁 Partage campagne",
  referral: "👥 Parrainage",
};

const ALL_TYPES = ["google_review", "social_follow", "social_share", "referral"];

export default function AdminMicroRewardsPage() {
  const [claims, setClaims] = useState<AdminClaim[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<"all" | "pending" | "validated" | "rejected">("pending");
  const [busy, setBusy] = useState<string | null>(null);

  async function fetchClaims() {
    const res = await fetch("/api/admin/micro-rewards");
    if (res.ok) setClaims(await res.json());
    setLoading(false);
  }

  useEffect(() => {
    fetchClaims();
  }, []);

  async function handleAction(id: string, action: "validate" | "reject") {
    setBusy(id);
    await fetch("/api/admin/micro-rewards", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, action }),
    });
    await fetchClaims();
    setBusy(null);
  }

  // Membres avec les 4 actions validées → churros à remettre
  const claimsByUser = claims.reduce<Record<string, AdminClaim[]>>((acc, c) => {
    if (!acc[c.user_id]) acc[c.user_id] = [];
    acc[c.user_id].push(c);
    return acc;
  }, {});

  const churrosReady = Object.values(claimsByUser).filter(
    (userClaims) =>
      ALL_TYPES.every((type) =>
        userClaims.some((c) => c.reward_type === type && c.status === "validated")
      )
  );

  const filtered = claims.filter((c) => filter === "all" || c.status === filter);
  const counts = {
    all: claims.length,
    pending: claims.filter((c) => c.status === "pending").length,
    validated: claims.filter((c) => c.status === "validated").length,
    rejected: claims.filter((c) => c.status === "rejected").length,
  };

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Actions & Cadeau</h1>
        <p className="text-gray-500 text-sm mt-1">
          Valider les 4 actions d&apos;un membre débloque ses Churros (6 pcs).
        </p>
      </div>

      {/* Section churros à remettre */}
      {churrosReady.length > 0 && (
        <div className="bg-green-50 border-2 border-green-400 rounded-xl p-4">
          <p className="font-bold text-green-900 mb-3">
            🍢 {churrosReady.length} membre(s) à qui remettre les Churros
          </p>
          <div className="space-y-2">
            {churrosReady.map((userClaims) => {
              const profile = userClaims[0].profiles;
              return (
                <div
                  key={userClaims[0].user_id}
                  className="bg-white rounded-lg px-4 py-3 flex items-center justify-between"
                >
                  <div>
                    <p className="font-semibold text-gray-900 text-sm">
                      {profile?.display_name ?? "—"}
                    </p>
                    <p className="text-xs text-gray-400">{profile?.email}</p>
                  </div>
                  <span className="text-xs font-bold bg-green-100 text-green-800 px-2 py-1 rounded-full">
                    Churros à remettre ✓
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Filtres */}
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
            {f === "all"
              ? "Toutes"
              : f === "pending"
              ? "En attente"
              : f === "validated"
              ? "Validées"
              : "Rejetées"}
            <span className="ml-1.5 opacity-60">({counts[f]})</span>
          </button>
        ))}
      </div>

      {/* Liste des demandes */}
      {loading ? (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="bg-white rounded-xl h-20 animate-pulse border border-gray-100" />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-100 p-8 text-center">
          <p className="text-gray-400">Aucune demande dans cette catégorie.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map((claim) => {
            const userClaims = claimsByUser[claim.user_id] ?? [];
            const userValidatedCount = userClaims.filter((c) => c.status === "validated").length;
            return (
              <div
                key={claim.id}
                className={`bg-white rounded-xl border p-4 ${
                  claim.status === "pending"
                    ? "border-amber-200"
                    : claim.status === "validated"
                    ? "border-green-200"
                    : "border-red-200"
                }`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 mb-1 flex-wrap">
                      <span className="font-semibold text-sm text-gray-900">
                        {claim.profiles?.display_name ?? "—"}
                      </span>
                      <span className="text-xs text-gray-400">{claim.profiles?.email}</span>
                      <span className="text-xs text-gray-400">
                        ({userValidatedCount}/4 validées)
                      </span>
                    </div>
                    <span className="inline-block bg-gray-100 text-gray-700 text-xs font-medium px-2 py-0.5 rounded-full mb-2">
                      {TYPE_LABELS[claim.reward_type] ?? claim.reward_type}
                    </span>
                    {claim.proof_url && (
                      <p className="text-xs text-gray-600 break-all">
                        <span className="font-medium">Preuve : </span>
                        {claim.proof_url.startsWith("http") ? (
                          <a
                            href={claim.proof_url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-brand-red underline"
                          >
                            {claim.proof_url}
                          </a>
                        ) : (
                          claim.proof_url
                        )}
                      </p>
                    )}
                    <p className="text-xs text-gray-400 mt-1">
                      Soumis le {new Date(claim.claimed_at).toLocaleDateString("fr-BE")}
                    </p>
                  </div>

                  {claim.status === "pending" && (
                    <div className="flex flex-col gap-2 shrink-0">
                      <button
                        onClick={() => handleAction(claim.id, "validate")}
                        disabled={busy === claim.id}
                        className="px-3 py-1.5 bg-green-600 text-white rounded-lg text-xs font-semibold hover:bg-green-700 disabled:opacity-50"
                      >
                        {busy === claim.id ? "..." : "✓ Valider"}
                      </button>
                      <button
                        onClick={() => handleAction(claim.id, "reject")}
                        disabled={busy === claim.id}
                        className="px-3 py-1.5 bg-red-100 text-red-700 rounded-lg text-xs font-semibold hover:bg-red-200 disabled:opacity-50"
                      >
                        ✕ Rejeter
                      </button>
                    </div>
                  )}

                  {claim.status !== "pending" && (
                    <span
                      className={`text-xs font-bold px-2.5 py-1 rounded-full shrink-0 ${
                        claim.status === "validated"
                          ? "bg-green-100 text-green-800"
                          : "bg-red-100 text-red-800"
                      }`}
                    >
                      {claim.status === "validated" ? "Validée ✓" : "Rejetée"}
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
