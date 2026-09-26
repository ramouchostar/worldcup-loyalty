// ADR 0071 — forme du score rapide, partagée entre le serveur (qui l'écrit
// dans audit_leads.scan) et la page publique (qui l'affiche). Aucun import
// serveur ici : ce fichier part aussi dans le navigateur.

import type { QuickVolet, Verdict } from "./quick-score";

export type StepKey = "voisins" | "fiche" | "avis" | "photos" | "site" | "mobile";
export const STEP_ORDER: StepKey[] = ["voisins", "fiche", "avis", "photos", "site", "mobile"];

/** « sans_objet » : rien à lire (pas de site, pas de photo) — l'étape se coche quand même. */
export type StepState = "en_cours" | "ok" | "echec" | "sans_objet";

export interface QuickCheck {
  label: string;
  ok: boolean;
  detail?: string;
}

export interface QuickScan {
  steps?: Partial<Record<StepKey, StepState>>;
  place?: {
    name: string;
    address: string | null;
    category: string | null;
    rating: number | null;
    reviewsCount: number | null;
    phone: boolean;
    website: string | null;
    openNow: boolean | null;
    hasHours: boolean;
    /** true/false = lu ; null = non vérifié (ADR 0069 : jamais affirmer un manque non lu). */
    orderButton: boolean | null;
    totalPhotos: number | null;
  };
  neighbors?: { name: string; rating: number | null; reviewsCount: number | null; dx: number; dy: number }[];
  reviews?: { initial: string; rating: number | null; when: string | null; text: string }[];
  photos?: string[];
  site?: { url: string; title: string | null; checks: QuickCheck[] } | null;
  mobile?: { speed: number | null; checks: QuickCheck[] } | null;
  ficheIssues?: string[];
  ranking?: { rank: number; of: number; ahead: string[] };
  scores?: Partial<Record<QuickVolet, number | null>> & { global?: number | null };
  verdict?: Verdict | null;
}
