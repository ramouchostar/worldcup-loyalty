"use client";

import { useEffect, useState } from "react";
import type { MicroReward, MicroRewardClaim, MicroRewardType } from "@/types";

type MicroRewardData = {
  rewards: MicroReward[];
  claims: MicroRewardClaim[];
};

const ACTION_META: Record<
  MicroRewardType,
  { icon: string; instructions: string; proofLabel: string; proofPlaceholder: string }
> = {
  google_review: {
    icon: "⭐",
    instructions:
      "Laisse un avis 5 étoiles sur la fiche Google Maps de Belchicken. Sois honnête et spontané !",
    proofLabel: "Lien vers ton avis Google",
    proofPlaceholder: "https://maps.google.com/...",
  },
  social_follow: {
    icon: "📱",
    instructions:
      "Suis les comptes Instagram et Facebook de Belchicken pour rester connecté et partager nos actus.",
    proofLabel: "Ton pseudo Instagram ou Facebook",
    proofPlaceholder: "@ton_pseudo",
  },
  social_share: {
    icon: "🔁",
    instructions:
      "Partage notre campagne WorldCup sur tes réseaux sociaux (story, post, ou repost). Tague @Belchicken !",
    proofLabel: "Lien vers ton post ou story",
    proofPlaceholder: "https://instagram.com/p/...",
  },
  referral: {
    icon: "👥",
    instructions:
      "Invite un ami à rejoindre ta communauté WorldCup. Il doit s'inscrire et choisir la même équipe que toi.",
    proofLabel: "Prénom et email de ton ami",
    proofPlaceholder: "Karim — karim@exemple.com",
  },
};

const TOTAL_ACTIONS = 4;

export default function MicroRewardsPage() {
  const [data, setData] = useState<MicroRewardData | null>(null);
  const [loading, setLoading] = useState(true);

  async function fetchData() {
    const res = await fetch("/api/micro-rewards");
    if (res.ok) setData(await res.json());
    setLoading(false);
  }

  useEffect(() => {
    fetchData();
  }, []);

  if (loading) {
    return (
      <div className="space-y-3 pb-4">
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="bg-white rounded-2xl h-40 animate-pulse border border-gray-100" />
        ))}
      </div>
    );
  }

  const claimMap = Object.fromEntries(
    (data?.claims ?? []).map((c) => [c.reward_type, c])
  ) as Record<string, MicroRewardClaim>;

  const validatedCount = (data?.claims ?? []).filter((c) => c.status === "validated").length;
  const submittedCount = (data?.claims ?? []).length;
  const allValidated = validatedCount === TOTAL_ACTIONS;

  return (
    <div className="space-y-5 pb-4">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Actions & Cadeau</h1>
        <p className="text-gray-500 text-sm mt-1">
          Complète les 4 actions pour débloquer ton cadeau.
        </p>
      </div>

      {/* Cadeau cible */}
      {allValidated ? (
        <div className="bg-green-50 border-2 border-green-400 rounded-2xl p-5 text-center">
          <p className="text-4xl mb-2">🎉</p>
          <p className="font-bold text-green-900 text-lg">Toutes les actions complètes !</p>
          <p className="text-green-800 text-sm mt-1">
            Présente-toi au comptoir Belchicken pour récupérer tes{" "}
            <strong>Churros (6 pcs) offerts</strong>.
          </p>
        </div>
      ) : (
        <div className="bg-white border border-gray-200 rounded-2xl p-5">
          <div className="flex items-center justify-between mb-3">
            <div>
              <p className="text-xs text-gray-500 uppercase tracking-wide font-medium">Cadeau à débloquer</p>
              <p className="font-bold text-gray-900 text-lg mt-0.5">🍢 Churros (6 pcs) offerts</p>
            </div>
            <div className="text-right">
              <p className="text-3xl font-bold text-brand-red">{validatedCount}</p>
              <p className="text-xs text-gray-400">/ {TOTAL_ACTIONS} validées</p>
            </div>
          </div>

          {/* Barre de progression */}
          <div className="w-full bg-gray-100 rounded-full h-2.5">
            <div
              className="bg-brand-red h-2.5 rounded-full transition-all duration-500"
              style={{ width: `${(validatedCount / TOTAL_ACTIONS) * 100}%` }}
            />
          </div>

          {submittedCount > validatedCount && (
            <p className="text-xs text-amber-600 mt-2">
              {submittedCount - validatedCount} action(s) en attente de validation par notre équipe.
            </p>
          )}
        </div>
      )}

      {/* Liste des actions */}
      <div className="space-y-4">
        {(data?.rewards ?? []).map((reward) => {
          const claim = claimMap[reward.type];
          const meta = ACTION_META[reward.type as MicroRewardType];
          return (
            <ActionCard
              key={reward.id}
              reward={reward}
              claim={claim ?? null}
              meta={meta}
              onSuccess={fetchData}
            />
          );
        })}
      </div>
    </div>
  );
}

function ActionCard({
  reward,
  claim,
  meta,
  onSuccess,
}: {
  reward: MicroReward;
  claim: MicroRewardClaim | null;
  meta: (typeof ACTION_META)[MicroRewardType];
  onSuccess: () => void;
}) {
  const [proof, setProof] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);

    const res = await fetch("/api/micro-rewards", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ reward_type: reward.type, proof_url: proof }),
    });

    if (res.status === 201) {
      onSuccess();
      return;
    }

    const data = await res.json();
    setError(data.error ?? "Erreur inconnue.");
    setSubmitting(false);
  }

  const statusConfig = {
    pending: { badge: "bg-amber-100 text-amber-800", label: "En attente de validation", icon: "⏳" },
    validated: { badge: "bg-green-100 text-green-800", label: "Validée ✓", icon: "✅" },
    rejected: { badge: "bg-red-100 text-red-800", label: "Rejetée", icon: "❌" },
  };

  const status = claim?.status as keyof typeof statusConfig | undefined;

  return (
    <div
      className={`bg-white rounded-2xl border shadow-sm overflow-hidden ${
        status === "validated"
          ? "border-green-300"
          : status === "pending"
          ? "border-amber-200"
          : "border-gray-100"
      }`}
    >
      <div className="p-5">
        <div className="flex items-start gap-3">
          <span className="text-3xl">{meta.icon}</span>
          <div className="flex-1 min-w-0">
            <h3 className="font-bold text-gray-900">{reward.title}</h3>
            <p className="text-sm text-gray-600 mt-0.5">{reward.description}</p>
          </div>
          {/* Indicateur de complétion */}
          <div className="shrink-0">
            {status === "validated" && <span className="text-2xl">✅</span>}
            {status === "pending" && <span className="text-2xl">⏳</span>}
            {!status && (
              <span className="w-7 h-7 rounded-full border-2 border-gray-200 flex items-center justify-center text-xs text-gray-300">
                ○
              </span>
            )}
          </div>
        </div>

        {status && statusConfig[status] && (
          <div
            className={`mt-4 flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium ${statusConfig[status].badge}`}
          >
            <span>{statusConfig[status].icon}</span>
            <span>{statusConfig[status].label}</span>
          </div>
        )}

        {status === "rejected" && (
          <div className="mt-3 bg-red-50 rounded-lg p-3">
            <p className="text-red-800 text-sm">
              Ta demande a été rejetée. Contacte-nous pour plus d&apos;informations.
            </p>
          </div>
        )}
      </div>

      {!claim && (
        <div className="border-t border-gray-100">
          {!showForm ? (
            <div className="p-5 pt-4">
              <p className="text-sm text-gray-600 mb-4">
                <span className="font-semibold">Comment faire :</span> {meta.instructions}
              </p>
              <button
                onClick={() => setShowForm(true)}
                className="w-full bg-brand-dark text-white py-3 rounded-xl font-semibold text-sm hover:bg-gray-800 transition-colors"
              >
                J&apos;ai effectué cette action →
              </button>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="p-5 pt-4 space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  {meta.proofLabel}
                </label>
                <input
                  type="text"
                  value={proof}
                  onChange={(e) => setProof(e.target.value)}
                  placeholder={meta.proofPlaceholder}
                  required
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-red text-gray-900 text-sm"
                />
                <p className="text-xs text-gray-400 mt-1">
                  Notre équipe vérifiera ta preuve avant de valider.
                </p>
              </div>

              {error && (
                <p className="text-red-600 text-sm bg-red-50 px-4 py-3 rounded-lg">{error}</p>
              )}

              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setShowForm(false)}
                  className="flex-1 py-3 border border-gray-300 rounded-xl text-gray-600 text-sm font-medium hover:bg-gray-50 transition-colors"
                >
                  Annuler
                </button>
                <button
                  type="submit"
                  disabled={submitting || !proof.trim()}
                  className="flex-1 bg-brand-red text-white py-3 rounded-xl font-semibold text-sm hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  {submitting ? "Envoi..." : "Soumettre 📤"}
                </button>
              </div>
            </form>
          )}
        </div>
      )}
    </div>
  );
}
