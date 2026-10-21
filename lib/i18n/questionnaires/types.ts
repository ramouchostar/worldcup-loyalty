import type { Metier } from "../../mission-money";

/** La traduction d'une question : son libellé, son aide, et ses options (clé = l'option en français, telle qu'enregistrée dans les réponses). */
export type QText = { label: string; hint?: string; options?: Record<string, string> };
export type QTable = Record<Metier, Record<string, QText>>;

/** Les écrans de l'assistant de brief : clé `${métier}.${écran}`. */
export type StepText = { title: string; subtitle: string };
export type StepTable = Record<string, StepText>;
