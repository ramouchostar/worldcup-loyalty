"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

type Item = { icon: string; label: string; sublabel: string };

type Props = {
  token: string;
  expiresAt: string;
  memberName: string;
  items: Item[];
  isAdmin?: boolean;
  restaurantName?: string;
  backHref: string;
};

function initials(name: string) {
  return name
    .split(" ")
    .map((n) => n[0]?.toUpperCase() ?? "")
    .slice(0, 2)
    .join("");
}

export function CouponClient({ token, expiresAt, memberName, items, isAdmin = false, restaurantName, backHref }: Props) {
  const backLabel = isAdmin ? "← Retour à la file des cadeaux" : "← Retour à mes cadeaux";
  const [now, setNow] = useState(() => Date.now());
  const [redeemed, setRedeemed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  const expires = new Date(expiresAt).getTime();
  const remaining = Math.max(0, Math.floor((expires - now) / 1000));
  const isExpired = remaining === 0;

  const mm = String(Math.floor(remaining / 60)).padStart(2, "0");
  const ss = String(remaining % 60).padStart(2, "0");
  const pct = Math.round((remaining / 600) * 100);

  const liveTime = new Date(now).toLocaleTimeString("fr-BE", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });

  const timerColor =
    remaining > 300 ? "text-green-600" : remaining > 120 ? "text-amber-500" : "text-red-600";
  const barColor =
    remaining > 300 ? "bg-green-500" : remaining > 120 ? "bg-amber-400" : "bg-red-500";

  async function handleRedeem() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/redemption/${token}/redeem`, { method: "POST" });
      if (res.ok) { setRedeemed(true); return; }
      const body = await res.json().catch(() => ({}));
      setError(body.error ?? "Erreur lors de la validation.");
    } catch {
      setError("Erreur réseau. Réessaie.");
    } finally {
      setBusy(false);
    }
  }

  if (redeemed) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-green-50">
        <div className="text-center px-6">
          <div className="text-6xl mb-4">✅</div>
          <h1 className="text-2xl font-bold text-green-900">Cadeau remis !</h1>
          <p className="text-green-700 mt-2">Le coupon a été validé avec succès.</p>
          <Link href={backHref} className="inline-block mt-6 text-sm font-medium text-green-800 underline">
            {backLabel}
          </Link>
        </div>
      </div>
    );
  }

  if (isExpired) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center px-6">
          <div className="text-5xl mb-4">⏱</div>
          <h1 className="text-xl font-bold text-gray-900">Coupon expiré</h1>
          <p className="text-gray-500 mt-2 text-sm">
            Ce coupon de 10 minutes a expiré. Génère-en un nouveau depuis tes récompenses.
          </p>
          <Link href={backHref} className="inline-block mt-6 text-sm font-medium text-gray-700 underline">
            {backLabel}
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-start pt-8 px-4 pb-8">
      <div className="w-full max-w-sm">
        <div className="bg-white rounded-2xl shadow-lg border border-gray-200 overflow-hidden">
          {/* Progress bar */}
          <div className="h-2 bg-gray-100">
            <div
              className={`h-2 transition-all duration-1000 ${barColor}`}
              style={{ width: `${pct}%` }}
            />
          </div>

          <div className="p-6">
            {/* Live clock — clé anti-capture d'écran */}
            <div className="flex items-center justify-between mb-5">
              <span className="text-xs text-gray-400 uppercase tracking-wide">Il est</span>
              <span className="text-sm font-mono font-bold text-gray-700 tabular-nums">
                {liveTime}
              </span>
            </div>

            {/* Identité membre */}
            <div className="flex items-center gap-3 mb-5">
              <div className="w-12 h-12 rounded-full bg-brand-red flex items-center justify-center text-white font-bold text-lg shrink-0">
                {initials(memberName)}
              </div>
              <div>
                <p className="font-bold text-gray-900">{memberName}</p>
                <p className="text-xs text-gray-400">Coupon unique · valide 10 min</p>
              </div>
            </div>

            {/* Countdown */}
            <div className="text-center mb-5">
              <span className={`text-5xl font-mono font-black tabular-nums ${timerColor}`}>
                {mm}:{ss}
              </span>
              <p className="text-xs text-gray-400 mt-1">restantes pour récupérer</p>
            </div>

            {/* Cadeaux */}
            <div className="space-y-2.5 border-t border-gray-100 pt-4">
              {items.map((item, i) => (
                <div key={i} className="flex items-center gap-2">
                  <span className="text-lg">{item.icon}</span>
                  <span className="font-semibold text-gray-900 text-sm flex-1">{item.label}</span>
                  <span className="text-xs text-gray-400">{item.sublabel}</span>
                </div>
              ))}
            </div>

            {/* Token visible pour le cashier */}
            <div className="mt-4 pt-4 border-t border-gray-100 text-center">
              <p className="text-xs text-gray-300 font-mono tracking-widest">{token}</p>
            </div>

            {/* Bouton cashier */}
            {isAdmin && (
              <button
                onClick={handleRedeem}
                disabled={busy}
                className="mt-4 w-full bg-green-600 text-white font-bold py-3 rounded-xl hover:bg-green-700 disabled:opacity-50 transition-colors text-sm"
              >
                {busy ? "Validation…" : "✅ Cadeau remis"}
              </button>
            )}
            {isAdmin && error && (
              <p className="mt-2 text-center text-sm text-red-600">{error}</p>
            )}
          </div>
        </div>

        {!isAdmin && (
          <p className="text-center text-xs text-gray-400 mt-4">
            Montre cette page au cashier {restaurantName ?? "du restaurant"} pour récupérer tes cadeaux.
          </p>
        )}
        <p className="text-center mt-4">
          <Link href={backHref} className="text-xs text-gray-400 hover:text-gray-600 underline">
            {backLabel}
          </Link>
        </p>
      </div>
    </div>
  );
}
