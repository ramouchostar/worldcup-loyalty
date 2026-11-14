// L'encart « Ta pub » de l'accueil de la console (page Stats de la vue simple).
// Maquette validée par Mehdi le 2026-11-14 : https://claude.ai/artifact/BoJGNvQinHZVJMorWpiAyC
// Logique pure, sans base : la lecture vit dans lib/ads/requests.ts (listRequests).
// Euros permis : c'est la dépense du restaurateur, en console (ADR 0007 ne protège que le membre).

import type { RequestStatus } from "./meta-spec";

export type DailyAdStat = { spend_cents: number; results: number; reach: number; clicks: number };

/**
 * Personnes touchées par une campagne. Meta compte des personnes UNIQUES sur toute la durée
 * (`ad_campaigns.lifetime.reach`, relu chaque nuit par lib/ads/sync.ts) ; additionner la portée
 * jour par jour compte deux fois la personne qui revoit la pub le lendemain (Houba, 2026-11-14 :
 * 12 132 additionnées contre 11 634 uniques). La somme ne sert que si le total n'est pas encore lu.
 */
export function campaignReach(
  daily: DailyAdStat[],
  lifetime: { reach?: unknown } | null | undefined,
): { reach: number; source: "meta" | "jours" } {
  const total = typeof lifetime?.reach === "number" && Number.isFinite(lifetime.reach) ? lifetime.reach : null;
  if (total !== null && total > 0) return { reach: Math.round(total), source: "meta" };
  return { reach: daily.reduce((n, d) => n + d.reach, 0), source: "jours" };
}

/**
 * Le résultat d'une campagne selon son objectif. En notoriété, le résultat EST la portée :
 * il prend donc le même total unique. Les clics et les vues s'additionnent jour par jour.
 */
export function campaignResults(objective: string, daily: DailyAdStat[], reach: number): number {
  if (objective === "NOTORIETE") return reach;
  return daily.reduce((n, d) => n + d.results, 0);
}

/** La phrase sous le grand chiffre de l'encart. */
export const HOME_RESULT_LINE: Record<string, string> = {
  NOTORIETE: "personnes autour du resto ont vu ta pub",
  TRAFIC: "clics vers ton resto",
  VIDEO: "vues de ta vidéo",
};

/** Ce dont l'encart a besoin d'une demande de pub (un sous-ensemble de RequestView). */
export type PubCardSource = {
  id: string;
  status: RequestStatus;
  objective: string;
  objectiveLabel: string;
  resultLabel: string;
  radiusKm: number | null;
  endsOn: string | null;
  creative: { thumbnail?: string | null } | null;
  results: number;
  paidCents: number;
  spentCents: number;
  offerKeyword: string | null;
  offerTo: string | null;
};

export type PubHomeCard = {
  id: string;
  href: string;
  statusLabel: string;
  /** Teinte de la pastille (BadgeTone de components/admin/ui). */
  statusTone: "good" | "neutral";
  title: string;
  /** « 3 km autour · jusqu'au 27 nov. » */
  where: string;
  thumbnail: string | null;
  results: number;
  resultLine: string;
  spentCents: number;
  paidCents: number;
  remainingCents: number;
  /** Le mot clé de l'offre tant qu'elle court ; null sinon. */
  keyword: string | null;
};

const dateFr = (d: string) =>
  new Date(`${d}T12:00:00Z`).toLocaleDateString("fr-BE", { day: "numeric", month: "short", timeZone: "UTC" });

/**
 * Les encarts à montrer : une pub en diffusion ou en pause, rien d'autre (une pub demandée,
 * payée ou terminée garde sa place sur la page Pub). Sans pub en cours, aucun encart.
 */
export function pubHomeCards(requests: PubCardSource[], opts: { restaurantId: string; today: string }): PubHomeCard[] {
  return requests
    .filter((r) => r.status === "en_diffusion" || r.status === "en_pause")
    .map((r) => {
      const where = [r.radiusKm ? `${r.radiusKm} km autour` : null, r.endsOn ? `jusqu'au ${dateFr(r.endsOn)}` : null]
        .filter(Boolean)
        .join(" · ");
      const keyword = r.offerKeyword?.trim() && (!r.offerTo || r.offerTo >= opts.today) ? r.offerKeyword.trim() : null;
      return {
        id: r.id,
        href: `/admin/${opts.restaurantId}/pub`,
        statusLabel: r.status === "en_diffusion" ? "En diffusion" : "En pause",
        statusTone: r.status === "en_diffusion" ? "good" : "neutral",
        title: r.objectiveLabel,
        where,
        thumbnail: r.creative?.thumbnail ?? null,
        results: r.results,
        resultLine: HOME_RESULT_LINE[r.objective] ?? r.resultLabel,
        spentCents: r.spentCents,
        paidCents: r.paidCents,
        remainingCents: Math.max(0, r.paidCents - r.spentCents),
        keyword,
      };
    });
}
