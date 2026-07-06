"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useRestaurantInfo } from "@/components/member/RestaurantContext";
import type { ReferralLinkData } from "@/types";

export default function InvitePage() {
  const { restaurantId } = useParams<{ restaurantId: string }>();
  const { name: restaurantName } = useRestaurantInfo();
  const [data, setData] = useState<ReferralLinkData | null>(null);
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    fetch(`/api/referrals?restaurantId=${restaurantId}`)
      .then((r) => (r.ok ? r.json() : null))
      .then(setData)
      .finally(() => setLoading(false));
  }, [restaurantId]);

  const joinUrl =
    data?.code && typeof window !== "undefined"
      ? `${window.location.origin}/join?ref=${data.code}`
      : null;

  const whatsappUrl = joinUrl
    ? `https://wa.me/?text=${encodeURIComponent(
        `Rejoins ma communauté ${restaurantName} 🇧🇪 et commande directement — on gagne ensemble !\n${joinUrl}`
      )}`
    : null;

  async function copyLink() {
    if (!joinUrl) return;
    await navigator.clipboard.writeText(joinUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  const validatedCount = data?.validatedCount ?? 0;
  const referralTokens = Math.floor(validatedCount / 5);
  const progressToToken = validatedCount % 5;
  const nextTokenIn = 5 - progressToToken;

  return (
    <div className="space-y-5 pb-4">
      <div className="flex items-center gap-3">
        <Link href={`/r/${restaurantId}/dashboard`} className="text-gray-400 hover:text-gray-600">
          ←
        </Link>
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Inviter des amis</h1>
          <p className="text-gray-500 text-sm mt-0.5">
            5 amis inscrits = 1 jeton · 4 jetons = 1 cadeau au comptoir
          </p>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 gap-3">
        <div className="bg-white rounded-xl border border-gray-100 p-4 text-center">
          <p className="text-3xl font-bold text-gray-900 tabular-nums">
            {validatedCount}
          </p>
          <p className="text-xs text-gray-500 mt-1">Amis inscrits</p>
        </div>
        <div className="bg-white rounded-xl border border-gray-100 p-4 text-center">
          <p className="text-3xl font-bold text-brand-red tabular-nums">
            {referralTokens}
          </p>
          <p className="text-xs text-gray-500 mt-1">Jetons gagnés</p>
        </div>
      </div>

      {/* Progress to next token */}
      <div className="bg-white rounded-xl border border-gray-100 p-4">
        <div className="flex items-center justify-between mb-2">
          <p className="text-sm font-semibold text-gray-700">Prochain jeton</p>
          <p className="text-sm text-gray-500 tabular-nums">{progressToToken}/5</p>
        </div>
        <div className="w-full bg-gray-100 rounded-full h-2">
          <div
            className="bg-brand-red h-2 rounded-full transition-all duration-500"
            style={{ width: `${(progressToToken / 5) * 100}%` }}
          />
        </div>
        <p className="text-xs text-gray-400 mt-2">
          Encore {nextTokenIn} inscription{nextTokenIn > 1 ? "s" : ""} pour gagner un jeton
        </p>
      </div>

      {/* Share section */}
      <div className="bg-white rounded-xl border border-gray-100 p-4 space-y-3">
        <p className="text-sm font-semibold text-gray-700">Ton lien de parrainage</p>

        {loading ? (
          <div className="h-10 bg-gray-100 rounded-xl animate-pulse" />
        ) : joinUrl ? (
          <div className="flex items-center gap-2 bg-gray-50 rounded-xl px-3 py-2.5 border border-gray-200">
            <p className="flex-1 text-xs text-gray-600 truncate font-mono">
              {joinUrl}
            </p>
            <button
              onClick={copyLink}
              className="shrink-0 text-xs font-semibold text-brand-red hover:text-red-700 transition-colors"
            >
              {copied ? "✓ Copié" : "Copier"}
            </button>
          </div>
        ) : null}

        <p className="text-xs text-gray-500">
          Chaque ami qui s&apos;inscrit via ton lien compte comme un parrainage.
        </p>

        {loading ? (
          <div className="h-12 bg-gray-100 rounded-xl animate-pulse" />
        ) : whatsappUrl ? (
          <a
            href={whatsappUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center justify-center gap-2 w-full bg-[#25D366] text-white py-3 rounded-xl font-semibold text-sm hover:bg-[#1ebe5b] transition-colors"
          >
            <svg
              viewBox="0 0 24 24"
              className="w-5 h-5 fill-current"
              aria-hidden="true"
            >
              <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
            </svg>
            Partager sur WhatsApp
          </a>
        ) : null}
      </div>

      {/* How it works */}
      <div className="bg-brand-dark rounded-xl p-4 text-white">
        <p className="text-sm font-semibold mb-3">Comment ça marche ?</p>
        <div className="space-y-2.5">
          <div className="flex items-start gap-3">
            <span className="text-lg leading-none mt-0.5">📲</span>
            <p className="text-xs text-gray-300">
              Partage ton lien via WhatsApp à tes amis
            </p>
          </div>
          <div className="flex items-start gap-3">
            <span className="text-lg leading-none mt-0.5">✅</span>
            <p className="text-xs text-gray-300">
              Chaque ami qui s&apos;inscrit et rejoint une équipe compte comme 1 parrainage
            </p>
          </div>
          <div className="flex items-start gap-3">
            <span className="text-lg leading-none mt-0.5">🪙</span>
            <p className="text-xs text-gray-300">
              5 parrainages validés = 1 jeton
            </p>
          </div>
          <div className="flex items-start gap-3">
            <span className="text-lg leading-none mt-0.5">🎁</span>
            <p className="text-xs text-gray-300">
              4 jetons = 1 cadeau offert au comptoir
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
