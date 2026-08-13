// ADR 0031 — Communautés déclarées par l'établissement.
//
// Fonctions PURES uniquement (pas d'accès base) : importables côté client
// (formulaire restaurateur) comme côté serveur — même découpage que
// lib/zones.ts (pur) / lib/teams.ts (données), ADR 0018.
//
// Vocabulaire : une « suggestion » n'est PAS une équipe. C'est un nom que le
// restaurateur connaît (une école, une entreprise, un quartier) et qu'on
// propose au membre. L'équipe n'existe qu'au premier « oui ».

import { zoneKey } from "./zones";
import type { TeamType } from "@/types";

// Le restaurateur peut en déclarer jusqu'à 8 ; on n'en présente jamais plus
// de 4 à la fois au membre, toutes sur le même écran (Hick : au-delà, la liste
// devient un annuaire — et éparpiller les membres sur trop d'équipes rend les
// couches 2 et 3 inertes, ADR 0006).
export const MAX_SUGGESTIONS = 8;
export const SUGGESTIONS_PER_PROMPT = 4;

// « On lui en reparle une semaine après » — la relance ne dépend pas du
// navigateur (localStorage), elle vit sur memberships (multi-appareil).
export const PROMPT_SNOOZE_DAYS = 7;

export const SUGGESTION_MIN_LEN = 2;
export const SUGGESTION_MAX_LEN = 60;

export const SUGGESTION_TYPES: { value: TeamType; label: string; hint: string }[] = [
  { value: "ecole", label: "École", hint: "Ex : EPHEC, Athénée Royal, Institut Saint-Luc" },
  { value: "entreprise", label: "Entreprise", hint: "Ex : Alma, dépôt STIB, hôpital, administration" },
  { value: "rue_quartier", label: "Rue / quartier", hint: "Ex : Quartier Nord, Rue de Brabant" },
  { value: "taxis", label: "Taxis", hint: "Ex : chauffeurs de la station" },
  { value: "autre", label: "Autre", hint: "Club de sport, association…" },
];

// Avatar d'équipe par type — source unique (lib/teams.ts le réexporte via
// teamEmoji, les composants client l'importent directement).
export const TEAM_TYPE_EMOJI: Record<TeamType, string> = {
  ecole: "🎓",
  entreprise: "🏢",
  rue_quartier: "🏘️",
  taxis: "🚕",
  autre: "👥",
};

export function teamTypeEmoji(type: TeamType): string {
  return TEAM_TYPE_EMOJI[type] ?? "👥";
}

export type SuggestionInput = {
  name: string;
  type: TeamType;
  zone: string | null;
};

const VALID_TYPES: TeamType[] = ["ecole", "entreprise", "rue_quartier", "taxis", "autre"];

// Trim + espaces réduits ; "" si hors bornes (mêmes règles que normalizeZone).
export function normalizeSuggestionName(raw: unknown): string {
  if (typeof raw !== "string") return "";
  const clean = raw.trim().replace(/\s+/g, " ");
  if (clean.length < SUGGESTION_MIN_LEN || clean.length > SUGGESTION_MAX_LEN) return "";
  return clean;
}

// Clé de dédoublonnage — insensible à la casse et aux accents, comme les zones
// (« EPHEC » ≡ « Ephec », « Sainte-Thérèse » ≡ « Sainte-Therese »).
export function suggestionKey(name: string): string {
  return zoneKey(name);
}

// Liste saisie par le restaurateur → entrées valides, dédupliquées, plafonnées.
export function sanitizeSuggestions(list: unknown): SuggestionInput[] {
  if (!Array.isArray(list)) return [];
  const out: SuggestionInput[] = [];
  const seen = new Set<string>();
  for (const raw of list) {
    const entry = raw as { name?: unknown; type?: unknown; zone?: unknown } | null;
    const name = normalizeSuggestionName(entry?.name);
    if (!name) continue;
    const key = suggestionKey(name);
    if (seen.has(key)) continue;
    const type = VALID_TYPES.includes(entry?.type as TeamType) ? (entry!.type as TeamType) : "autre";
    const rawZone = typeof entry?.zone === "string" ? entry.zone.trim().replace(/\s+/g, " ") : "";
    seen.add(key);
    out.push({ name, type, zone: rawZone || null });
    if (out.length >= MAX_SUGGESTIONS) break;
  }
  return out;
}

export type PromptCandidate = {
  id: string;
  name: string;
  type: TeamType;
  zone: string | null;
};

// Mélange de Fisher-Yates — le membre voit des propositions dans un ordre
// aléatoire, JAMAIS classées par score ou par popularité : afficher « l'équipe
// qui va bientôt franchir un palier » transformerait le choix identitaire en
// chasse au score et casserait le moteur de recrutement (ADR 0031 §5).
function shuffle<T>(list: T[], rng: () => number): T[] {
  const out = [...list];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

// Sélection des propositions d'un tour de question.
// Priorité aux communautés situées dans une zone déclarée du membre (ADR 0018),
// aléatoire à l'intérieur de chaque groupe.
export function pickPromptCandidates(
  candidates: PromptCandidate[],
  memberZones: string[],
  declinedIds: string[],
  limit: number = SUGGESTIONS_PER_PROMPT,
  rng: () => number = Math.random
): PromptCandidate[] {
  const declined = new Set(declinedIds);
  const eligible = candidates.filter((c) => !declined.has(c.id));
  const zoneKeys = new Set(memberZones.map(zoneKey));
  const inZone = eligible.filter((c) => c.zone && zoneKeys.has(zoneKey(c.zone)));
  const rest = eligible.filter((c) => !(c.zone && zoneKeys.has(zoneKey(c.zone))));
  return [...shuffle(inZone, rng), ...shuffle(rest, rng)].slice(0, limit);
}
