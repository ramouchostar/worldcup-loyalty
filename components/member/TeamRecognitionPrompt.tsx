"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { teamTypeEmoji } from "@/lib/team-suggestions";
import { track } from "@/lib/analytics";
import type { TeamType } from "@/types";

// ADR 0031, refondu par l'étape 10/10 du backlog onboarding :
//
// - Posée APRÈS le premier ticket VALIDÉ (écran de succès du scan), plus à
//   l'arrivée sur le dashboard : le membre vient de gagner quelque chose, la
//   question se justifie par le GAIN (« ton cadeau peut doubler »), plus par
//   l'identité seule.
// - TROIS propositions maximum, affichées ensemble, un seul tap.
// - UNE SEULE sortie : « Plus tard — mon cadeau reste acquis » (relance à une
//   semaine côté serveur, jamais localStorage — la question doit revenir même
//   sur un autre appareil). Le refus définitif n'existe plus ici : la liste
//   complète reste explorable sur « Mon équipe ».
// - Jamais posée dans un établissement où les équipes sont masquées
//   (restaurants.teams_hidden — filtré en amont par getTeamPrompt).
//
// Question de gain, pas de stratégie : on ne montre NI points NI nombre de
// membres — le membre reconnaît une appartenance, il ne compare pas des
// scores (afficher un classement ici casserait le recrutement).

export type PromptSuggestion = {
  id: string;
  name: string;
  type: TeamType;
  zone: string | null;
};

const MAX_SUGGESTIONS = 3;

type Phase = "asking" | "joined";

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
  const [phase, setPhase] = useState<Phase>("asking");
  const [busy, setBusy] = useState<string | null>(null); // id en cours, ou "leave"
  const [error, setError] = useState<string | null>(null);
  const [joined, setJoined] = useState<{ name: string; captain: boolean } | null>(null);

  const shown = suggestions.slice(0, MAX_SUGGESTIONS);
  if (shown.length === 0) return null;

  async function respond(
    action: "join" | "later",
    payload: { suggestionId?: string } = {}
  ) {
    const res = await fetch("/api/teams/suggestions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ restaurantId, action, ...payload }),
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(body.error ?? "Erreur. Réessaie.");
    return body as { team?: { name: string }; becameCaptain?: boolean };
  }

  async function pick(suggestion: PromptSuggestion) {
    if (busy) return;
    setBusy(suggestion.id);
    setError(null);
    try {
      const body = await respond("join", { suggestionId: suggestion.id });
      // Le *type* d'équipe suffit à l'analyse (école, entreprise, quartier) ;
      // le nom est une donnée d'établissement, il ne sort pas vers Google.
      track("team_joined", { join_source: "reconnaissance", team_type: suggestion.type });
      setJoined({ name: body.team?.name ?? suggestion.name, captain: !!body.becameCaptain });
      setPhase("joined");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur réseau. Réessaie.");
    } finally {
      setBusy(null);
    }
  }

  // Sortie unique — arme la relance à une semaine (côté serveur).
  async function later() {
    if (busy) return;
    setBusy("leave");
    try {
      await respond("later");
    } catch {
      /* la relance retombera au prochain passage — sans blocage du parcours */
    }
    track("team_declined", { suggestions_shown: shown.length });
    setBusy(null);
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

  // ── Question — formulée par le GAIN, trois choix, une sortie ────────────
  return (
    <div className={shell}>
      <div className={card}>
        <div className="text-center mb-5">
          <p className="text-4xl mb-2" aria-hidden="true">🎁</p>
          <h2 className="text-xl font-black text-gray-900">Ton cadeau peut doubler</h2>
          <p className="text-gray-500 text-sm mt-2 leading-relaxed">
            En équipe, chaque commande des tiens débloque des cadeaux{" "}
            <span className="font-bold text-gray-800">en plus</span> de tes cadeaux
            perso. Tu te reconnais ?
          </p>
        </div>

        {error && (
          <p className="text-red-600 text-xs bg-red-50 px-3 py-2 rounded-lg mb-3">{error}</p>
        )}

        <div className="space-y-2 mb-4">
          {shown.map((s) => (
            <button
              key={s.id}
              onClick={() => pick(s)}
              disabled={!!busy}
              className="w-full flex items-center gap-3 p-4 rounded-2xl bg-gray-50 text-left hover:bg-gray-100 active:bg-gray-200 transition-colors disabled:opacity-50 border border-transparent hover:border-gray-200"
            >
              <span className="text-2xl shrink-0" aria-hidden="true">{teamTypeEmoji(s.type)}</span>
              <span className="flex-1 min-w-0">
                <span className="block font-bold text-gray-900 leading-snug">{s.name}</span>
                {s.zone && <span className="block text-xs text-gray-400 mt-0.5">📍 {s.zone}</span>}
              </span>
              <span className="text-brand-red font-bold text-sm shrink-0">
                {busy === s.id ? "…" : "C'est moi"}
              </span>
            </button>
          ))}
        </div>

        <button
          onClick={later}
          disabled={!!busy}
          className="w-full bg-gray-100 text-gray-700 font-semibold py-3 rounded-2xl hover:bg-gray-200 transition-colors disabled:opacity-50"
        >
          Plus tard — mon cadeau reste acquis
        </button>
      </div>
    </div>
  );
}
