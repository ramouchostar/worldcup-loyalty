import { notFound, redirect } from "next/navigation";
import { createServerSupabaseClient, createAdminClient } from "@/lib/supabase";
import { getRestaurantId, isRestaurantOwner } from "@/lib/restaurant";
import { CouponClient } from "@/app/coupon/[token]/CouponClient";

export default async function AdminCouponPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

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

  // ADR 0015 §7 — validé par le token, pas par navigation d'établissement :
  // on résout le restaurant du coupon puis on vérifie l'accès (pont legacy
  // is_admin sur le restaurant par défaut, ou owner_id pour le self-service).
  const { data: profile } = await admin
    .from("profiles")
    .select("is_admin")
    .eq("id", user.id)
    .single();

  const isLegacyAdmin = !!profile?.is_admin && tokenRow.restaurant_id === getRestaurantId();
  const isOwner = await isRestaurantOwner(user.id, tokenRow.restaurant_id);
  if (!isLegacyAdmin && !isOwner) redirect("/join");

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
    items.push({ icon: "⚽", label: `+ ${reward.advancement_item}`, sublabel: "avancement" });

  const memberProfile = tokenRow.profiles as unknown as { display_name: string } | null;

  return (
    <CouponClient
      token={token}
      expiresAt={tokenRow.expires_at}
      memberName={memberProfile?.display_name ?? "Membre"}
      items={items}
      isAdmin={true}
    />
  );
}
