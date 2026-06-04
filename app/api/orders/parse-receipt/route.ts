import { NextResponse, type NextRequest } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { createServerSupabaseClient } from "@/lib/supabase";

export const maxDuration = 30;

const ALLOWED_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif"] as const;
type AllowedType = (typeof ALLOWED_TYPES)[number];

function isAllowedType(type: string): type is AllowedType {
  return (ALLOWED_TYPES as readonly string[]).includes(type);
}

export async function POST(request: NextRequest) {
  if (!process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json(
      { error: "Service d'analyse non configuré. Contacte l'équipe Belchicken." },
      { status: 503 }
    );
  }

  const anthropic = new Anthropic();

  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Non authentifié." }, { status: 401 });
  }

  const formData = await request.formData();
  const file = formData.get("receipt") as File | null;

  if (!file) {
    return NextResponse.json({ error: "Aucune image fournie." }, { status: 400 });
  }

  if (file.size > 5 * 1024 * 1024) {
    return NextResponse.json({ error: "Image trop lourde (max 5 Mo)." }, { status: 400 });
  }

  if (!isAllowedType(file.type)) {
    return NextResponse.json(
      { error: "Format non supporté. Utilise JPG, PNG ou WebP." },
      { status: 400 }
    );
  }

  const bytes = await file.arrayBuffer();
  const base64 = Buffer.from(bytes).toString("base64");

  const restaurantName = process.env.NEXT_PUBLIC_RESTAURANT_NAME ?? "Belchicken";

  const message = await anthropic.messages.create({
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
              media_type: file.type,
              data: base64,
            },
          },
          {
            type: "text",
            text: `Tu es un assistant pour ${restaurantName}, un restaurant fast-food belge à Bruxelles.
Analyse cette image et détermine si c'est un ticket de caisse de ${restaurantName}.

Un ticket valide doit contenir le nom "${restaurantName}" et un Bestelnummer (numéro de commande au format YYYY-MM-DD/NNN/NNNNN, ex: 2026-06-01/258/03993).

Si ce N'EST PAS un ticket de caisse ${restaurantName} (photo de personne, paysage, autre restaurant, ticket sans Bestelnummer), réponds UNIQUEMENT avec :
{"is_receipt": false}

Si c'est bien un ticket ${restaurantName}, extrais le Bestelnummer et le montant total et réponds UNIQUEMENT avec :
{"is_receipt": true, "order_number": "2026-06-01/258/03993", "amount": 12.50}

Règles strictes :
- Réponds UNIQUEMENT avec du JSON valide, sans texte autour, sans markdown
- order_number : le Bestelnummer exact tel qu'il apparaît sur le ticket (format YYYY-MM-DD/NNN/NNNNN)
- amount : le TOTAL payé en euros, nombre décimal (ex: 12.50)
- Si le Bestelnummer est illisible, mets null pour order_number
- Si le montant est illisible, mets null pour amount`,
          },
        ],
      },
    ],
  });

  const raw = message.content[0].type === "text" ? message.content[0].text.trim() : "";

  let parsed: { is_receipt: boolean; order_number?: string | null; amount?: number | null };
  try {
    parsed = JSON.parse(raw);
  } catch {
    return NextResponse.json(
      { error: "Impossible d'analyser l'image. Assure-toi que la photo est nette et bien éclairée." },
      { status: 422 }
    );
  }

  if (!parsed.is_receipt) {
    return NextResponse.json(
      { error: `Cette image ne ressemble pas à un ticket ${restaurantName}. Prends en photo le reçu papier de ta commande.` },
      { status: 422 }
    );
  }

  return NextResponse.json({
    order_number: parsed.order_number ?? null,
    amount: parsed.amount ?? null,
  });
}
