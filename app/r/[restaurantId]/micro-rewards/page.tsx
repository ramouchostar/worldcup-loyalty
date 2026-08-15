"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { useRestaurantInfo } from "@/components/member/RestaurantContext";
import { ACTION_ICONS, TOKENS_PER_PORTION, getActionLinks } from "@/lib/social-actions";
import { track } from "@/lib/analytics";
import type { MicroReward, MicroRewardClaim, MicroRewardType, ReferralLinkData } from "@/types";

type SocialData = {
  rewards: MicroReward[];
  claims: MicroRewardClaim[];
  // Cadeau des 4 jetons de l'établissement (ADR 0017) — nom uniquement, jamais de coût
  giftName?: string;
};

export default function MicroRewardsPage() {
  const { restaurantId } = useParams<{ restaurantId: string }>();
  const restaurant = useRestaurantInfo();
  const { name: restaurantName } = restaurant;

  const links = getActionLinks(restaurant, restaurantId);
  const ACTION_META: Record<MicroRewardType, { icon: string; link: string | undefined }> = {
    google_review:    { icon: ACTION_ICONS.google_review,    link: links.google_review },
    instagram_follow: { icon: ACTION_ICONS.instagram_follow, link: links.instagram_follow },
    tiktok_follow:    { icon: ACTION_ICONS.tiktok_follow,    link: links.tiktok_follow },
    facebook_follow:  { icon: ACTION_ICONS.facebook_follow,  link: links.facebook_follow },
  };
  const [socialData, setSocialData] = useState<SocialData | null>(null);
  const [referralData, setReferralData] = useState<ReferralLinkData | null>(null);
  const [loading, setLoading] = useState(true);

  async function fetchAll() {
    const [socialRes, refRes] = await Promise.all([
      fetch(`/api/micro-rewards?restaurantId=${restaurantId}`),
      fetch(`/api/referrals?restaurantId=${restaurantId}`),
    ]);
    if (socialRes.ok) setSocialData(await socialRes.json());
    if (refRes.ok) setReferralData(await refRes.json());
    setLoading(false);
  }

  useEffect(() => { fetchAll(); }, []);

  if (loading) {
    return (
      <div className="space-y-3 pb-4">
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="bg-white rounded-2xl h-28 animate-pulse border border-gray-100" />
        ))}
      </div>
    );
  }

  const claims = socialData?.claims ?? [];
  const socialTokens = claims.filter((c) => c.status === "validated").length;
  const referralTokens = Math.floor((referralData?.validatedCount ?? 0) / 5);
  const totalTokens = socialTokens + referralTokens;
  const giftsEarned = Math.floor(totalTokens / TOKENS_PER_PORTION);
  const nextMilestone = (giftsEarned + 1) * TOKENS_PER_PORTION;
  const tokensToNext = nextMilestone - totalTokens;
  // Cadeau propre à l'établissement (ADR 0017) — le serveur gère les
  // fallbacks (hérité pour le resto legacy, « Cadeau surprise » sinon)
  const giftName = socialData?.giftName ?? "Cadeau surprise";

  const claimMap = Object.fromEntries(claims.map((c) => [c.reward_type, c])) as Record<string, MicroRewardClaim>;

  return (
    <div className="space-y-5 pb-4">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Jetons & Cadeaux</h1>
        <p className="text-gray-500 text-sm mt-1">
          Gagne des jetons via les actions sociales et les parrainages.
        </p>
      </div>

      {/* Token summary */}
      {giftsEarned > 0 ? (
        <div className="bg-green-50 border-2 border-green-400 rounded-2xl p-5">
          <p className="text-4xl mb-2 text-center">🎉</p>
          <p className="font-bold text-green-900 text-lg text-center">
            {giftsEarned} cadeau{giftsEarned > 1 ? "x" : ""} « {giftName} » gagné{giftsEarned > 1 ? "s" : ""}
          </p>
          <p className="text-green-800 text-sm mt-1 text-center">
            Présente-toi au comptoir {restaurantName} pour les récupérer.
          </p>
          <div className="mt-3 bg-green-100 rounded-xl p-3 text-center">
            <p className="text-xs text-green-700">
              {totalTokens} jeton{totalTokens > 1 ? "s" : ""} au total · encore {tokensToNext} pour un nouveau cadeau
            </p>
          </div>
        </div>
      ) : (
        <div className="bg-white border border-gray-200 rounded-2xl p-5">
          <div className="flex items-center justify-between mb-3">
            <div>
              <p className="text-xs text-gray-500 uppercase tracking-wide font-medium">Cadeau à débloquer</p>
              <p className="font-bold text-gray-900 text-lg mt-0.5">🎁 {giftName} offert</p>
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
            {tokensToNext} jeton{tokensToNext > 1 ? "s" : ""} de plus pour gagner ton premier cadeau
          </p>
        </div>
      )}

      {/* Social actions */}
      <div>
        <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-3">
          Actions sociales — 1 jeton chacune
        </h2>
        <div className="space-y-3">
          {(socialData?.rewards ?? []).map((reward) => (
            <ActionCard
              key={reward.id}
              reward={reward}
              claim={claimMap[reward.type] ?? null}
              meta={ACTION_META[reward.type as MicroRewardType]}
              restaurantId={restaurantId}
              onSuccess={fetchAll}
            />
          ))}
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
  restaurantId,
  onSuccess,
}: {
  reward: MicroReward;
  claim: MicroRewardClaim | null;
  meta: { icon: string; link: string | undefined };
  restaurantId: string;
  onSuccess: () => void;
}) {
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const status = claim?.status;

  async function handleClaim() {
    setSubmitting(true);
    setError(null);
    const res = await fetch("/api/micro-rewards", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ reward_type: reward.type, restaurantId }),
    });
    if (res.status === 201) {
      track("micro_reward_claimed", { channel: reward.type });
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
        <div className="flex items-center gap-3">
          <span className="text-2xl shrink-0">{meta?.icon}</span>
          <div className="flex-1 min-w-0">
            <h3 className="font-bold text-gray-900 text-sm">{reward.title}</h3>
            <p className="text-xs text-gray-500 mt-0.5">{reward.description}</p>
          </div>
          <div className="shrink-0">
            {status === "validated" && <span className="text-xl">✅</span>}
            {status === "pending"   && <span className="text-xl">⏳</span>}
            {!status && (
              <span className="w-6 h-6 rounded-full border-2 border-gray-200 inline-flex items-center justify-center text-xs text-gray-300">
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

        {!claim && (
          <div className="mt-3 flex flex-col gap-2">
            {meta?.link && (
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
              onClick={handleClaim}
              disabled={submitting}
              className="w-full bg-brand-dark text-white py-2.5 rounded-xl font-semibold text-sm hover:bg-gray-800 disabled:opacity-50 transition-colors"
            >
              {submitting ? "Envoi…" : "J'ai effectué cette action ✓"}
            </button>
            {error && (
              <p className="text-red-600 text-xs bg-red-50 px-3 py-2 rounded-lg">{error}</p>
            )}
          </div>
        )}
      </div>
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
  const { name: restaurantName } = useRestaurantInfo();
  const [copied, setCopied] = useState(false);

  const progressToToken = validatedCount % 5;
  const nextTokenIn = 5 - progressToToken;

  const joinUrl =
    code && typeof window !== "undefined"
      ? `${window.location.origin}/join?ref=${code}`
      : null;

  const whatsappUrl = joinUrl
    ? `https://wa.me/?text=${encodeURIComponent(
        `Rejoins ma communauté ${restaurantName} 🎉 et commande directement — on gagne ensemble !\n${joinUrl}`
      )}`
    : null;

  async function copyLink() {
    if (!joinUrl) return;
    await navigator.clipboard.writeText(joinUrl);
    track("referral_shared", { channel: "copy" });
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div>
      <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-3">
        Parrainages — 5 inscrits = 1 jeton
      </h2>

      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
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
              {progressToToken}/5 · encore {nextTokenIn} inscription{nextTokenIn > 1 ? "s" : ""} pour un nouveau jeton
            </p>
          </div>
        </div>

        <div className="p-4 space-y-3">
          <p className="text-sm text-gray-600">
            Partage ton lien — chaque ami qui s&apos;inscrit via ce lien compte comme un parrainage.
          </p>

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

          {whatsappUrl ? (
            <a
              href={whatsappUrl}
              target="_blank"
              rel="noopener noreferrer"
              onClick={() => track("referral_shared", { channel: "whatsapp" })}
              className="flex items-center justify-center gap-2 w-full bg-[#25D366] text-white py-3 rounded-xl font-semibold text-sm hover:bg-[#1ebe5b] transition-colors"
            >
              <svg viewBox="0 0 24 24" className="w-5 h-5 fill-current" aria-hidden="true">
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
