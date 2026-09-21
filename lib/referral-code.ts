import type { createAdminClient } from "./supabase";

// Code de parrainage d'un membre dans un établissement (`referral_links`,
// CONTEXT.md « Parrainage ») : lu, ou créé au premier besoin. Partagé par
// l'API du membre (/api/referrals) et l'e-mail « Invite tes amis » (ADR 0063)
// — un seul endroit qui sait fabriquer un code.

const CODE_CHARS = "ABCDEFGHJKMNPQRSTUVWXYZ23456789"; // pas de 0/O, 1/I/L

function generateCode(): string {
  let code = "";
  for (let i = 0; i < 6; i++) code += CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)];
  return code;
}

type Admin = ReturnType<typeof createAdminClient>;

export async function getOrCreateReferralLink(
  admin: Admin,
  userId: string,
  restaurantId: string
): Promise<{ code: string; conversions: number } | null> {
  const { data: existing } = await admin
    .from("referral_links")
    .select("code, conversions")
    .eq("user_id", userId)
    .eq("restaurant_id", restaurantId)
    .maybeSingle();
  if (existing) return existing as { code: string; conversions: number };

  // Collision sur le code (rare) : on retente avec un nouveau code.
  for (let attempt = 0; attempt < 5; attempt++) {
    const { data, error } = await admin
      .from("referral_links")
      .insert({ user_id: userId, restaurant_id: restaurantId, code: generateCode() })
      .select("code, conversions")
      .single();
    if (!error && data) return data as { code: string; conversions: number };
  }
  return null;
}
