import Anthropic from "@anthropic-ai/sdk";
import { compileKeyPattern, type ReceiptKeyConfig } from "./receipt-config";
import { sanitizeKeyDate } from "./receipt-key-sanity";

const ALLOWED_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif"] as const;
export type AllowedReceiptType = (typeof ALLOWED_TYPES)[number];

export function isAllowedReceiptType(type: string): type is AllowedReceiptType {
  return (ALLOWED_TYPES as readonly string[]).includes(type);
}

// Bestelnummer: YYYY-MM-DD/NNN/NNNNN
const BESTELNUMMER_RE = /\b(\d{4}-\d{2}-\d{2}\/\d{3}\/\d{5})\b/;

type VisionResult = {
  order_number: string | null;
  amount: number | null;
  has_restaurant_header: boolean;
  order_time?: unknown;
  items?: unknown;
};

export type ReceiptLineItem = {
  name: string;
  quantity: number;
  unit_price: number | null;
};

export type ReceiptAnalysis = {
  order_number: string | null;
  amount: number | null;
  confidence: number;
  has_restaurant_header: boolean;
  order_time: string | null;
  items: ReceiptLineItem[];
  // true si l'année de la date contenue dans la clé a été corrigée (lecture
  // OCR manifestement fausse, cf. lib/receipt-key-sanity.ts) — le client
  // invite alors le membre à vérifier le numéro.
  key_corrected: boolean;
};

// Date du jour côté établissements (les tickets sont datés en heure belge).
function todayInBrussels(): string {
  return new Date().toLocaleDateString("en-CA", { timeZone: "Europe/Brussels" });
}

const ORDER_TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;
const MAX_LINE_ITEMS = 30;

// ADR 0020 — les articles et l'heure sont du best effort strict :
// toute anomalie de forme est silencieusement écartée, jamais de throw,
// et ces champs n'entrent pas dans le calcul de confidence.
function sanitizeLineItems(raw: unknown): ReceiptLineItem[] {
  if (!Array.isArray(raw)) return [];
  const items: ReceiptLineItem[] = [];
  for (const entry of raw.slice(0, MAX_LINE_ITEMS)) {
    if (typeof entry !== "object" || entry === null) continue;
    const { name, quantity, unit_price } = entry as Record<string, unknown>;
    if (typeof name !== "string" || name.trim() === "") continue;
    const qty =
      typeof quantity === "number" && quantity > 0 && quantity <= 99 ? quantity : 1;
    const price =
      typeof unit_price === "number" && unit_price >= 0 && unit_price <= 500
        ? Math.round(unit_price * 100) / 100
        : null;
    items.push({ name: name.trim().slice(0, 120), quantity: qty, unit_price: price });
  }
  return items;
}

// ADR 0019 — section « clé de commande » du prompt, dynamique à partir de
// la config de l'établissement. Sans config : format Bestelnummer legacy.
function buildKeyPromptSection(config: ReceiptKeyConfig | null | undefined): string {
  if (config && !config.has_reliable_key) {
    return ""; // pas de clé fiable sur ce format de ticket : rien à extraire
  }
  if (config?.key_label && config.key_description) {
    const example = config.key_examples[0];
    const position = config.position_hint ? `, usually ${config.position_hint}` : "";
    return `1. ${config.key_label}: ${config.key_description}${position}${example ? ` (e.g. ${example})` : ""} — null if not visible\n`;
  }
  return "1. Bestelnummer: a code in format YYYY-MM-DD/NNN/NNNNN (e.g. 2026-06-01/258/03993) — null if not visible\n";
}

/**
 * Analyse OCR d'un ticket de caisse via Claude vision.
 * Seule source de vérité anti-fraude : appelée côté serveur par la route
 * de soumission (orders) ET par la route d'aperçu UX (parse-receipt).
 * Throws si l'API vision échoue ou retourne du JSON invalide.
 * `config` (ADR 0019) pilote la clé de commande recherchée ; absent =
 * comportement Bestelnummer historique.
 */
export async function analyzeReceipt(
  file: File,
  restaurantName: string,
  config?: ReceiptKeyConfig | null
): Promise<ReceiptAnalysis> {
  const bytes = await file.arrayBuffer();
  const base64 = Buffer.from(bytes).toString("base64");

  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

  const msg = await client.messages.create({
    model: "claude-haiku-4-5-20251001",
    max_tokens: 1024,
    messages: [
      {
        role: "user",
        content: [
          {
            type: "image",
            source: {
              type: "base64",
              media_type: file.type as AllowedReceiptType,
              data: base64,
            },
          },
          {
            type: "text",
            text: `This is a receipt. Today is ${todayInBrussels()} (Europe/Brussels); receipts are normally from today or the last few days — read the YEAR and DATE digits exactly as printed, never assume the year from memory. Extract ONLY what you can clearly read:
${buildKeyPromptSection(config)}2. Total amount in euros (look for TOTAAL, TOTAL, "te betalen", "à payer") — return as a number, null if not visible
3. Whether the word "${restaurantName}" appears anywhere on the receipt
4. Order time in 24h HH:MM format if printed on the receipt — null if not visible
5. Line items ordered: for each clearly readable line, the item name as printed, the quantity (default 1) and the unit price in euros (null if unreadable). Maximum ${MAX_LINE_ITEMS} items, skip totals/taxes/payment lines.

Return ONLY valid JSON, no markdown, no explanation:
{"order_number": "2026-06-01/258/03993" or null, "amount": 12.50 or null, "has_restaurant_header": true or false, "order_time": "18:42" or null, "items": [{"name": "Finest Burger", "quantity": 1, "unit_price": 11.50}]}`,
          },
        ],
      },
    ],
  });

  const rawText = msg.content[0].type === "text" ? msg.content[0].text.trim() : "";
  // Strip markdown code fences if model wraps output
  const jsonText = rawText.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "").trim();
  const parsed = JSON.parse(jsonText) as VisionResult;

  // Validate la clé extraite contre le pattern de l'établissement
  // (ADR 0019), sinon contre le Bestelnummer legacy.
  const keyPattern = config ? compileKeyPattern(config) : BESTELNUMMER_RE;
  const rawOrderNumber =
    keyPattern && typeof parsed.order_number === "string" && keyPattern.test(parsed.order_number.trim())
      ? parsed.order_number.trim()
      : null;
  // Incident Kasia (2026-08-22) : l'OCR lisait l'année 2025 sur un ticket du
  // jour → numéro en lecture seule → date refusée à la soumission → 6 essais.
  // On répare une année manifestement fausse, on invalide une date future ou
  // trop vieille (le membre pourra alors saisir le numéro à la main).
  const sanity = sanitizeKeyDate(
    rawOrderNumber,
    keyPattern,
    config ? config.date_group : 1, // legacy Bestelnummer : la date est le groupe 1
    todayInBrussels()
  );
  const orderNumber = sanity.order_number;

  const amount =
    typeof parsed.amount === "number" && parsed.amount >= 1 && parsed.amount <= 500
      ? Math.round(parsed.amount * 100) / 100
      : null;

  // La confidence reste basée uniquement sur clé + montant : les articles
  // et l'heure (ADR 0020) ne participent jamais au flagging.
  const confidence = orderNumber && amount ? 90 : orderNumber || amount ? 65 : 35;

  const orderTime =
    typeof parsed.order_time === "string" && ORDER_TIME_RE.test(parsed.order_time)
      ? parsed.order_time
      : null;

  return {
    order_number: orderNumber,
    amount,
    confidence,
    has_restaurant_header: parsed.has_restaurant_header === true,
    order_time: orderTime,
    items: sanitizeLineItems(parsed.items),
    key_corrected: sanity.corrected,
  };
}
