"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function RedeemButton() {
  const [busy, setBusy] = useState(false);
  const router = useRouter();

  async function handleClick() {
    setBusy(true);
    const res = await fetch("/api/redemption/generate", { method: "POST" });
    if (res.ok) {
      const { token } = await res.json();
      router.push(`/coupon/${token}`);
    } else {
      const body = await res.json().catch(() => ({}));
      alert(body.error ?? "Erreur lors de la génération du coupon");
      setBusy(false);
    }
  }

  return (
    <button
      onClick={handleClick}
      disabled={busy}
      className="text-xs font-semibold text-white bg-brand-red px-3 py-1.5 rounded-full hover:bg-red-700 disabled:opacity-50 transition-colors"
    >
      {busy ? "…" : "🎁 Récupérer"}
    </button>
  );
}
