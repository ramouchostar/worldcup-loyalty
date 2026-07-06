"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";

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
  google_review:    "⭐ Avis Google",
  instagram_follow: "📸 Follow Instagram",
  tiktok_follow:    "🎵 Follow TikTok",
  facebook_follow:  "👍 Follow Facebook",
};

export default function AdminMicroRewardsPage() {
  const { restaurantId } = useParams<{ restaurantId: string }>();
  const [claims, setClaims] = useState<AdminClaim[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<"all" | "pending" | "validated" | "rejected">("pending");
  const [busy, setBusy] = useState<string | null>(null);

  async function fetchClaims() {
    const res = await fetch(`/api/admin/micro-rewards?restaurantId=${restaurantId}`);
    if (res.ok) setClaims(await res.json());
    setLoading(false);
  }

  useEffect(() => {
    fetchClaims();
  }, [restaurantId]);

  async function handleAction(id: string, action: "validate" | "reject") {
    setBusy(id);
    await fetch("/api/admin/micro-rewards", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, action, restaurantId }),
    });
    await fetchClaims();
    setBusy(null);
  }

  // Compute token count per user (social validated claims)
  const tokensByUser = claims.reduce<Record<string, number>>((acc, c) => {
    if (c.status === "validated") acc[c.user_id] = (acc[c.user_id] ?? 0) + 1;
    return acc;
  }, {});

  // Users with enough social tokens to potentially earn churros (4+)
  const churrosEligible = Object.entries(tokensByUser)
    .filter(([, count]) => count >= 4)
    .map(([userId, count]) => {
      const claim = claims.find((c) => c.user_id === userId);
      return { userId, count, profile: claim?.profiles ?? null };
    });

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
        <h1 className="text-2xl font-bold text-gray-900">Actions sociales</h1>
        <p className="text-gray-500 text-sm mt-1">
          Chaque action validée = 1 jeton social. 4 jetons (social + parrainage) = le cadeau jetons configuré (voir Menu &amp; cadeaux).
        </p>
      </div>

      {/* Churros eligible */}
      {churrosEligible.length > 0 && (
        <div className="bg-green-50 border-2 border-green-400 rounded-xl p-4">
          <p className="font-bold text-green-900 mb-3">
            🎁 {churrosEligible.length} membre(s) avec 4+ jetons sociaux
          </p>
          <p className="text-xs text-green-700 mb-3">
            Note : des jetons parrainages peuvent s&apos;y ajouter — vérifier dans &quot;Parrainages&quot;.
          </p>
          <div className="space-y-2">
            {churrosEligible.map(({ userId, count, profile }) => (
              <div
                key={userId}
                className="bg-white rounded-lg px-4 py-3 flex items-center justify-between"
              >
                <div>
                  <p className="font-semibold text-gray-900 text-sm">
                    {profile?.display_name ?? "—"}
                  </p>
                  <p className="text-xs text-gray-400">{profile?.email}</p>
                </div>
                <span className="text-xs font-bold bg-green-100 text-green-800 px-2 py-1 rounded-full">
                  {count} jeton{count > 1 ? "s" : ""} sociaux ✓
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

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
            {f === "all" ? "Toutes" : f === "pending" ? "En attente" : f === "validated" ? "Validées" : "Rejetées"}
            <span className="ml-1.5 opacity-60">({counts[f]})</span>
          </button>
        ))}
      </div>

      {/* Claims list */}
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
            const userTokens = tokensByUser[claim.user_id] ?? 0;
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
                        ({userTokens} jeton{userTokens > 1 ? "s" : ""} social{userTokens > 1 ? "aux" : ""})
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
