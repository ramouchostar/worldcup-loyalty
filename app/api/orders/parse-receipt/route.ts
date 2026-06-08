import { NextResponse, type NextRequest } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase";
import Anthropic from "@anthropic-ai/sdk";

export const maxDuration = 30;

const ALLOWED_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif"] as const;
type AllowedType = (typeof ALLOWED_TYPES)[number];

function isAllowedType(type: string): type is AllowedType {
  return (ALLOWED_TYPES as readonly string[]).includes(type);
}

// Bestelnummer: YYYY-MM-DD/NNN/NNNNN
const BESTELNUMMER_RE = /\b(\d{4}-\d{2}-\d{2}\/\d{3}\/\d{5})\b/;

type VisionResult = {
  order_number: string | null;
  amount: number | null;
  has_restaurant_header: boolean;
};

export async function POST(request: NextRequest) {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Non authentifié." }, { status: 401 });

  const formData = await request.formData();
  const file = formData.get("receipt") as File | null;

  if (!file) return NextResponse.json({ error: "Aucune image fournie." }, { status: 400 });
  if (file.size > 5 * 1024 * 1024)
    return NextResponse.json({ error: "Image trop lourde (max 5 Mo)." }, { status: 400 });
  if (!isAllowedType(file.type))
    return NextResponse.json(
      { error: "Format non supporté. Utilise JPG, PNG ou WebP." },
      { status: 400 }
    );

  const bytes = await file.arrayBuffer();
  const base64 = Buffer.from(bytes).toString("base64");
  const restaurantName = process.env.NEXT_PUBLIC_RESTAURANT_NAME ?? "Belchicken";

  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

  let parsed: VisionResult;

  try {
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
                media_type: file.type as AllowedType,
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
    parsed = JSON.parse(jsonText) as VisionResult;
  } catch (err) {
    console.error("[parse-receipt] Claude vision error:", err);
    return NextResponse.json(
      { error: "Erreur lors de l'analyse de l'image. Réessaie avec une photo plus nette." },
      { status: 502 }
    );
  }

  const hasRestaurantHeader = parsed.has_restaurant_header === true;

  if (!hasRestaurantHeader) {
    return NextResponse.json(
      {
        error: `Cette image ne ressemble pas à un ticket ${restaurantName}. Prends en photo le reçu papier de ta commande directe.`,
      },
      { status: 422 }
    );
  }

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

  return NextResponse.json({
    order_number: orderNumber,
    amount,
    confidence,
    has_restaurant_header: hasRestaurantHeader,
  });
}
