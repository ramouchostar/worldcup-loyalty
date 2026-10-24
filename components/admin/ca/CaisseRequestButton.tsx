"use client";

import { useState } from "react";

// ADR 0087 §6 — « Connecter ma caisse » enregistre une DEMANDE (service_requests) :
// l'équipe rappelle pour voir, au cas par cas, si la caisse peut envoyer le
// chiffre. L'écran ne promet que ce qui se passe vraiment (ADR 0081 §6).

type Status = "idle" | "sending" | "sent" | "error";

export function CaisseRequestButton({ restaurantId, alreadyPending }: { restaurantId: string; alreadyPending: boolean }) {
  const [status, setStatus] = useState<Status>(alreadyPending ? "sent" : "idle");

  async function ask() {
    setStatus("sending");
    try {
      const res = await fetch("/api/admin/service-request", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ restaurantId, service: "caisse", source: "ca_du_jour" }),
      });
      setStatus(res.ok ? "sent" : "error");
    } catch {
      setStatus("error");
    }
  }

  if (status === "sent") {
    return <p className="text-[13px] text-good font-semibold">Demande envoyée. On te contacte pour voir comment connecter ta caisse.</p>;
  }
  return (
    <div className="space-y-2">
      <button
        type="button"
        onClick={() => void ask()}
        disabled={status === "sending"}
        className="min-h-[44px] px-4 rounded-lg border border-paper-border bg-white text-[13.5px] font-semibold text-ink hover:bg-paper disabled:opacity-50"
      >
        Connecter ma caisse
      </button>
      {status === "error" && <p className="text-[12.5px] text-danger">La demande n&apos;est pas partie. Réessaie dans un instant.</p>}
    </div>
  );
}
