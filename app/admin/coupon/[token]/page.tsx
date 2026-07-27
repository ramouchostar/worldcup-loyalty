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
      "token, expires_at, redeemed_at, restaurant_id, user_id, pending_rewards(solo_item, community_item, advancement_item, source), profiles(display_name)"
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
    source: string | null;
  } | null;

  // ADR 0024 — cadeau d'anniversaire : le cashier voit la dépense cumulée du
  // membre — ce cadeau est un investissement sur un client fidèle, pas une
  // dépense. Surface admin : euros autorisés (ADR 0007).
  let birthdaySublabel: string | null = null;
  if (reward?.source === "birthday") {
    const { data: memberOrders } = await admin
      .from("orders")
      .select("amount")
      .eq("user_id", tokenRow.user_id)
      .eq("restaurant_id", tokenRow.restaurant_id)
      .eq("status", "validated")
      .limit(1000);
    const spent = ((memberOrders ?? []) as { amount: number }[]).reduce((s, o) => s + Number(o.amount), 0);
    birthdaySublabel = `🎂 cadeau d'anniversaire — client fidèle : €${Math.round(spent)} dépensés`;
  }

  const items: { icon: string; label: string; sublabel: string }[] = [];
  if (reward?.solo_item)
    items.push({
      icon: birthdaySublabel ? "🎂" : "🍗",
      label: reward.solo_item,
      sublabel: birthdaySublabel ?? "cadeau de base",
    });
  if (reward?.community_item)
    items.push({ icon: "👥", label: `+ ${reward.community_item}`, sublabel: "bonus communautaire" });
  if (reward?.advancement_item)
    items.push({ icon: "🏆", label: `+ ${reward.advancement_item}`, sublabel: "bonus d'équipe" });

  const memberProfile = tokenRow.profiles as unknown as { display_name: string } | null;

  return (
    <CouponClient
      token={token}
      expiresAt={tokenRow.expires_at}
      memberName={memberProfile?.display_name ?? "Membre"}
      items={items}
      isAdmin={true}
      backHref={`/admin/${tokenRow.restaurant_id}/pending-rewards`}
    />
  );
}
