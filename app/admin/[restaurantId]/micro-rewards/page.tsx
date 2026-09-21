"use client";

import { useEffect, useState } from "react";
import { Gift, TriangleAlert, X } from "lucide-react";
import { useParams } from "next/navigation";
import { PageHeader, FilterTabs } from "@/components/admin/ui";

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
  google_review:    "Avis Google",
  instagram_follow: "Follow Instagram",
  tiktok_follow:    "Follow TikTok",
  facebook_follow:  "Follow Facebook",
};

export default function AdminMicroRewardsPage() {
  const { restaurantId } = useParams<{ restaurantId: string }>();
  const [claims, setClaims] = useState<AdminClaim[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<"all" | "pending" | "validated" | "rejected">("pending");
  const [busy, setBusy] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

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
    setActionError(null);
    // Vérifier res.ok : une erreur avalée ferait croire au restaurateur que
    // le jeton est validé alors qu'il ne l'est pas (audit 2026-07-23).
    const res = await fetch("/api/admin/micro-rewards", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, action, restaurantId }),
    }).catch(() => null);
    if (!res?.ok) {
      const body = await res?.json().catch(() => null);
      setActionError(body?.error ?? "Échec de l'action — la demande n'a PAS été traitée. Réessaie.");
    }
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
        title={<>Actions sociales</>}
        subtitle={<>Chaque action validée = 1 jeton social. 4 jetons (social + parrainage) = le cadeau jetons configuré (voir Menu &amp; cadeaux). Une action que vous ne refusez pas est validée automatiquement 4 h après la demande.</>}
      />

      {/* Churros eligible */}
      {churrosEligible.length > 0 && (
        <div className="bg-good/10 border-2 border-good/50 rounded-xl p-4">
          <p className="font-bold text-good mb-3">
            <Gift size={15} strokeWidth={1.8} className="inline-block mr-1.5 -mt-0.5" aria-hidden="true" />
          {churrosEligible.length} membre(s) avec 4+ jetons sociaux
          </p>
          <p className="text-xs text-good mb-3">
            Note : des jetons parrainages peuvent s&apos;y ajouter — vérifier dans &quot;Parrainages&quot;.
          </p>
          <div className="space-y-2">
            {churrosEligible.map(({ userId, count, profile }) => (
              <div
                key={userId}
                className="bg-white rounded-lg px-4 py-3 flex items-center justify-between"
              >
                <div>
                  <p className="font-semibold text-ink text-sm">
                    {profile?.display_name ?? "—"}
                  </p>
                  <p className="text-xs text-ink-faint">{profile?.email}</p>
                </div>
                <span className="text-xs font-bold bg-good/12 text-good px-2 py-1 rounded-full">
                  {count} jeton{count > 1 ? "s" : ""} sociaux
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      <FilterTabs
        value={filter}
        onChange={setFilter}
        tabs={(["all", "pending", "validated", "rejected"] as const).map((f) => ({
          key: f,
          label: f === "all" ? "Toutes" : f === "pending" ? "En attente" : f === "validated" ? "Validées" : "Rejetées",
          count: counts[f],
        }))}
      />

      {/* Claims list */}
      {loading ? (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="bg-white rounded-xl h-20 animate-pulse border border-paper-border" />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div className="bg-white rounded-xl border border-paper-border p-8 text-center">
          <p className="text-ink-faint">Aucune demande dans cette catégorie.</p>
          <p className="text-xs text-ink-faint mt-1 max-w-sm mx-auto">
            Les demandes arrivent quand un membre déclare une action sociale
            (avis Google, abonnement…) depuis son onglet Actions.
          </p>
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
                    ? "border-warn/30"
                    : claim.status === "validated"
                    ? "border-good/30"
                    : "border-danger/30"
                }`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 mb-1 flex-wrap">
                      <span className="font-semibold text-sm text-ink">
                        {claim.profiles?.display_name ?? "—"}
                      </span>
                      <span className="text-xs text-ink-faint">{claim.profiles?.email}</span>
                      <span className="text-xs text-ink-faint">
                        ({userTokens} jeton{userTokens > 1 ? "s" : ""} social{userTokens > 1 ? "aux" : ""})
                      </span>
                    </div>
                    <span className="inline-block bg-paper-subtle text-ink-body text-xs font-medium px-2 py-0.5 rounded-full mb-2">
                      {TYPE_LABELS[claim.reward_type] ?? claim.reward_type}
                    </span>
                    {claim.proof_url && (
                      <p className="text-xs text-ink-body break-all">
                        <span className="font-medium">Preuve : </span>
                        {claim.proof_url.startsWith("http") ? (
                          <a
                            href={claim.proof_url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-ink underline"
                          >
                            {claim.proof_url}
                          </a>
                        ) : (
                          claim.proof_url
                        )}
                      </p>
                    )}
                    <p className="text-xs text-ink-faint mt-1">
                      Soumis le {new Date(claim.claimed_at).toLocaleDateString("fr-BE")}
                    </p>
                  </div>

                  {claim.status === "pending" && (
                    <div className="flex flex-col gap-2 shrink-0">
                      <button
                        onClick={() => handleAction(claim.id, "validate")}
                        disabled={busy === claim.id}
                        className="px-3 py-1.5 bg-good text-white rounded-lg text-xs font-semibold hover:bg-good disabled:opacity-50"
                      >
                        {busy === claim.id ? "..." : "Valider"}
                      </button>
                      <button
                        onClick={() => handleAction(claim.id, "reject")}
                        disabled={busy === claim.id}
                        className="px-3 py-1.5 bg-danger/12 text-danger rounded-lg text-xs font-semibold hover:bg-danger/20 disabled:opacity-50"
                      >
                        Rejeter
                      </button>
                    </div>
                  )}

                  {claim.status !== "pending" && (
                    <span
                      className={`text-xs font-bold px-2.5 py-1 rounded-full shrink-0 ${
                        claim.status === "validated"
                          ? "bg-good/12 text-good"
                          : "bg-danger/12 text-danger"
                      }`}
                    >
                      {claim.status === "validated" ? "Validée" : "Rejetée"}
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
