import { NextResponse, type NextRequest } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase";
import { analyzeReceipt, isAllowedReceiptType } from "@/lib/receipt-ocr";

export const maxDuration = 30;

// Aperçu UX temps réel uniquement ("Montant détecté : €X").
// La source de vérité anti-fraude est la ré-analyse serveur dans
// app/api/orders/route.ts — les valeurs retournées ici ne sont
// jamais utilisées pour le flagging.
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
  if (!isAllowedReceiptType(file.type))
    return NextResponse.json(
      { error: "Format non supporté. Utilise JPG, PNG ou WebP." },
      { status: 400 }
    );

  let analysis;
  try {
    analysis = await analyzeReceipt(file);
  } catch (err) {
    console.error("[parse-receipt] Claude vision error:", err);
    return NextResponse.json(
      { error: "Erreur lors de l'analyse de l'image. Réessaie avec une photo plus nette." },
      { status: 502 }
    );
  }

  if (!analysis.has_restaurant_header) {
    const restaurantName = process.env.NEXT_PUBLIC_RESTAURANT_NAME ?? "Belchicken";
    return NextResponse.json(
      {
        error: `Cette image ne ressemble pas à un ticket ${restaurantName}. Prends en photo le reçu papier de ta commande directe.`,
      },
      { status: 422 }
    );
  }

  return NextResponse.json(analysis);
}
