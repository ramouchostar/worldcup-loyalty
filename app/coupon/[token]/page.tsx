import { notFound } from "next/navigation";
import { createAdminClient } from "@/lib/supabase";
import { getRestaurant } from "@/lib/restaurant";
import { CouponClient } from "./CouponClient";

export default async function CouponPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const admin = createAdminClient();

  const { data: tokenRow } = await admin
    .from("redemption_tokens")
    .select(
      "token, expires_at, redeemed_at, restaurant_id, pending_rewards(solo_item, community_item, advancement_item), profiles(display_name)"
    )
    .eq("token", token)
    .single();

  if (!tokenRow) notFound();

  const reward = tokenRow.pending_rewards as unknown as {
    solo_item: string | null;
    community_item: string | null;
    advancement_item: string | null;
  } | null;

  const items: { icon: string; label: string; sublabel: string }[] = [];
  if (reward?.solo_item)
    items.push({ icon: "🍗", label: reward.solo_item, sublabel: "cadeau de base" });
  if (reward?.community_item)
    items.push({ icon: "👥", label: `+ ${reward.community_item}`, sublabel: "bonus communautaire" });
  if (reward?.advancement_item)
    items.push({ icon: "🏆", label: `+ ${reward.advancement_item}`, sublabel: "bonus d'équipe" });

  const profile = tokenRow.profiles as unknown as { display_name: string } | null;
  // La table redemption_tokens n'a PAS de FK vers restaurants → l'embed
  // PostgREST échouait et faisait 404 tout l'écran coupon (bug pré-existant,
  // trouvé en vérif live 2026-07). On résout le nom via restaurant_id.
  const restaurant = await getRestaurant(String(tokenRow.restaurant_id));

  return (
    <CouponClient
      token={token}
      expiresAt={tokenRow.expires_at}
      memberName={profile?.display_name ?? "Membre"}
      items={items}
      isAdmin={false}
      restaurantName={restaurant?.name}
      backHref={`/r/${tokenRow.restaurant_id}/my-rewards`}
    />
  );
}
