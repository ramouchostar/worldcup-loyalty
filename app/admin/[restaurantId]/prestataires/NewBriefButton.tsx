"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight } from "lucide-react";

// Ouvre (ou rouvre) le brouillon d'un métier puis y emmène le restaurateur.
// Un brouillon par métier : « Commencer » reprend là où il s'était arrêté.
export function NewBriefButton({
  restaurantId,
  metier,
  label,
}: {
  restaurantId: string;
  metier: "video" | "photo" | "design" | "impression";
  label: string;
}) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function go() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/missions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ restaurantId, metier }),
      });
      const body = await res.json().catch(() => ({}));
      if (res.ok && body.missionId) {
        router.push(`/admin/${restaurantId}/prestataires/${body.missionId}`);
        return;
      }
      setError(body.error ?? "Impossible d'ouvrir le brief pour le moment.");
    } catch {
      setError("Pas de connexion. Réessaie dans un instant.");
    }
    setLoading(false);
  }

  return (
    <div>
      <button
        type="button"
        disabled={loading}
        onClick={go}
        className="inline-flex items-center justify-center gap-1.5 w-full sm:w-auto min-h-[44px] px-5 rounded-xl bg-boost-olive text-white text-[14px] font-semibold shadow-[inset_0_-3px_0_#4F5C2D] hover:brightness-95 disabled:opacity-60"
      >
        {loading ? "Ouverture…" : label} {!loading && <ArrowRight className="w-4 h-4" aria-hidden />}
      </button>
      {error && (
        <p role="alert" className="text-danger text-[13px] font-semibold mt-2">
          {error}
        </p>
      )}
    </div>
  );
}
