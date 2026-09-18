import { NextResponse } from "next/server";
import { createServerSupabaseClient, createAdminClient } from "@/lib/supabase";
import {
  REDEMPTION_MIN_ORDER_EUR,
  claimOpensAt,
  formatOpensAt,
  isClaimNotYetOpen,
  isClaimWindowOver,
} from "@/lib/reward-window";
import { randomBytes } from "crypto";

export async function POST(request: Request) {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Non autorisé" }, { status: 401 });

  const body = await request.json().catch(() => null);
  const restaurantId = typeof body?.restaurantId === "string" ? body.restaurantId : "";
  if (!restaurantId) return NextResponse.json({ error: "restaurantId requis." }, { status: 400 });

  const admin = createAdminClient();

  const { data: reward } = await admin
    .from("pending_rewards")
    .select("id, created_at, source")
    .eq("user_id", user.id)
    .eq("restaurant_id", restaurantId)
    .eq("status", "available")
    .single();

  if (!reward) {
    return NextResponse.json({ error: "Aucune récompense à récupérer" }, { status: 404 });
  }

  // ADR 0011 amendé (terrain Houba 2026-09-17) — un cadeau né d'un ticket ne
  // se récupère pas pendant la même visite : le coupon s'ouvre 4 h après le
  // ticket. Refus déterministe ici ; l'écran le dit déjà avant (RedeemButton).
  if (isClaimNotYetOpen(reward.created_at, reward.source)) {
    const opensAt = claimOpensAt(reward.created_at, reward.source);
    return NextResponse.json(
      {
        error: `Ton cadeau se récupère lors de ta prochaine visite : dès ${formatOpensAt(opensAt).replace(/^à /, "")}, avec une commande d'au moins ${REDEMPTION_MIN_ORDER_EUR} €.`,
        opens_at: opensAt.toISOString(),
      },
      { status: 425 }
    );
  }

  // ADR 0011 — fenêtre de 48 h, tenue ICI et pas seulement par le cron
  // horaire (`/api/cron/expire-rewards`). Le cron nettoie l'état ; cette
  // garde rend le refus déterministe, sans dépendre de l'instant où il a
  // tourné pour la dernière fois. On profite du passage pour clore la ligne :
  // c'est ce qui libère le slot un-seul-actif du membre, donc son cadeau
  // suivant, sans lui faire attendre l'heure ronde.
  if (isClaimWindowOver(reward.created_at, reward.source)) {
    await admin
      .from("pending_rewards")
      .update({ status: "expired" })
      .eq("id", reward.id)
      .eq("status", "available");
    return NextResponse.json(
      { error: "Ce cadeau n'est plus récupérable. Ta prochaine commande t'en ouvre un nouveau." },
      { status: 410 }
    );
  }

  const token = randomBytes(9).toString("base64url"); // 12 chars URL-safe
  const now = new Date().toISOString();
  const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString();

  // ADR sécurité F4 — anti double-coupon. Compare-and-swap ATOMIQUE : la
  // récompense passe 'redeemed' UNIQUEMENT si elle est encore 'available'
  // (UPDATE ... WHERE status='available' est atomique au niveau ligne). PUIS
  // on insère le token. Deux requêtes concurrentes (double-clic, 2 onglets,
  // script) : une seule gagne le CAS, l'autre reçoit 409 → jamais deux coupons
  // valides pour une même récompense. Remplace l'ancien Promise.all non atomique.
  const { data: claimed } = await admin
    .from("pending_rewards")
    .update({ status: "redeemed", redeemed_at: now })
    .eq("id", reward.id)
    .eq("status", "available")
    .select("id");

  if (!claimed || claimed.length === 0) {
    return NextResponse.json({ error: "Récompense déjà en cours de récupération." }, { status: 409 });
  }

  const { error: tokenError } = await admin.from("redemption_tokens").insert({
    user_id: user.id,
    reward_id: reward.id,
    restaurant_id: restaurantId,
    token,
    expires_at: expiresAt,
    // redeemed_at reste NULL ici : il est posé par la remise en caisse
    // (/api/redemption/[token]/redeem). Le poser dès la génération faisait
    // court-circuiter la route caissier (idempotence) AVANT le contrôle
    // d'expiration → « Cadeau remis » no-op + garde-fou 10 min désactivé.
  });

  if (tokenError) return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });

  return NextResponse.json({ token });
}
