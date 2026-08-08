"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { DIMENSION_LABELS } from "@/lib/feedback-constants";
import { RequestPlanButton } from "@/components/admin/Paywall";
import type { AdminFeedbackItem, Barometer } from "@/types";

// ADR 0023 §8 — le baromètre est un ÉTAT + une TENDANCE + une DÉCOMPOSITION,
// jamais une note chiffrée. « Pas assez de signaux » sous le seuil.
const STATE = {
  good: { emoji: "🟢", label: "Bonne dynamique", cls: "text-green-800 bg-green-50 border-green-200" },
  watch: { emoji: "🟠", label: "À surveiller", cls: "text-amber-800 bg-amber-50 border-amber-200" },
  tense: { emoji: "🔴", label: "Tendu", cls: "text-red-800 bg-red-50 border-red-200" },
  insufficient: { emoji: "🌱", label: "Pas assez de signaux", cls: "text-gray-600 bg-gray-50 border-gray-200" },
} as const;

const TREND: Record<Barometer["trend"], string> = {
  up: "↗︎ en amélioration",
  down: "↘︎ en recul",
  flat: "→ stable",
  na: "",
};

export function QualityFeedbackAdmin({
  restaurantId,
  barometer,
  items,
  advancedLocked = false,
}: {
  restaurantId: string;
  barometer: Barometer;
  items: AdminFeedbackItem[];
  // ADR 0029 — baromètre AVANCÉ (tendance + décomposition) verrouillé hors
  // plan Croissance ; l'état, les compteurs et les réponses restent Gratuit.
  advancedLocked?: boolean;
}) {
  const incidents = items.filter((i) => i.sentiment === "incident");
  const encouragements = items.filter((i) => i.sentiment === "encouragement");
  const st = STATE[barometer.state];

  return (
    <div className="space-y-6">
      {/* Baromètre */}
      <div className={`rounded-2xl border p-5 ${st.cls}`}>
        <div className="flex items-center justify-between">
          <span className="text-lg font-bold">{st.emoji} {st.label}</span>
          {!advancedLocked && barometer.trend !== "na" && (
            <span className="text-sm font-medium">{TREND[barometer.trend]}</span>
          )}
        </div>

        {barometer.state === "insufficient" ? (
          <p className="mt-2 text-sm">
            Encore trop peu de retours pour dégager une tendance fiable. Encourage tes clients à
            scanner leurs tickets — chaque scan enrichit ton baromètre.
          </p>
        ) : (
          <>
            <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-sm">
              <span>💛 {barometer.encouragements} encouragement{barometer.encouragements > 1 ? "s" : ""}</span>
              <span>🙋 {barometer.incidents} signalement{barometer.incidents > 1 ? "s" : ""}</span>
              {barometer.unresolved > 0 && <span className="font-semibold">⚠️ {barometer.unresolved} sans réponse</span>}
            </div>
            {advancedLocked ? (
              <div className="mt-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2 bg-white/70 border border-gray-200 rounded-xl px-3 py-2.5">
                <p className="text-xs text-gray-600">
                  🔒 La <strong>tendance</strong> et les <strong>axes récurrents</strong> font
                  partie du baromètre avancé (plan Croissance).
                </p>
                <RequestPlanButton
                  restaurantId={restaurantId}
                  feature="barometer_advanced"
                  requiredPlan="croissance"
                  className="bg-brand-dark text-white px-3 py-1.5 rounded-lg text-xs font-bold hover:bg-gray-800 transition-colors shrink-0"
                />
              </div>
            ) : (
              barometer.topDimensions.length > 0 && (
                <p className="mt-2 text-sm">
                  Reviennent le plus :{" "}
                  {barometer.topDimensions
                    .slice(0, 3)
                    .map((d) => `${DIMENSION_LABELS[d.dimension]} (${d.count})`)
                    .join(" · ")}
                </p>
              )
            )}
          </>
        )}
      </div>

      {/* Signalements — d'abord, c'est là qu'on agit */}
      <section className="space-y-3">
        <h2 className="font-semibold text-gray-900">
          Signalements{incidents.length > 0 && <span className="text-gray-400 font-normal"> ({incidents.length})</span>}
        </h2>
        {incidents.length === 0 ? (
          <p className="text-sm text-gray-500">Aucun signalement — profites-en 🙂</p>
        ) : (
          incidents.map((it) => <AdminCard key={it.id} restaurantId={restaurantId} item={it} />)
        )}
      </section>

      {/* Encouragements */}
      {encouragements.length > 0 && (
        <section className="space-y-3">
          <h2 className="font-semibold text-gray-900">
            Encouragements <span className="text-gray-400 font-normal">({encouragements.length})</span>
          </h2>
          {encouragements.map((it) => (
            <AdminCard key={it.id} restaurantId={restaurantId} item={it} />
          ))}
        </section>
      )}
    </div>
  );
}

function AdminCard({ restaurantId, item }: { restaurantId: string; item: AdminFeedbackItem }) {
  const router = useRouter();
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const isInc = item.sentiment === "incident";

  async function act(payload: { body?: string; resolve?: boolean }) {
    setBusy(true);
    setErr(null);
    try {
      const res = await fetch(`/api/admin/feedback/${item.id}/reply`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ restaurantId, ...payload }),
      });
      if (!res.ok) { setErr("Échec de l'envoi — réessaie."); return; }
      setText("");
      router.refresh();
    } catch {
      setErr("Erreur réseau — réessaie.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="bg-white rounded-2xl border border-gray-100 p-4 space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-sm font-semibold text-gray-900">
          {isInc ? "🙋 Signalement" : `💛 ${item.authorName ?? "Un membre"}`}
        </span>
        <span className="text-xs text-gray-400">{item.weekday} · {item.slot}</span>
      </div>

      {isInc && item.dimensions.length > 0 && (
        <p className="text-xs text-gray-500">{item.dimensions.map((d) => DIMENSION_LABELS[d]).join(" · ")}</p>
      )}
      {item.comment && <p className="text-sm text-gray-700">« {item.comment} »</p>}

      <div className="flex items-center gap-2">
        <span className="inline-block rounded-full bg-gray-100 px-2 py-0.5 text-xs text-gray-500">
          {item.status === "new" ? "Nouveau" : item.status === "acknowledged" ? "Répondu" : "Réglé"}
        </span>
        {isInc && !item.contactOptIn && (
          <span className="text-xs text-gray-400">Le membre n&apos;a pas demandé de réponse</span>
        )}
      </div>

      {item.messages.length > 0 && (
        <div className="space-y-2 border-t border-gray-100 pt-2">
          {item.messages.map((m) => (
            <div
              key={m.id}
              className={`rounded-xl px-3 py-2 text-sm ${m.sender === "establishment" ? "bg-brand-red/5 text-gray-800" : "bg-gray-100 text-gray-700"}`}
            >
              <span className="block text-xs text-gray-400 mb-0.5">{m.sender === "establishment" ? "Toi" : "Le membre"}</span>
              {m.body}
            </div>
          ))}
        </div>
      )}

      <div className="flex gap-2 pt-1">
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder={isInc ? "Répondre au membre…" : "Remercier…"}
          className="flex-1 rounded-xl border border-gray-200 px-3 py-2 text-sm"
        />
        <button
          type="button"
          onClick={() => act({ body: text })}
          disabled={busy || !text.trim()}
          className="rounded-xl bg-brand-red text-white px-4 text-sm disabled:opacity-40"
        >
          Envoyer
        </button>
        {isInc && item.status !== "resolved" && (
          <button
            type="button"
            onClick={() => act({ resolve: true })}
            disabled={busy}
            className="rounded-xl border border-gray-200 px-3 text-sm text-gray-600"
          >
            Réglé
          </button>
        )}
      </div>
      {err && <p className="text-xs text-red-600">{err}</p>}
    </div>
  );
}
