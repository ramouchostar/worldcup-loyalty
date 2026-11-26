"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { readJsonSafe } from "@/lib/fetch-json";
import type { FicheView } from "@/lib/site-orders/fiche";
import { nextChange, openingRefusal, opennessAt, type OpeningRefusal, type Openness } from "@/lib/site-orders/hours";

// ADR 0108 §4 — l'état de la fiche Google vu par la page : lu à l'arrivée, relu quand l'heure annoncée est passée et
// après un refus du serveur. Chaque lecture coûte un appel Google (rien n'est gardé) : jamais de relecture à intervalle fixe.
// Sans réponse, la page n'affirme rien et laisse le serveur juger à l'envoi.

/** Au-delà d'un jour, inutile d'armer une minuterie : la page sera rouverte d'ici là. */
const MAX_TIMER_MS = 24 * 3600 * 1000;

export type FicheState = {
  /** `undefined` : la fiche se lit ; `null` : pas de réponse. */
  fiche: FicheView | null | undefined;
  openness: Openness | null;
  blocked: OpeningRefusal | null;
  /** L'heure du serveur, estimée : une horloge de téléphone déréglée ne ferme pas le restaurant. */
  now: Date;
  reload: () => void;
};

export function useFiche(restaurantId: string): FicheState {
  const [fiche, setFiche] = useState<FicheView | null | undefined>(undefined);
  const [skew, setSkew] = useState(0);
  const [, setTick] = useState(0);
  const fromApp = useRef<boolean | null>(null);
  const live = useRef(true);

  // Pas de réponse : un « ouvert » déjà lu est gardé (son heure de fermeture continue de compter, et le secours WhatsApp
  // ne s'ouvre pas après elle) ; sinon la page n'affirme plus rien.
  const noAnswer = useCallback(() => setFiche((before) => (before?.openness.state === "ouvert" ? before : null)), []);

  const reload = useCallback(() => {
    // L'arrivée depuis l'app (`?depuis=app`) se compte une fois, puis l'adresse redevient propre.
    let origin = "";
    if (fromApp.current === null) {
      const url = new URL(window.location.href);
      fromApp.current = url.searchParams.get("depuis") === "app";
      if (fromApp.current) {
        origin = "&depuis=app";
        url.searchParams.delete("depuis");
        window.history.replaceState(null, "", url.pathname + url.search);
      }
    }
    void (async () => {
      try {
        const res = await fetch(`/api/site-orders/fiche?restaurantId=${encodeURIComponent(restaurantId)}${origin}`, { cache: "no-store" });
        const { data } = await readJsonSafe<FicheView>(res);
        if (!live.current) return;
        if (!res.ok || !data?.openness) { noAnswer(); return; }
        const read = Date.parse(data.readAt);
        setSkew(Number.isFinite(read) ? read - Date.now() : 0);
        setFiche(data);
      } catch {
        if (live.current) noAnswer();
      }
    })();
  }, [restaurantId, noAnswer]);

  useEffect(() => {
    live.current = true;
    reload();
    return () => { live.current = false; };
  }, [reload]);

  // L'heure annoncée (fermeture ou ouverture) arrive : on relit. Une heure déjà passée n'arme rien (pas de boucle).
  useEffect(() => {
    if (!fiche) return;
    const at = nextChange(fiche.openness);
    if (!at) return;
    const due = Date.parse(at);
    const delay = due - (Date.now() + skew);
    if (delay <= 0 || delay > MAX_TIMER_MS) return;
    let done = false;
    const fire = () => { if (done) return; done = true; setTick((n) => n + 1); reload(); };
    const timer = window.setTimeout(fire, delay + 2000);
    // Un téléphone verrouillé suspend la minuterie : au réveil, on regarde si l'heure est passée.
    const onVisible = () => { if (document.visibilityState === "visible" && Date.now() + skew >= due) fire(); };
    document.addEventListener("visibilitychange", onVisible);
    return () => { window.clearTimeout(timer); document.removeEventListener("visibilitychange", onVisible); };
  }, [fiche, skew, reload]);

  const now = new Date(Date.now() + skew);
  const openness = fiche ? opennessAt(fiche.openness, now) : null;
  return { fiche, openness, blocked: openness ? openingRefusal(openness, now) : null, now, reload };
}
