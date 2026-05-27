import { NextResponse, type NextRequest } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { createServerSupabaseClient } from "@/lib/supabase";

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
            text: `Analyse ce ticket de caisse de restaurant et extrais exactement ces 3 informations :
1. La date (format YYYY-MM-DD)
2. L'heure (format HH:MM, heure locale sur le ticket)
3. Le montant TOTAL payé (nombre décimal en euros, ex: 12.50)

Réponds UNIQUEMENT avec du JSON valide, sans texte autour, sans markdown :
{"date": "YYYY-MM-DD", "time": "HH:MM", "amount": 12.50}

Si une information est illisible ou absente, mets null pour ce champ uniquement.`,
          },
        ],
      },
    ],
  });

  const raw = message.content[0].type === "text" ? message.content[0].text.trim() : "";

  let extracted: { date: string | null; time: string | null; amount: number | null };
  try {
    extracted = JSON.parse(raw);
  } catch {
    return NextResponse.json(
      { error: "Impossible d'extraire les données du ticket. Remplis les champs manuellement." },
      { status: 422 }
    );
  }

  return NextResponse.json({
    date: extracted.date ?? null,
    time: extracted.time ?? null,
    amount: extracted.amount ?? null,
  });
}
