import { NextResponse, type NextRequest } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase";

export const maxDuration = 30;

const ALLOWED_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif"] as const;
type AllowedType = (typeof ALLOWED_TYPES)[number];

function isAllowedType(type: string): type is AllowedType {
  return (ALLOWED_TYPES as readonly string[]).includes(type);
}

// Bestelnummer: YYYY-MM-DD/NNN/NNNNN
const BESTELNUMMER_RE = /\b(\d{4}-\d{2}-\d{2}\/\d{3}\/\d{5})\b/;

function extractAmount(text: string): number | null {
  // Priority: line containing TOTAAL / TOTAL / te betalen / a payer
  const labeled = text.match(
    /(?:TOTAAL|TOTAL|te\s+betalen|a\s+payer)[^\d]*(\d{1,3}[,\.]\d{2})/i
  );
  if (labeled) return parseFloat(labeled[1].replace(",", "."));

  // Fallback: all decimal amounts in range €1–€500 — return the largest
  const all = [...text.matchAll(/\b(\d{1,3}[,\.]\d{2})\b/g)]
    .map((m) => parseFloat(m[1].replace(",", ".")))
    .filter((n) => !isNaN(n) && n >= 1 && n <= 500);

  return all.length ? Math.max(...all) : null;
}

function computeConfidence(
  fullText: string,
  orderNumber: string | null,
  amount: number | null,
  visionData: { responses?: { fullTextAnnotation?: { pages?: { blocks?: { confidence?: number }[] }[] } }[] }
): number {
  // Try to get average block confidence from Vision API
  const pages = visionData.responses?.[0]?.fullTextAnnotation?.pages ?? [];
  let total = 0;
  let count = 0;
  for (const page of pages) {
    for (const block of (page.blocks ?? [])) {
      if (block.confidence != null) {
        total += block.confidence;
        count++;
      }
    }
  }
  if (count > 0) return Math.round((total / count) * 100);

  // Heuristic fallback
  if (orderNumber && amount) return 90;
  if (orderNumber || amount) return 65;
  return 35;
}

export async function POST(request: NextRequest) {
  if (!process.env.GOOGLE_VISION_API_KEY) {
    return NextResponse.json(
      { error: "Service d'analyse non configuré. Contacte l'équipe Belchicken." },
      { status: 503 }
    );
  }

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

  const visionRes = await fetch(
    `https://vision.googleapis.com/v1/images:annotate?key=${process.env.GOOGLE_VISION_API_KEY}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        requests: [
          {
            image: { content: base64 },
            features: [{ type: "DOCUMENT_TEXT_DETECTION" }],
          },
        ],
      }),
    }
  );

  if (!visionRes.ok) {
    return NextResponse.json(
      { error: "Erreur lors de l'analyse de l'image. Réessaie." },
      { status: 502 }
    );
  }

  const visionData = await visionRes.json();
  const fullText: string = visionData.responses?.[0]?.fullTextAnnotation?.text ?? "";

  if (!fullText) {
    return NextResponse.json(
      {
        error:
          "Impossible de lire du texte sur cette image. Assure-toi que la photo est nette, bien éclairée et pas floue.",
      },
      { status: 422 }
    );
  }

  const restaurantName = process.env.NEXT_PUBLIC_RESTAURANT_NAME ?? "Belchicken";
  const hasRestaurantHeader = fullText.toLowerCase().includes(restaurantName.toLowerCase());

  if (!hasRestaurantHeader) {
    return NextResponse.json(
      {
        error: `Cette image ne ressemble pas à un ticket ${restaurantName}. Prends en photo le reçu papier de ta commande directe.`,
      },
      { status: 422 }
    );
  }

  const bestelMatch = fullText.match(BESTELNUMMER_RE);
  const orderNumber = bestelMatch ? bestelMatch[1] : null;
  const amount = extractAmount(fullText);
  const confidence = computeConfidence(fullText, orderNumber, amount, visionData);

  return NextResponse.json({
    order_number: orderNumber,
    amount,
    confidence,
    has_restaurant_header: hasRestaurantHeader,
  });
}
