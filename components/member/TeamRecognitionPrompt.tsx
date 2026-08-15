"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { teamTypeEmoji } from "@/lib/team-suggestions";
import { track } from "@/lib/analytics";
import type { TeamType } from "@/types";

// ADR 0031 — « Te reconnais-tu dans une de ces équipes ? »
//
// UN SEUL écran : les 4 propositions sont affichées ensemble et le membre tape
// la sienne. La version en enchaînement oui/non demandait jusqu'à 3 décisions
// pour arriver au même endroit — c'est trois fois plus d'occasions
// d'abandonner en plein onboarding, et la reconnaissance est immédiate : on
// voit son école dans une liste, on ne délibère pas dessus.
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
  const [phase, setPhase] = useState<Phase>("asking");
  const [busy, setBusy] = useState<string | null>(null); // id en cours, ou "none"
  const [error, setError] = useState<string | null>(null);
  const [joined, setJoined] = useState<{ name: string; captain: boolean } | null>(null);

  async function respond(
    action: "join" | "decline" | "later",
    payload: { suggestionId?: string; suggestionIds?: string[] } = {}
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

  // « Aucune de ces équipes » : on mémorise les propositions vues comme
  // refusées pour que la relance en montre d'autres, jamais les mêmes.
  async function declineAll() {
    if (busy) return;
    setBusy("none");
    setError(null);
    try {
      await respond("decline", { suggestionIds: suggestions.map((s) => s.id) });
    } catch {
      /* la relance retombera au prochain passage — sans blocage du parcours */
    }
    track("team_declined", { suggestions_shown: suggestions.length });
    setBusy(null);
    setPhase("none");
  }

  // Toute sortie sans équipe arme la relance à une semaine (côté serveur, pas
  // localStorage : la question doit revenir même sur un autre appareil).
  async function leave(destination?: string) {
    if (busy) return;
    setBusy("leave");
    try {
      await respond("later");
    } catch {
      /* la relance retombera au prochain passage — sans blocage du parcours */
    }
    setBusy(null);
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
  if (phase === "none" || suggestions.length === 0) {
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
              disabled={!!busy}
              className="w-full bg-brand-dark text-white font-bold py-3.5 rounded-2xl hover:bg-gray-800 transition-colors disabled:opacity-50"
            >
              Voir toutes les équipes →
            </button>
            <button
              onClick={() => leave()}
              disabled={!!busy}
              className="w-full text-gray-400 text-sm py-2 hover:text-gray-600 transition-colors"
            >
              Plus tard — on m&apos;en reparle dans une semaine
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ── Question — une seule liste, un seul tap ─────────────────────────────
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

        {error && (
          <p className="text-red-600 text-xs bg-red-50 px-3 py-2 rounded-lg mb-3">{error}</p>
        )}

        <div className="space-y-2 mb-4">
          {suggestions.map((s) => (
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

        <div className="space-y-2">
          <button
            onClick={declineAll}
            disabled={!!busy}
            className="w-full bg-gray-100 text-gray-700 font-semibold py-3 rounded-2xl hover:bg-gray-200 transition-colors disabled:opacity-50"
          >
            Aucune de ces équipes
          </button>
          <button
            onClick={() => leave()}
            disabled={!!busy}
            className="w-full text-gray-400 text-xs py-1.5 hover:text-gray-600 transition-colors"
          >
            Passer
          </button>
        </div>
      </div>
    </div>
  );
}
