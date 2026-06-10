import { NextResponse } from "next/server";
import { createServerSupabaseClient, createAdminClient } from "@/lib/supabase";

export async function POST(
  _req: Request,
  { params }: { params: Promise<{ token: string }> }
) {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Non autorisé" }, { status: 401 });

  const admin = createAdminClient();

  const { data: profile } = await admin
    .from("profiles")
    .select("is_admin")
    .eq("id", user.id)
    .single();

  if (!profile?.is_admin) {
    return NextResponse.json({ error: "Réservé au cashier" }, { status: 403 });
  }

  const { token } = await params;

  const { data: tokenRow } = await admin
    .from("redemption_tokens")
    .select("id, reward_id, expires_at, redeemed_at")
    .eq("token", token)
    .single();

  if (!tokenRow) return NextResponse.json({ error: "Token introuvable" }, { status: 404 });

  // Idempotent: already redeemed → 200
  if (tokenRow.redeemed_at) {
    return NextResponse.json({ ok: true, already: true });
  }

  if (new Date(tokenRow.expires_at) < new Date()) {
    return NextResponse.json({ error: "Token expiré" }, { status: 410 });
  }

  const now = new Date().toISOString();

  await Promise.all([
    admin
      .from("redemption_tokens")
      .update({ redeemed_at: now })
      .eq("id", tokenRow.id),
    admin
      .from("pending_rewards")
      .update({ status: "redeemed", redeemed_at: now })
      .eq("id", tokenRow.reward_id),
  ]);

  return NextResponse.json({ ok: true });
}
