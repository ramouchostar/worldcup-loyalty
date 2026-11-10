import type { Plan } from "../entitlements";
import { chloeIdeas, loadChloeInput } from "./chloe";
import { caReminderIdea, loadChloeCaInput } from "./chloe-ca";
import { giftToAddIdea, loadLeaGiftInput, loadLeaTicketsInput, ticketsToVerifyIdea } from "./lea";
import { lapsedIdea, loadHugoInput } from "./hugo";
import { loadEmmaDecision } from "./emma";
import { loadMaxDecision } from "./max";
import { loadLouisDecision } from "./louis";
import { recordIdeas, type RecordResult } from "./proposals";
import type { AssistantId, Idea } from "./types";

// Le passage du matin d'un établissement (ADR 0089, Brigade 05) : chaque
// générateur de la brigade lit ses données et propose ses idées ; la couche
// des idées (proposals.ts) décide lesquelles se montrent (forfait, doublon,
// refus appris, plafond de 3) et les enregistre.
//
// Un générateur qui tombe n'empêche jamais les autres : son erreur est rendue
// dans le rapport (la trace, ADR 0065), jamais avalée. Un générateur qui ne
// propose rien dit pourquoi quand il le sait (`reason`).

export type GeneratorContext = { restaurantId: string; todayISO: string; nowMs: number };
/** `trace` : les chiffres que le générateur veut laisser dans le rapport du passage (ex. jetons, brouillons écartés). */
export type GeneratorOutput = { ideas: Idea[]; reason?: string | null; trace?: Record<string, number | string> };
export type Generator = { id: string; assistant: AssistantId; run: (ctx: GeneratorContext) => Promise<GeneratorOutput> };

const one = (idea: Idea | null): GeneratorOutput => ({ ideas: idea ? [idea] : [] });

/** Les générateurs livrés (Omar, Brigades 07 à 11 et 14). Un nouveau s'ajoute ici. */
export const GENERATORS: Generator[] = [
  { id: "chloe", assistant: "chloe", run: async (c) => ({ ideas: chloeIdeas(await loadChloeInput(c.restaurantId, c.todayISO)) }) },
  { id: "chloe-ca", assistant: "chloe", run: async (c) => one(caReminderIdea(await loadChloeCaInput(c.restaurantId, c.todayISO))) },
  { id: "lea-tickets", assistant: "lea", run: async (c) => one(ticketsToVerifyIdea(await loadLeaTicketsInput(c.restaurantId, c.todayISO, c.nowMs))) },
  { id: "lea-cadeau", assistant: "lea", run: async (c) => one(giftToAddIdea(await loadLeaGiftInput(c.restaurantId, c.todayISO))) },
  { id: "hugo", assistant: "hugo", run: async (c) => one(lapsedIdea(await loadHugoInput(c.restaurantId, c.nowMs))) },
  {
    id: "emma",
    assistant: "emma",
    run: async (c) => {
      const d = await loadEmmaDecision(c.restaurantId, false, c.todayISO);
      return { ideas: d.idea ? [d.idea] : [], reason: d.reason };
    },
  },
  {
    id: "max",
    assistant: "max",
    run: async (c) => {
      const d = await loadMaxDecision(c.restaurantId, c.todayISO, c.nowMs);
      return { ideas: d.ideas, reason: d.reason };
    },
  },
  {
    // Brigade 13 : trois brouillons de réponse aux avis Google, écrits par Claude (un seul appel, seulement s'il y a des avis à traiter).
    id: "louis",
    assistant: "louis",
    run: async (c) => {
      const d = await loadLouisDecision(c.restaurantId, c.todayISO, c.nowMs);
      return { ideas: d.idea ? [d.idea] : [], reason: d.reason, trace: d.trace };
    },
  },
];

export type GeneratorReport = { id: string; assistant: AssistantId; ideas: number; reason?: string | null; trace?: Record<string, number | string>; error?: string };

/** Fait tourner chaque générateur, chacun isolé des autres (pur hors des générateurs eux-mêmes). */
export async function generateAll(ctx: GeneratorContext, generators: Generator[] = GENERATORS): Promise<{ ideas: Idea[]; report: GeneratorReport[] }> {
  const settled = await Promise.allSettled(generators.map((g) => g.run(ctx)));
  const ideas: Idea[] = [];
  const report: GeneratorReport[] = settled.map((s, i) => {
    const g = generators[i];
    if (s.status === "rejected") {
      const error = s.reason instanceof Error ? s.reason.message : String(s.reason);
      console.error(`[brigade] ${g.id} (${ctx.restaurantId}) :`, error);
      return { id: g.id, assistant: g.assistant, ideas: 0, error };
    }
    ideas.push(...s.value.ideas);
    return {
      id: g.id,
      assistant: g.assistant,
      ideas: s.value.ideas.length,
      ...(s.value.reason ? { reason: s.value.reason } : {}),
      ...(s.value.trace && Object.keys(s.value.trace).length > 0 ? { trace: s.value.trace } : {}),
    };
  });
  return { ideas, report };
}

export type BrigadeRun = { restaurantId: string; generators: GeneratorReport[]; recorded: RecordResult };

/** Le passage complet d'un établissement : générer, puis enregistrer ce qui se montre. */
export async function runBrigade(restaurantId: string, plan: Plan, ctx: { todayISO: string; nowMs: number }, generators: Generator[] = GENERATORS): Promise<BrigadeRun> {
  const { ideas, report } = await generateAll({ restaurantId, ...ctx }, generators);
  const recorded = await recordIdeas(restaurantId, ideas, { plan, nowMs: ctx.nowMs });
  return { restaurantId, generators: report, recorded };
}
