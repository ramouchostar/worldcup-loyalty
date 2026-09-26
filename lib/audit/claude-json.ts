// ADR 0069 — appel Claude qui DOIT rendre du JSON (thèmes des avis, plan
// d'attaque). SERVEUR UNIQUEMENT.
//
// Pourquoi ce module (terrain 2026-09-26, audit Krusty) : Claude Sonnet 5
// réfléchit par défaut (adaptive thinking) et cette réflexion consomme
// `max_tokens`. Sur 400 avis, la réponse était coupée : JSON tronqué
// (« Expected ',' or ']' ») ou texte vide (« pas de JSON dans la réponse () »).
// D'où : sortie structurée (le JSON suit le schéma, jamais de texte autour),
// streaming pour un plafond large sans délai HTTP, effort « medium », et un
// motif précis quand la réponse s'arrête avant la fin.

import Anthropic from "@anthropic-ai/sdk";

export const AUDIT_MODEL = "claude-sonnet-5";

export class ClaudeJsonError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ClaudeJsonError";
  }
}

/** `{ type: [t, "null"] }` n'est pas garanti par les sorties structurées : anyOf l'est. */
export const nullable = (schema: Record<string, unknown>) => ({ anyOf: [schema, { type: "null" }] });

/** Transforme la réponse finale en objet, ou lève une erreur qui dit pourquoi. */
export function readJson<T>(message: Pick<Anthropic.Message, "content" | "stop_reason">): T {
  const text = message.content
    .filter((b): b is Anthropic.TextBlock => b.type === "text")
    .map((b) => b.text)
    .join("")
    .trim();
  if (message.stop_reason === "max_tokens") throw new ClaudeJsonError("réponse coupée avant la fin (plafond de tokens atteint).");
  if (message.stop_reason === "refusal") throw new ClaudeJsonError("Claude a refusé de répondre.");
  if (!text) throw new ClaudeJsonError(`réponse vide (arrêt : ${message.stop_reason ?? "inconnu"}).`);
  try {
    return JSON.parse(text) as T;
  } catch (e) {
    throw new ClaudeJsonError(`JSON illisible (${e instanceof Error ? e.message : String(e)}) : ${text.slice(0, 120)}`);
  }
}

export async function claudeJson<T>(input: {
  prompt: string;
  schema: Record<string, unknown>;
  maxTokens?: number;
}): Promise<{ data: T; tokens: { input: number; output: number } }> {
  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  const stream = client.messages.stream({
    model: AUDIT_MODEL,
    max_tokens: input.maxTokens ?? 32000,
    output_config: { effort: "medium", format: { type: "json_schema", schema: input.schema } },
    messages: [{ role: "user", content: input.prompt }],
  });
  const message = await stream.finalMessage();
  return { data: readJson<T>(message), tokens: { input: message.usage.input_tokens, output: message.usage.output_tokens } };
}
