import Anthropic from "@anthropic-ai/sdk";
import { isAllowedReceiptType, type AllowedReceiptType } from "./receipt-ocr";

// ADR 0019 — Découverte de la clé unique de commande à l'onboarding.
// One-shot : le restaurateur soumet 2-3 photos de tickets, un seul appel
// vision (modèle fort, coût accepté car unique par établissement) propose
// la clé candidate. L'app propose, le restaurateur décide (ADR 0013).

export type ReceiptKeyProposal = {
  has_reliable_key: boolean;
  key_label: string;
  key_description: string;
  key_pattern: string;
  key_examples: string[];
  position_hint: string;
  date_group: number | null;
  notes: string;
};

const MAX_PATTERN_LENGTH = 200;

// Garde serveur contre une regex proposée par le modèle : doit compiler,
// être ancrée, rester courte (anti-ReDoS) et matcher tous les exemples
// extraits des photos.
export function validateProposedPattern(pattern: string, examples: string[]): string | null {
  if (pattern.length > MAX_PATTERN_LENGTH) return "Pattern trop long.";
  if (!pattern.startsWith("^") || !pattern.endsWith("$")) return "Le pattern doit être ancré (^...$).";
  let re: RegExp;
  try {
    re = new RegExp(pattern);
  } catch {
    return "Pattern invalide (ne compile pas).";
  }
  if (examples.length === 0) return "Aucun exemple extrait des tickets.";
  for (const example of examples) {
    if (!re.test(example)) return `Le pattern ne reconnaît pas l'exemple « ${example} ».`;
  }
  return null;
}

export async function discoverReceiptKey(
  files: File[],
  restaurantName: string
): Promise<ReceiptKeyProposal> {
  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

  const imageBlocks = await Promise.all(
    files.map(async (file) => {
      const bytes = await file.arrayBuffer();
      return {
        type: "image" as const,
        source: {
          type: "base64" as const,
          media_type: file.type as AllowedReceiptType,
          data: Buffer.from(bytes).toString("base64"),
        },
      };
    })
  );

  const msg = await client.messages.create({
    model: "claude-sonnet-5",
    max_tokens: 2048,
    messages: [
      {
        role: "user",
        content: [
          ...imageBlocks,
          {
            type: "text",
            text: `These are ${files.length} sample receipts from the restaurant "${restaurantName}". A loyalty program needs ONE field printed on every receipt that uniquely identifies the order (order number, ticket number, transaction id, possibly combined with a date). Analyze all receipts and answer:

1. Is there such a field present and clearly readable on ALL receipts? If several candidates exist, pick the most specific one (longest, least likely to repeat across days).
2. key_label: the short name of that field as a customer would find it on the receipt (e.g. "Bestelnummer", "Ticket nr").
3. key_description: one English sentence describing the format, suitable for an OCR extraction prompt (e.g. "a code in format YYYY-MM-DD/NNN/NNNNN (e.g. 2026-06-01/258/03993)").
4. key_pattern: an ANCHORED JavaScript regex (^...$) matching exactly that format. Use capture groups. Keep it under 150 characters.
5. key_examples: the exact value read from EACH receipt (one per image, in order).
6. position_hint: where the field appears on the receipt (short English phrase).
7. date_group: if one capture group of the regex contains a date in YYYY-MM-DD form, its group number (1-based), else null.
8. notes: anything ambiguous (French, one short sentence, empty string if none).

If NO reliable unique field exists on all receipts, return has_reliable_key false and empty strings for the other fields.

Return ONLY valid JSON, no markdown:
{"has_reliable_key": true, "key_label": "...", "key_description": "...", "key_pattern": "^...$", "key_examples": ["..."], "position_hint": "...", "date_group": 1 or null, "notes": ""}`,
          },
        ],
      },
    ],
  });

  const rawText = msg.content[0].type === "text" ? msg.content[0].text.trim() : "";
  const jsonText = rawText.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "").trim();
  const parsed = JSON.parse(jsonText) as Partial<ReceiptKeyProposal>;

  const proposal: ReceiptKeyProposal = {
    has_reliable_key: parsed.has_reliable_key === true,
    key_label: typeof parsed.key_label === "string" ? parsed.key_label.slice(0, 60) : "",
    key_description:
      typeof parsed.key_description === "string" ? parsed.key_description.slice(0, 300) : "",
    key_pattern: typeof parsed.key_pattern === "string" ? parsed.key_pattern : "",
    key_examples: Array.isArray(parsed.key_examples)
      ? parsed.key_examples.filter((e): e is string => typeof e === "string").slice(0, 10)
      : [],
    position_hint:
      typeof parsed.position_hint === "string" ? parsed.position_hint.slice(0, 150) : "",
    date_group:
      typeof parsed.date_group === "number" && Number.isInteger(parsed.date_group) && parsed.date_group > 0
        ? parsed.date_group
        : null,
    notes: typeof parsed.notes === "string" ? parsed.notes.slice(0, 300) : "",
  };

  // Une proposition dont le pattern ne tient pas la garde serveur est
  // rétrogradée en "pas de clé fiable" — le restaurateur pourra corriger
  // à la main ou passer.
  if (proposal.has_reliable_key) {
    const patternError = validateProposedPattern(proposal.key_pattern, proposal.key_examples);
    if (patternError) {
      proposal.has_reliable_key = false;
      proposal.notes = proposal.notes
        ? `${proposal.notes} — ${patternError}`
        : patternError;
    }
  }

  return proposal;
}
