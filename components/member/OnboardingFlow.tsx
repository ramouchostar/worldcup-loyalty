"use client";

import { useRef, useState } from "react";
import { useParams } from "next/navigation";
import { TeamRecognitionPrompt, type PromptSuggestion } from "./TeamRecognitionPrompt";

// Étape 08 (backlog onboarding) — les modales PWA/push et le tour guidé ont
// quitté l'arrivée au dashboard : l'app et les notifications se proposent en
// UNE feuille, après le premier ticket validé (PostTicketSheet, montée sur
// l'écran de succès du scan). Il ne reste ici que la question d'équipe
// (ADR 0031), pilotée par l'état serveur — jamais par localStorage, pour
// survivre au changement d'appareil.
export function OnboardingFlow({
  teamPrompt = null,
}: {
  // Propositions de communautés dues pour ce membre (ADR 0031) — calculées
  // côté serveur, null si le membre a déjà une équipe, si la relance n'est pas
  // échue, ou si l'établissement n'a rien déclaré.
  teamPrompt?: { suggestions: PromptSuggestion[] } | null;
}) {
  const { restaurantId } = useParams<{ restaurantId: string }>();
  // Figées au montage : elles doivent survivre au router.refresh() déclenché
  // par l'adhésion (le serveur ne les renvoie plus ensuite).
  const suggestionsRef = useRef(teamPrompt?.suggestions ?? []);
  const [done, setDone] = useState(false);

  if (done || suggestionsRef.current.length === 0) return null;

  return (
    <TeamRecognitionPrompt
      restaurantId={restaurantId}
      suggestions={suggestionsRef.current}
      onDone={() => setDone(true)}
    />
  );
}
