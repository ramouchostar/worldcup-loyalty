import Anthropic from "@anthropic-ai/sdk";
import { isAllowedReceiptType, type AllowedReceiptType } from "./receipt-ocr";

// ADR 0019 — Découverte de la clé unique de commande à l'onboarding.
// One-shot : le restaurateur soumet 2-3 photos de tickets, un seul appel
// vision (modèle fort, coût accepté car unique par établissement) propose
// la clé candidate. L'app propose, le restaurateur décide (ADR 0013).

/**
 * Ce que la découverte comprend du ticket AU-DELÀ de la clé (ADR 0066) :
 * l'heure de commande, le canal, le numéro de séquence du jour, le bloc des
 * totaux. Sert ensuite à juger chaque lecture (est-ce que ça tient debout ?)
 * et à reconnaître deux photos du même ticket. Conservé tel quel dans
 * `restaurant_receipt_config.receipt_profile`.
 */
export type ReceiptProfile = {
  /** L'heure de commande est-elle imprimée, et où ? */
  has_order_time: boolean;
  order_time_hint: string;
  /** Le canal (« Self-order kiosk », « Eat in »…) et les valeurs vues. */
  channel_values: string[];
  /** Le petit numéro du jour en tête (« Take away - 179 ») — jamais unique seul. */
  has_daily_sequence: boolean;
  /** Le ticket imprime-t-il un sous-total, une remise, une TVA ? */
  has_subtotal: boolean;
  has_discount_line: boolean;
  /** Le moyen de paiement (jamais le numéro de carte). */
  has_payment_method: boolean;
  /** Langue principale du ticket (nl, fr, en…) — aide la lecture des libellés. */
  language: string;
  notes: string;
};

export type ReceiptKeyProposal = {
  has_reliable_key: boolean;
  key_label: string;
  key_description: string;
  key_pattern: string;
  key_examples: string[];
  position_hint: string;
  date_group: number | null;
  notes: string;
  profile: ReceiptProfile | null;
};

const MAX_PATTERN_LENGTH = 200;

// Le profil vient du modèle : on ne garde que des champs de forme connue,
// bornés — jamais de texte libre long ni de donnée bancaire (ADR 0025).
function sanitizeProfile(raw: unknown): ReceiptProfile | null {
  if (typeof raw !== "object" || raw === null) return null;
  const p = raw as Record<string, unknown>;
  const text = (v: unknown, max: number) => (typeof v === "string" ? v.trim().slice(0, max) : "");
  return {
    has_order_time: p.has_order_time === true,
    order_time_hint: text(p.order_time_hint, 150),
    channel_values: Array.isArray(p.channel_values)
      ? p.channel_values.filter((c): c is string => typeof c === "string").map((c) => c.trim().slice(0, 40)).slice(0, 8)
      : [],
    has_daily_sequence: p.has_daily_sequence === true,
    has_subtotal: p.has_subtotal === true,
    has_discount_line: p.has_discount_line === true,
    has_payment_method: p.has_payment_method === true,
    language: text(p.language, 8),
    notes: text(p.notes, 300),
  };
}

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

  // Sonnet 5 : thinking adaptatif par défaut — la réponse commence par des
  // blocs thinking (texte vide), et le thinking consomme max_tokens. On
  // laisse le thinking actif (utile pour raisonner sur le pattern) avec un
  // budget large, et on extrait le texte de façon robuste plus bas.
  const msg = await client.messages.create({
    model: "claude-sonnet-5",
    max_tokens: 8000,
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
9. profile: what ELSE identifies an order on these receipts — a loyalty program uses it to tell two photos of the SAME ticket apart from two different orders, and to notice a misread:
   - has_order_time / order_time_hint: is the order time printed, and where (short English phrase)?
   - channel_values: the printed order channels seen across the samples (e.g. ["Self-order kiosk", "Intake module"]), empty if none
   - has_daily_sequence: is a short per-day counter printed in the header (e.g. "179" in "Take away - 179")?
   - has_subtotal / has_discount_line / has_payment_method: are those lines printed?
   - language: main language of the receipt ("nl", "fr", "en"…)
   NEVER report card numbers, authorisation codes or any banking identifier.

If NO reliable unique field exists on all receipts, return has_reliable_key false and empty strings for the other fields.

Return ONLY valid JSON, no markdown:
{"has_reliable_key": true, "key_label": "...", "key_description": "...", "key_pattern": "^...$", "key_examples": ["..."], "position_hint": "...", "date_group": 1 or null, "notes": "", "profile": {"has_order_time": true, "order_time_hint": "...", "channel_values": ["..."], "has_daily_sequence": true, "has_subtotal": true, "has_discount_line": false, "has_payment_method": true, "language": "nl", "notes": ""}}`,
          },
        ],
      },
    ],
  });

  // Concatène TOUS les blocs texte (jamais content[0] : des blocs thinking
  // peuvent précéder), puis isole l'objet JSON même si le modèle l'entoure
  // de prose ou de fences markdown.
  const rawText = msg.content
    .filter((b): b is Extract<typeof b, { type: "text" }> => b.type === "text")
    .map((b) => b.text)
    .join("")
    .trim();
  const jsonStart = rawText.indexOf("{");
  const jsonEnd = rawText.lastIndexOf("}");
  if (jsonStart === -1 || jsonEnd <= jsonStart) {
    throw new Error(`discovery: pas de JSON dans la réponse (${rawText.slice(0, 120)})`);
  }
  const parsed = JSON.parse(rawText.slice(jsonStart, jsonEnd + 1)) as Partial<ReceiptKeyProposal>;

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
    profile: sanitizeProfile(parsed.profile),
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
