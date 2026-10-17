// ADR 0085 §2 + ADR 0086 §7 — régies et objectifs d'une campagne publicitaire.
// Module PUR (importable côté client). Ajouter un objectif = une ligne ici et
// une ligne de CONTEXT.md ; un objectif absent de la liste ne bloque pas le
// rattachement, il est signalé (lib/ads/naming.ts).

export const REGIES = ["META", "TIKTOK"] as const;
export type Regie = (typeof REGIES)[number];

export const OBJECTIVES = [
  "TRAFIC",
  "NOTORIETE",
  "VIDEO",
  "MESSAGES",
  "INSCRIPTION",
  "UBEREATS",
  "DELIVEROO",
  "TAKEAWAY",
] as const;
export type Objective = (typeof OBJECTIVES)[number];

/** Ce que le restaurateur voit comme résultat de sa campagne (ADR 0086 §7). */
export const OBJECTIVE_RESULT: Record<Objective, { label: string; result: string }> = {
  TRAFIC: { label: "Des visites au restaurant", result: "clics" },
  NOTORIETE: { label: "Se faire connaître dans le quartier", result: "personnes touchées" },
  VIDEO: { label: "Faire voir une vidéo autour du resto", result: "vues" },
  MESSAGES: { label: "Recevoir des messages", result: "conversations" },
  INSCRIPTION: { label: "Des inscrits au programme de fidélité", result: "inscriptions sur la même période" },
  UBEREATS: { label: "Booster les livraisons Uber Eats", result: "clics vers le site" },
  DELIVEROO: { label: "Booster les livraisons Deliveroo", result: "clics vers le site" },
  TAKEAWAY: { label: "Booster les livraisons Takeaway", result: "clics vers le site" },
};

export function isRegie(s: string): s is Regie {
  return (REGIES as readonly string[]).includes(s);
}

export function isObjective(s: string): s is Objective {
  return (OBJECTIVES as readonly string[]).includes(s);
}
