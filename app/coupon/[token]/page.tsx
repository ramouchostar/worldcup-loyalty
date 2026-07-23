import { notFound } from "next/navigation";
import { createAdminClient } from "@/lib/supabase";
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
      "token, expires_at, redeemed_at, pending_rewards(solo_item, community_item, advancement_item), profiles(display_name), restaurants(name)"
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
  const restaurant = tokenRow.restaurants as unknown as { name: string } | null;

  return (
    <CouponClient
      token={token}
      expiresAt={tokenRow.expires_at}
      memberName={profile?.display_name ?? "Membre"}
      items={items}
      isAdmin={false}
      restaurantName={restaurant?.name}
    />
  );
}
