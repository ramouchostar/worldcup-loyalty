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
            text: `Tu es un assistant pour Belchicken, un restaurant fast-food belge à Bruxelles.
Analyse cette image et détermine d'abord si c'est un ticket de caisse de restaurant.

Un ticket de caisse valide contient : une date, une heure, un montant total, et des articles achetés.

Si ce N'EST PAS un ticket de caisse de restaurant (photo de personne, paysage, document autre, etc.), réponds UNIQUEMENT avec :
{"is_receipt": false}

Si c'est bien un ticket de caisse, extrais ces 3 informations et réponds UNIQUEMENT avec :
{"is_receipt": true, "date": "YYYY-MM-DD", "time": "HH:MM", "amount": 12.50}

Règles strictes :
- Réponds UNIQUEMENT avec du JSON valide, sans texte autour, sans markdown
- Pour la date : format YYYY-MM-DD (ex: 2026-06-15)
- Pour l'heure : format HH:MM en heure locale du ticket (ex: 19:32)
- Pour le montant : le TOTAL payé en euros, nombre décimal (ex: 12.50)
- Si un champ est illisible, mets null pour ce champ uniquement`,
          },
        ],
      },
    ],
  });

  const raw = message.content[0].type === "text" ? message.content[0].text.trim() : "";

  let parsed: { is_receipt: boolean; date?: string | null; time?: string | null; amount?: number | null };
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
      { error: "Cette image ne ressemble pas à un ticket de caisse. Prends en photo le reçu papier de ta commande Belchicken." },
      { status: 422 }
    );
  }

  return NextResponse.json({
    date: parsed.date ?? null,
    time: parsed.time ?? null,
    amount: parsed.amount ?? null,
  });
}
