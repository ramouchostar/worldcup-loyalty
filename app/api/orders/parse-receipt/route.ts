import { NextResponse, type NextRequest } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase";
import { analyzeReceipt, isAllowedReceiptType } from "@/lib/receipt-ocr";
import { getReceiptConfig } from "@/lib/receipt-config";
import { getRestaurantDisplayName } from "@/lib/restaurant";
import { checkRateLimit } from "@/lib/rate-limit";

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

  // F8 (sécurité) — anti-abus de l'OCR (appels Claude Vision FACTURÉS) : au plus
  // 20 analyses par heure et par membre. Fail-open tant que m44 n'est pas
  // appliquée (voir lib/rate-limit.ts).
  if (!(await checkRateLimit(user.id, "ocr_parse_receipt", 20, 3600))) {
    return NextResponse.json(
      { error: "Trop de scans en peu de temps. Réessaie dans quelques minutes." },
      { status: 429 }
    );
  }

  const formData = await request.formData();
  const file = formData.get("receipt") as File | null;
  const rawRestaurantId = formData.get("restaurantId");

  if (!file) return NextResponse.json({ error: "Aucune image fournie." }, { status: 400 });
  if (!rawRestaurantId) return NextResponse.json({ error: "restaurantId requis." }, { status: 400 });
  if (file.size > 5 * 1024 * 1024)
    return NextResponse.json({ error: "Image trop lourde (max 5 Mo)." }, { status: 400 });
  if (!isAllowedReceiptType(file.type))
    return NextResponse.json(
      { error: "Format non supporté. Utilise JPG, PNG ou WebP." },
      { status: 400 }
    );

  const [restaurantName, receiptConfig] = await Promise.all([
    getRestaurantDisplayName(String(rawRestaurantId)),
    getReceiptConfig(String(rawRestaurantId)),
  ]);

  let analysis;
  try {
    analysis = await analyzeReceipt(file, restaurantName, receiptConfig);
  } catch (err) {
    console.error("[parse-receipt] Claude vision error:", err);
    return NextResponse.json(
      { error: "Erreur lors de l'analyse de l'image. Réessaie avec une photo plus nette." },
      { status: 502 }
    );
  }

  if (!analysis.has_restaurant_header) {
    return NextResponse.json(
      {
        error: `Cette image ne ressemble pas à un ticket ${restaurantName}. Prends en photo le reçu papier de ta commande directe.`,
      },
      { status: 422 }
    );
  }

  // key_label / key_example / has_reliable_key : métadonnées non sensibles
  // pour libeller le champ côté client (le pattern reste service-role —
  // ADR 0019).
  return NextResponse.json({
    ...analysis,
    key_label: receiptConfig.key_label,
    key_example: receiptConfig.key_examples[0] ?? null,
    has_reliable_key: receiptConfig.has_reliable_key,
  });
}
