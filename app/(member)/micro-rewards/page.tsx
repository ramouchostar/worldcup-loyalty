"use client";

import { useEffect, useState } from "react";
import type { MicroReward, MicroRewardClaim, MicroRewardType, ReferralLinkData } from "@/types";

type SocialData = {
  rewards: MicroReward[];
  claims: MicroRewardClaim[];
};

const ACTION_META: Record<
  MicroRewardType,
  { icon: string; link: string | undefined; proofLabel: string; proofPlaceholder: string }
> = {
  google_review: {
    icon: "⭐",
    link: process.env.NEXT_PUBLIC_GOOGLE_MAPS_URL,
    proofLabel: "Lien vers ton avis Google",
    proofPlaceholder: "https://maps.google.com/...",
  },
  instagram_follow: {
    icon: "📸",
    link: process.env.NEXT_PUBLIC_INSTAGRAM_URL,
    proofLabel: "Ton pseudo Instagram",
    proofPlaceholder: "@ton_pseudo",
  },
  tiktok_follow: {
    icon: "🎵",
    link: process.env.NEXT_PUBLIC_TIKTOK_URL,
    proofLabel: "Ton pseudo TikTok",
    proofPlaceholder: "@ton_pseudo",
  },
  facebook_follow: {
    icon: "👍",
    link: process.env.NEXT_PUBLIC_FACEBOOK_URL,
    proofLabel: "Ton pseudo ou lien profil Facebook",
    proofPlaceholder: "facebook.com/ton.profil",
  },
};

const TOKENS_PER_PORTION = 4;

export default function MicroRewardsPage() {
  const [socialData, setSocialData] = useState<SocialData | null>(null);
  const [referralData, setReferralData] = useState<ReferralLinkData | null>(null);
  const [loading, setLoading] = useState(true);

  async function fetchAll() {
    const [socialRes, refRes] = await Promise.all([
      fetch("/api/micro-rewards"),
      fetch("/api/referrals"),
    ]);
    if (socialRes.ok) setSocialData(await socialRes.json());
    if (refRes.ok) setReferralData(await refRes.json());
    setLoading(false);
  }

  useEffect(() => {
    fetchAll();
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

  const claims = socialData?.claims ?? [];
  const socialTokens = claims.filter((c) => c.status === "validated").length;
  const referralTokens = Math.floor((referralData?.validatedCount ?? 0) / 5);
  const totalTokens = socialTokens + referralTokens;
  const churroPortions = Math.floor(totalTokens / TOKENS_PER_PORTION);
  const nextMilestone = (churroPortions + 1) * TOKENS_PER_PORTION;
  const tokensToNext = nextMilestone - totalTokens;

  const claimMap = Object.fromEntries(claims.map((c) => [c.reward_type, c])) as Record<
    string,
    MicroRewardClaim
  >;

  return (
    <div className="space-y-5 pb-4">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Jetons & Churros</h1>
        <p className="text-gray-500 text-sm mt-1">
          Gagne des jetons via les actions sociales et les parrainages.
        </p>
      </div>

      {/* Token summary */}
      {churroPortions > 0 ? (
        <div className="bg-green-50 border-2 border-green-400 rounded-2xl p-5">
          <p className="text-4xl mb-2 text-center">🎉</p>
          <p className="font-bold text-green-900 text-lg text-center">
            {churroPortions} portion{churroPortions > 1 ? "s" : ""} de 12 Churros gagnée{churroPortions > 1 ? "s" : ""}
          </p>
          <p className="text-green-800 text-sm mt-1 text-center">
            Présente-toi au comptoir Belchicken pour les récupérer.
          </p>
          <div className="mt-3 bg-green-100 rounded-xl p-3 text-center">
            <p className="text-xs text-green-700">
              {totalTokens} jeton{totalTokens > 1 ? "s" : ""} au total — encore {tokensToNext} pour une nouvelle portion
            </p>
          </div>
        </div>
      ) : (
        <div className="bg-white border border-gray-200 rounded-2xl p-5">
          <div className="flex items-center justify-between mb-3">
            <div>
              <p className="text-xs text-gray-500 uppercase tracking-wide font-medium">Cadeau à débloquer</p>
              <p className="font-bold text-gray-900 text-lg mt-0.5">🍢 12 Churros offerts</p>
            </div>
            <div className="text-right">
              <p className="text-3xl font-bold text-brand-red">{totalTokens}</p>
              <p className="text-xs text-gray-400">/ {TOKENS_PER_PORTION} jetons</p>
            </div>
          </div>
          <div className="w-full bg-gray-100 rounded-full h-2.5">
            <div
              className="bg-brand-red h-2.5 rounded-full transition-all duration-500"
              style={{ width: `${Math.min((totalTokens / TOKENS_PER_PORTION) * 100, 100)}%` }}
            />
          </div>
          <p className="text-xs text-gray-400 mt-2">
            {tokensToNext} jeton{tokensToNext > 1 ? "s" : ""} de plus pour gagner ta première portion
          </p>
        </div>
      )}

      {/* Social actions */}
      <div>
        <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-3">
          Actions sociales — 1 jeton chacune
        </h2>
        <div className="space-y-3">
          {(socialData?.rewards ?? []).map((reward) => {
            const claim = claimMap[reward.type] ?? null;
            const meta = ACTION_META[reward.type as MicroRewardType];
            return (
              <ActionCard
                key={reward.id}
                reward={reward}
                claim={claim}
                meta={meta}
                onSuccess={fetchAll}
              />
            );
          })}
        </div>
      </div>

      {/* Referral section */}
      <ReferralSection
        code={referralData?.code ?? null}
        validatedCount={referralData?.validatedCount ?? 0}
        referralTokens={referralTokens}
      />
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

  const status = claim?.status;

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
      <div className="p-4">
        <div className="flex items-start gap-3">
          <span className="text-2xl">{meta.icon}</span>
          <div className="flex-1 min-w-0">
            <h3 className="font-bold text-gray-900 text-sm">{reward.title}</h3>
            <p className="text-xs text-gray-500 mt-0.5">{reward.description}</p>
          </div>
          <div className="shrink-0">
            {status === "validated" && <span className="text-xl">✅</span>}
            {status === "pending" && <span className="text-xl">⏳</span>}
            {!status && (
              <span className="w-6 h-6 rounded-full border-2 border-gray-200 flex items-center justify-center text-xs text-gray-300">
                ○
              </span>
            )}
          </div>
        </div>

        {status === "validated" && (
          <div className="mt-3 bg-green-50 px-3 py-2 rounded-lg text-xs font-medium text-green-800">
            ✅ Validée — +1 jeton obtenu
          </div>
        )}
        {status === "pending" && (
          <div className="mt-3 bg-amber-50 px-3 py-2 rounded-lg text-xs font-medium text-amber-800">
            ⏳ En attente de validation par notre équipe
          </div>
        )}
        {status === "rejected" && (
          <div className="mt-3 bg-red-50 px-3 py-2 rounded-lg text-xs text-red-800">
            ❌ Rejetée — contacte-nous pour plus d&apos;informations.
          </div>
        )}
      </div>

      {!claim && (
        <div className="border-t border-gray-100">
          {!showForm ? (
            <div className="p-4 flex flex-col gap-2">
              {meta.link && (
                <a
                  href={meta.link}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="w-full bg-gray-100 text-gray-800 py-2.5 rounded-xl font-semibold text-sm hover:bg-gray-200 transition-colors text-center"
                >
                  Ouvrir {reward.title} →
                </a>
              )}
              <button
                onClick={() => setShowForm(true)}
                className="w-full bg-brand-dark text-white py-2.5 rounded-xl font-semibold text-sm hover:bg-gray-800 transition-colors"
              >
                J&apos;ai effectué cette action ✓
              </button>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="p-4 space-y-3">
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
                  className="w-full px-3 py-2.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-red text-gray-900 text-sm"
                />
                <p className="text-xs text-gray-400 mt-1">
                  Notre équipe vérifiera avant validation.
                </p>
              </div>
              {error && (
                <p className="text-red-600 text-sm bg-red-50 px-3 py-2 rounded-lg">{error}</p>
              )}
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setShowForm(false)}
                  className="flex-1 py-2.5 border border-gray-300 rounded-xl text-gray-600 text-sm font-medium hover:bg-gray-50"
                >
                  Annuler
                </button>
                <button
                  type="submit"
                  disabled={submitting || !proof.trim()}
                  className="flex-1 bg-brand-red text-white py-2.5 rounded-xl font-semibold text-sm hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed"
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

function ReferralSection({
  code,
  validatedCount,
  referralTokens,
}: {
  code: string | null;
  validatedCount: number;
  referralTokens: number;
}) {
  const [copied, setCopied] = useState(false);

  const progressToToken = validatedCount % 5;
  const nextTokenIn = 5 - progressToToken;

  const joinUrl =
    code && typeof window !== "undefined"
      ? `${window.location.origin}/invite?ref=${code}`
      : null;

  const whatsappUrl = joinUrl
    ? `https://wa.me/?text=${encodeURIComponent(
        `Rejoins ma communauté Belchicken 🇧🇪 et commande directement — on gagne ensemble !\n${joinUrl}`
      )}`
    : null;

  async function copyLink() {
    if (!joinUrl) return;
    await navigator.clipboard.writeText(joinUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div>
      <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-3">
        Parrainages — 5 inscrits = 1 jeton
      </h2>

      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
        {/* Stats */}
        <div className="p-4 border-b border-gray-100">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs text-gray-500">Amis inscrits via ton lien</p>
              <p className="text-2xl font-bold text-gray-900">{validatedCount}</p>
            </div>
            <div className="text-right">
              <p className="text-xs text-gray-500">Jetons parrainages</p>
              <p className="text-2xl font-bold text-brand-red">{referralTokens}</p>
            </div>
          </div>
          <div className="mt-3">
            <div className="w-full bg-gray-100 rounded-full h-2">
              <div
                className="bg-brand-red h-2 rounded-full transition-all duration-500"
                style={{ width: `${(progressToToken / 5) * 100}%` }}
              />
            </div>
            <p className="text-xs text-gray-400 mt-1">
              {progressToToken}/5 — encore {nextTokenIn} inscription{nextTokenIn > 1 ? "s" : ""} pour un nouveau jeton
            </p>
          </div>
        </div>

        {/* Share section */}
        <div className="p-4 space-y-3">
          <p className="text-sm text-gray-600">
            Partage ton lien — chaque ami qui s&apos;inscrit via ce lien compte comme un parrainage.
          </p>

          {/* Link display */}
          {joinUrl ? (
            <div className="flex items-center gap-2 bg-gray-50 rounded-xl px-3 py-2.5 border border-gray-200">
              <p className="flex-1 text-xs text-gray-600 truncate font-mono">{joinUrl}</p>
              <button
                onClick={copyLink}
                className="shrink-0 text-xs font-semibold text-brand-red hover:text-red-700 transition-colors"
              >
                {copied ? "✓ Copié" : "Copier"}
              </button>
            </div>
          ) : (
            <div className="h-10 bg-gray-100 rounded-xl animate-pulse" />
          )}

          {/* WhatsApp button */}
          {whatsappUrl ? (
            <a
              href={whatsappUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center justify-center gap-2 w-full bg-[#25D366] text-white py-3 rounded-xl font-semibold text-sm hover:bg-[#1ebe5b] transition-colors"
            >
              <svg viewBox="0 0 24 24" className="w-5 h-5 fill-current">
                <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
              </svg>
              Partager sur WhatsApp
            </a>
          ) : (
            <div className="h-12 bg-gray-100 rounded-xl animate-pulse" />
          )}
        </div>
      </div>
    </div>
  );
}
