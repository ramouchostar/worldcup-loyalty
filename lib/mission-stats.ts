// ============================================================
// Réserver un prestataire (ADR 0084 §5 undecies) — les chiffres du module, pour la plateforme.
//
// Le module vaut-il le coup ? Combien de briefs deviennent des devis, des missions menées jusqu'au bout, ce qu'elles pèsent, ce que
// Boosteats garde, où ça casse (annulations, litiges). Fonctions PURES : on reçoit des lignes, on rend des nombres. Un « entonnoir »
// compte les missions qui ONT ATTEINT une étape (d'après le journal des changements d'état), pas celles qui y sont aujourd'hui :
// une mission validée a bien été devisée.
// ============================================================

export type StatsMission = {
  id: string;
  metier: string;
  status: string;
  quoteCents: number | null;
  providerCents: number | null;
  cancelledBy: string | null;
  createdAt: string;
};

export const FUNNEL = [
  { key: "sent", label: "Briefs envoyés", reached: null },
  { key: "quoted", label: "Devis reçus", reached: ["devis", "accepte", "date_bloquee", "production", "livre", "retouche", "valide", "verse", "litige", "suspendu"] },
  { key: "accepted", label: "Devis acceptés", reached: ["accepte", "date_bloquee", "production", "livre", "retouche", "valide", "verse", "litige", "suspendu"] },
  { key: "delivered", label: "Livrées", reached: ["livre", "valide", "verse"] },
  { key: "validated", label: "Validées", reached: ["valide", "verse"] },
] as const;

export type FunnelStep = { key: string; label: string; count: number; /** Part des briefs envoyés (0 à 1), null s'il n'y en a aucun. */ share: number | null };

export type StatsBlock = {
  sent: number;
  funnel: FunnelStep[];
  cancelled: number;
  cancelledBy: Record<string, number>;
  disputes: number;
  volumeCents: number;
  providerCents: number;
  commissionCents: number;
  /** Missions validées ou versées. */
  completed: number;
};

const SENT = (m: StatsMission) => m.status !== "brief";

function block(missions: readonly StatsMission[], reached: ReadonlyMap<string, ReadonlySet<string>>): StatsBlock {
  const sent = missions.filter(SENT);
  const funnel: FunnelStep[] = FUNNEL.map((step) => {
    const count = step.reached === null ? sent.length : sent.filter((m) => step.reached.some((s) => m.status === s || reached.get(m.id)?.has(s))).length;
    return { key: step.key, label: step.label, count, share: sent.length === 0 ? null : count / sent.length };
  });
  const done = sent.filter((m) => m.status === "valide" || m.status === "verse");
  const volume = done.reduce((a, m) => a + (m.quoteCents ?? 0), 0);
  const provider = done.reduce((a, m) => a + (m.providerCents ?? 0), 0);
  const cancelledBy: Record<string, number> = {};
  for (const m of sent.filter((m) => m.status === "annule")) cancelledBy[m.cancelledBy ?? "inconnu"] = (cancelledBy[m.cancelledBy ?? "inconnu"] ?? 0) + 1;
  return {
    sent: sent.length,
    funnel,
    cancelled: sent.filter((m) => m.status === "annule").length,
    cancelledBy,
    // Un litige, c'est une mission qui y est ou y est passée.
    disputes: sent.filter((m) => m.status === "litige" || reached.get(m.id)?.has("litige")).length,
    volumeCents: volume,
    providerCents: provider,
    commissionCents: Math.max(0, volume - provider),
    completed: done.length,
  };
}

export type Stats = { all: StatsBlock; byMetier: Record<string, StatsBlock> };

export function computeStats(missions: readonly StatsMission[], reached: ReadonlyMap<string, ReadonlySet<string>>, metiers: readonly string[]): Stats {
  return {
    all: block(missions, reached),
    byMetier: Object.fromEntries(metiers.map((m) => [m, block(missions.filter((x) => x.metier === m), reached)])),
  };
}

export const percent = (share: number | null): string => (share === null ? "—" : `${Math.round(share * 100)} %`);
