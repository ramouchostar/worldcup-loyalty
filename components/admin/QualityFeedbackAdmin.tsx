"use client";

import { useState } from "react";
import { Hand, Heart, Lock, TriangleAlert } from "lucide-react";
import { useRouter } from "next/navigation";
import { DIMENSION_LABELS } from "@/lib/feedback-constants";
import { RequestPlanButton } from "@/components/admin/Paywall";
import type { AdminFeedbackItem, Barometer } from "@/types";

// ADR 0023 §8 — le baromètre est un ÉTAT + une TENDANCE + une DÉCOMPOSITION,
// jamais une note chiffrée. « Pas assez de signaux » sous le seuil.
const STATE = {
  good: { dot: "bg-good", label: "Bonne dynamique", cls: "text-good bg-good/10 border-good/30" },
  watch: { dot: "bg-warn", label: "À surveiller", cls: "text-warn bg-warn/10 border-warn/30" },
  tense: { dot: "bg-danger", label: "Tendu", cls: "text-danger bg-danger/10 border-danger/30" },
  insufficient: { dot: "bg-ink-faint", label: "Pas assez de signaux", cls: "text-ink-body bg-paper border-paper-border" },
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
      <div className={`rounded-xl border p-5 ${st.cls}`}>
        <div className="flex items-center justify-between">
          <span className="text-lg font-bold flex items-center gap-2">
            <span className={`w-2.5 h-2.5 rounded-full ${st.dot}`} aria-hidden="true" />
            {st.label}
          </span>
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
              <span className="inline-flex items-center gap-1"><Heart size={13} strokeWidth={1.8} aria-hidden="true" />{barometer.encouragements} encouragement{barometer.encouragements > 1 ? "s" : ""}</span>
              <span className="inline-flex items-center gap-1"><Hand size={13} strokeWidth={1.8} aria-hidden="true" />{barometer.incidents} signalement{barometer.incidents > 1 ? "s" : ""}</span>
              {barometer.unresolved > 0 && <span className="font-semibold inline-flex items-center gap-1"><TriangleAlert size={13} strokeWidth={1.8} aria-hidden="true" />{barometer.unresolved} sans réponse</span>}
            </div>
            {advancedLocked ? (
              <div className="mt-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2 bg-white/70 border border-paper-border rounded-xl px-3 py-2.5">
                <p className="text-xs text-ink-body">
                  <Lock size={13} strokeWidth={1.8} className="inline-block mr-1 -mt-0.5" aria-hidden="true" />
                La <strong>tendance</strong> et les <strong>axes récurrents</strong> font
                  partie du baromètre avancé (plan Croissance).
                </p>
                <RequestPlanButton
                  restaurantId={restaurantId}
                  feature="barometer_advanced"
                  requiredPlan="croissance"
                  className="bg-brand-dark text-white px-3 py-1.5 rounded-lg text-xs font-bold hover:bg-ink transition-colors shrink-0"
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
        <h2 className="font-semibold text-ink">
          Signalements{incidents.length > 0 && <span className="text-ink-faint font-normal"> ({incidents.length})</span>}
        </h2>
        {incidents.length === 0 ? (
          <p className="text-sm text-ink-muted">Aucun signalement — profites-en.</p>
        ) : (
          incidents.map((it) => <AdminCard key={it.id} restaurantId={restaurantId} item={it} />)
        )}
      </section>

      {/* Encouragements */}
      {encouragements.length > 0 && (
        <section className="space-y-3">
          <h2 className="font-semibold text-ink">
            Encouragements <span className="text-ink-faint font-normal">({encouragements.length})</span>
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
    <div className="bg-white rounded-xl border border-paper-border p-4 space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-sm font-semibold text-ink">
          {isInc ? (
                        <span className="inline-flex items-center gap-1"><Hand size={12} strokeWidth={1.8} aria-hidden="true" />Signalement</span>
                      ) : (
                        <span className="inline-flex items-center gap-1"><Heart size={12} strokeWidth={1.8} aria-hidden="true" />{item.authorName ?? "Un membre"}</span>
                      )}
        </span>
        <span className="text-xs text-ink-faint">{item.weekday} · {item.slot}</span>
      </div>

      {isInc && item.dimensions.length > 0 && (
        <p className="text-xs text-ink-muted">{item.dimensions.map((d) => DIMENSION_LABELS[d]).join(" · ")}</p>
      )}
      {item.comment && <p className="text-sm text-ink-body">« {item.comment} »</p>}

      <div className="flex items-center gap-2">
        <span className="inline-block rounded-full bg-paper-subtle px-2 py-0.5 text-xs text-ink-muted">
          {item.status === "new" ? "Nouveau" : item.status === "acknowledged" ? "Répondu" : "Réglé"}
        </span>
        {isInc && !item.contactOptIn && (
          <span className="text-xs text-ink-faint">Le membre n&apos;a pas demandé de réponse</span>
        )}
      </div>

      {item.messages.length > 0 && (
        <div className="space-y-2 border-t border-paper-border pt-2">
          {item.messages.map((m) => (
            <div
              key={m.id}
              className={`rounded-xl px-3 py-2 text-sm ${m.sender === "establishment" ? "bg-brand-red/5 text-ink" : "bg-paper-subtle text-ink-body"}`}
            >
              <span className="block text-xs text-ink-faint mb-0.5">{m.sender === "establishment" ? "Toi" : "Le membre"}</span>
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
          className="flex-1 rounded-xl border border-paper-border px-3 py-2 text-sm"
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
            className="rounded-xl border border-paper-border px-3 text-sm text-ink-body"
          >
            Réglé
          </button>
        )}
      </div>
      {err && <p className="text-xs text-danger">{err}</p>}
    </div>
  );
}
