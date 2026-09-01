import { NextResponse } from "next/server";
import { createServerSupabaseClient, createAdminClient } from "@/lib/supabase";
import { checkRateLimit } from "@/lib/rate-limit";
import { getReceiptConfig } from "@/lib/receipt-config";
import { loadRewardGrid, resolveSoloReward, nextSoloTier, type NextSoloTier } from "@/lib/rewards";

// Étape 06 (backlog onboarding) — pré-vérification AVANT l'envoi :
//   - cadeau visé par le montant (noms + proportion de barre uniquement,
//     jamais de seuil ni d'euro — ADR 0007/0028 §6, comme le hero) ;
//   - doublon détecté à la saisie du numéro (même clé que /api/orders,
//     `restaurant_id:numéro`, m32) au lieu d'un rejet 409 après l'envoi.
// Lecture seule ; le 409 de /api/orders reste le filet de sécurité.
export async function POST(req: Request) {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Non authentifié." }, { status: 401 });

  // Débouncé côté client (~500 ms) — la limite ne gêne qu'un usage anormal.
  if (!(await checkRateLimit(user.id, "order_precheck", 120, 3600))) {
    return NextResponse.json({ error: "Trop de vérifications. Réessaie dans un moment." }, { status: 429 });
  }

  const body = await req.json().catch(() => null);
  const restaurantId = body?.restaurantId;
  if (typeof restaurantId !== "string" || !restaurantId) {
    return NextResponse.json({ error: "restaurantId requis." }, { status: 400 });
  }
  const amount = Number(body?.amount);
  const orderNumber = typeof body?.order_number === "string" ? body.order_number.trim() : "";

  let reward: string | null = null;
  let nextTier: NextSoloTier | null = null;
  if (Number.isFinite(amount) && amount > 0) {
    const grid = await loadRewardGrid(restaurantId);
    reward = resolveSoloReward(grid, amount).item;
    nextTier = nextSoloTier(grid, amount);
  }

  let duplicate = false;
  if (orderNumber !== "") {
    const receiptConfig = await getReceiptConfig(restaurantId);
    if (receiptConfig.has_reliable_key) {
      const admin = createAdminClient();
      const { data } = await admin
        .from("orders")
        .select("id")
        .eq("duplicate_key", `${restaurantId}:${orderNumber}`)
        .limit(1)
        .maybeSingle();
      duplicate = !!data;
    }
  }

  return NextResponse.json({ reward, next_tier: nextTier, duplicate });
}
