import Anthropic from "@anthropic-ai/sdk";

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
};

export type ReceiptAnalysis = {
  order_number: string | null;
  amount: number | null;
  confidence: number;
  has_restaurant_header: boolean;
};

/**
 * Analyse OCR d'un ticket de caisse via Claude vision.
 * Seule source de vérité anti-fraude : appelée côté serveur par la route
 * de soumission (orders) ET par la route d'aperçu UX (parse-receipt).
 * Throws si l'API vision échoue ou retourne du JSON invalide.
 */
export async function analyzeReceipt(file: File, restaurantName: string): Promise<ReceiptAnalysis> {
  const bytes = await file.arrayBuffer();
  const base64 = Buffer.from(bytes).toString("base64");

  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

  const msg = await client.messages.create({
    model: "claude-haiku-4-5-20251001",
    max_tokens: 256,
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
            text: `This is a receipt. Extract ONLY what you can clearly read:
1. Bestelnummer: a code in format YYYY-MM-DD/NNN/NNNNN (e.g. 2026-06-01/258/03993) — null if not visible
2. Total amount in euros (look for TOTAAL, TOTAL, "te betalen", "à payer") — return as a number, null if not visible
3. Whether the word "${restaurantName}" appears anywhere on the receipt

Return ONLY valid JSON, no markdown, no explanation:
{"order_number": "2026-06-01/258/03993" or null, "amount": 12.50 or null, "has_restaurant_header": true or false}`,
          },
        ],
      },
    ],
  });

  const rawText = msg.content[0].type === "text" ? msg.content[0].text.trim() : "";
  // Strip markdown code fences if model wraps output
  const jsonText = rawText.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "").trim();
  const parsed = JSON.parse(jsonText) as VisionResult;

  // Validate Bestelnummer format even if Claude extracted something
  const orderNumber =
    typeof parsed.order_number === "string" && BESTELNUMMER_RE.test(parsed.order_number)
      ? parsed.order_number
      : null;

  const amount =
    typeof parsed.amount === "number" && parsed.amount >= 1 && parsed.amount <= 500
      ? Math.round(parsed.amount * 100) / 100
      : null;

  const confidence = orderNumber && amount ? 90 : orderNumber || amount ? 65 : 35;

  return {
    order_number: orderNumber,
    amount,
    confidence,
    has_restaurant_header: parsed.has_restaurant_header === true,
  };
}
