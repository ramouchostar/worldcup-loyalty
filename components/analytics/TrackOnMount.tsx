"use client";

import { useEffect, useRef } from "react";
import { track, type AnalyticsEventMap, type AnalyticsEventName } from "@/lib/analytics";

/**
 * Émet un événement à l'affichage d'une page rendue côté serveur.
 *
 * Le garde-fou `fired` est le point important : un re-rendu du parent (retour
 * arrière, `router.refresh()`, revalidation) remonterait sinon un deuxième
 * événement pour une seule vue, et gonflerait silencieusement le haut du
 * tunnel. Une vue = un événement, pour toute la durée du montage.
 */
export function TrackOnMount<K extends AnalyticsEventName>({
  event,
  params,
}: {
  event: K;
  params: AnalyticsEventMap[K];
}) {
  const fired = useRef(false);

  useEffect(() => {
    if (fired.current) return;
    fired.current = true;
    track(event, params);
    // Volontairement sans dépendances : l'événement décrit le montage, pas
    // l'état courant des props.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return null;
}
