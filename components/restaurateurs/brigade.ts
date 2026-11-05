import { ASSISTANTS, type Assistant, type AssistantId } from "@/lib/agents/types";
import type { Plan } from "@/lib/entitlements";

// La brigade sur la landing (Brigade 17, maquette validée par Mehdi le
// 2026-11-04, ADR 0089). Prénoms, postes, forfaits et portraits viennent du
// contrat `ASSISTANTS` : un seul endroit. Ce fichier n'ajoute que ce que la
// landing en dit : l'ordre, la page de chaque poste, et ce qui est en pilote.
//
// Vérité au 2026-11-05 (ADR 0070 : jamais une fonction non livrée au présent) :
// Nina (site, ADR 0088) et Max (Google) sont en pilote dans le Pro ; Louis
// répond aux avis avec l'équipe, sans publication automatique.

export type LandingAssistant = Assistant & {
  /** Page publique qui détaille son poste (registre lib/marketing-pages.ts). */
  href: string;
  /** En pilote : présenté comme tel, jamais comme disponible. */
  pilot: boolean;
};

const ORDER: { id: AssistantId; href: string; pilot?: boolean }[] = [
  { id: "lea", href: "/programme-fidelite-restaurant" },
  { id: "hugo", href: "/relancer-vos-clients" },
  { id: "chloe", href: "/chiffre-affaires-restaurant" },
  { id: "emma", href: "/publicite-restaurant" },
  { id: "louis", href: "/analyse-avis-google-restaurant" },
  { id: "nina", href: "/#site", pilot: true },
  { id: "max", href: "/visibilite-restaurant", pilot: true },
];

export const BRIGADE: LandingAssistant[] = ORDER.map(({ id, href, pilot = false }) => ({
  ...ASSISTANTS[id],
  href,
  pilot,
}));

export const PLAN_LABEL: Record<Plan, string> = {
  gratuit: "Gratuit",
  croissance: "Croissance",
  pro: "Pro",
};

export const assistant = (id: AssistantId) => BRIGADE.find((a) => a.id === id)!;
