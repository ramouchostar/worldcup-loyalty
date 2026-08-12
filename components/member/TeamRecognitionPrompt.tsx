"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { teamTypeEmoji } from "@/lib/team-suggestions";
import type { TeamType } from "@/types";

// ADR 0031 — « Te reconnais-tu dans une de ces équipes ? »
//
// Question d'identité, pas de stratégie : on ne montre NI points NI nombre de
// membres. Le membre reconnaît une appartenance qu'il a déjà (son école, son
// boulot), il ne compare pas des scores. Afficher un classement ici
// transformerait le choix en chasse au score et casserait le recrutement.
//
// Aucune sortie ne fait culpabiliser : sans équipe, la couche solo (ADR 0006)
// reste entièrement acquise — et c'est dit explicitement.

export type PromptSuggestion = {
  id: string;
  name: string;
  type: TeamType;
  zone: string | null;
};

type Phase = "asking" | "joined" | "none";

export function TeamRecognitionPrompt({
  restaurantId,
  suggestions,
  onDone,
}: {
  restaurantId: string;
  suggestions: PromptSuggestion[];
  onDone: () => void;
}) {
  const router = useRouter();
  const [index, setIndex] = useState(0);
  const [phase, setPhase] = useState<Phase>("asking");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [joined, setJoined] = useState<{ name: string; captain: boolean } | null>(null);

  const current = suggestions[index];

  async function respond(action: "join" | "decline" | "later", suggestionId?: string) {
    const res = await fetch("/api/teams/suggestions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ restaurantId, action, suggestionId }),
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(body.error ?? "Erreur. Réessaie.");
    return body as { team?: { name: string }; becameCaptain?: boolean };
  }

  async function say(action: "join" | "decline") {
    if (!current || busy) return;
    setBusy(true);
    setError(null);
    try {
      const body = await respond(action, current.id);
      if (action === "join") {
        setJoined({ name: body.team?.name ?? current.name, captain: !!body.becameCaptain });
        setPhase("joined");
        router.refresh();
      } else if (index + 1 < suggestions.length) {
        setIndex(index + 1);
      } else {
        setPhase("none");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur réseau. Réessaie.");
    } finally {
      setBusy(false);
    }
  }

  // Toute sortie sans équipe arme la relance à une semaine (côté serveur, pas
  // localStorage : la question doit revenir même sur un autre appareil).
  async function leave(destination?: string) {
    if (busy) return;
    setBusy(true);
    try {
      await respond("later");
    } catch {
      /* la relance retombera au prochain passage — sans blocage du parcours */
    }
    setBusy(false);
    if (destination) router.push(destination);
    onDone();
  }

  const shell = "fixed inset-0 z-50 flex items-end justify-center p-4 bg-black/60 backdrop-blur-sm";
  const card = "w-full max-w-sm bg-white rounded-3xl p-6 shadow-2xl";

  // ── Adhésion réussie ────────────────────────────────────────────────────
  if (phase === "joined" && joined) {
    return (
      <div className={shell}>
        <div className={card}>
          <div className="text-center mb-5">
            <p className="text-4xl mb-3">🎉</p>
            <h2 className="text-xl font-black text-gray-900">Te voilà dans {joined.name} !</h2>
            {joined.captain ? (
              <p className="text-gray-500 text-sm mt-2 leading-relaxed">
                Tu es le tout premier — tu en deviens le{" "}
                <span className="font-bold text-gray-800">capitaine</span>. Invite
                les autres, c&apos;est là que ça devient intéressant.
              </p>
            ) : (
              <p className="text-gray-500 text-sm mt-2 leading-relaxed">
                Chaque commande de l&apos;équipe fait grandir vos cadeaux communs.
              </p>
            )}
          </div>
          <div className="space-y-2">
            <button
              onClick={() => {
                router.push(`/r/${restaurantId}/my-team`);
                onDone();
              }}
              className="w-full bg-brand-red text-white font-bold py-3.5 rounded-2xl hover:bg-brand-red/85 transition-colors"
            >
              {joined.captain ? "Inviter mon équipe →" : "Voir mon équipe →"}
            </button>
            <button
              onClick={onDone}
              className="w-full text-gray-400 text-sm py-2 hover:text-gray-600 transition-colors"
            >
              Plus tard
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ── Aucune reconnaissance : surtout pas d'exclusion ─────────────────────
  if (phase === "none" || !current) {
    return (
      <div className={shell}>
        <div className={card}>
          <div className="text-center mb-5">
            <p className="text-4xl mb-3">👍</p>
            <h2 className="text-xl font-black text-gray-900">Pas de souci</h2>
            <p className="text-gray-500 text-sm mt-2 leading-relaxed">
              Tu peux continuer <span className="font-bold text-gray-800">sans équipe</span> :
              tes cadeaux personnels tombent à chaque commande, équipe ou pas.
              Une équipe ajoute simplement des cadeaux en plus quand vous
              commandez à plusieurs.
            </p>
          </div>
          <div className="space-y-2">
            <button
              onClick={() => leave(`/r/${restaurantId}/my-team`)}
              disabled={busy}
              className="w-full bg-brand-dark text-white font-bold py-3.5 rounded-2xl hover:bg-gray-800 transition-colors disabled:opacity-50"
            >
              Voir toutes les équipes →
            </button>
            <button
              onClick={() => leave()}
              disabled={busy}
              className="w-full text-gray-400 text-sm py-2 hover:text-gray-600 transition-colors"
            >
              Plus tard — on m&apos;en reparle dans une semaine
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ── Question ────────────────────────────────────────────────────────────
  return (
    <div className={shell}>
      <div className={card}>
        <div className="text-center mb-5">
          <h2 className="text-xl font-black text-gray-900">
            Te reconnais-tu dans une de ces équipes ?
          </h2>
          <p className="text-gray-500 text-sm mt-2 leading-relaxed">
            Une équipe, c&apos;est simplement des gens qui se connaissent déjà —
            même école, même boulot, même quartier.
          </p>
        </div>

        <div className="bg-gray-50 rounded-2xl p-6 mb-5 text-center">
          <p className="text-5xl mb-3" aria-hidden="true">{teamTypeEmoji(current.type)}</p>
          <p className="text-lg font-bold text-gray-900 leading-snug">{current.name}</p>
          {current.zone && <p className="text-xs text-gray-400 mt-1">📍 {current.zone}</p>}
        </div>

        {error && (
          <p className="text-red-600 text-xs bg-red-50 px-3 py-2 rounded-lg mb-3">{error}</p>
        )}

        <div className="space-y-2">
          <button
            onClick={() => say("join")}
            disabled={busy}
            className="w-full bg-brand-red text-white font-bold py-3.5 rounded-2xl hover:bg-brand-red/85 transition-colors disabled:opacity-50"
          >
            Oui, c&apos;est moi 👋
          </button>
          <button
            onClick={() => say("decline")}
            disabled={busy}
            className="w-full bg-gray-100 text-gray-700 font-semibold py-3 rounded-2xl hover:bg-gray-200 transition-colors disabled:opacity-50"
          >
            Non
          </button>
          <div className="flex items-center justify-between pt-1">
            <span className="text-xs text-gray-300 tabular-nums">
              {index + 1} / {suggestions.length}
            </span>
            <button
              onClick={() => leave()}
              disabled={busy}
              className="text-xs text-gray-400 hover:text-gray-600 transition-colors"
            >
              Passer
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
