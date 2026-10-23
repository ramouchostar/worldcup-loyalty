import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { createServerSupabaseClient, createAdminClient } from "@/lib/supabase";
import { getAdminAccess } from "@/lib/admin-guard";
import { getPlan } from "@/lib/entitlements";
import { AD_FEE_PCT } from "@/lib/service-offers";
import { pubConfig } from "@/lib/ads/config";
import { getBilling, instagramPosts, pubAvailability } from "@/lib/ads/requests";
import { todayBrussels } from "@/lib/ads/sync";
import { PageHeader } from "@/components/admin/ui";
import { NewAdForm, type PostOption } from "./NewAdForm";

// ADR 0086 §1, §3, §6 — la demande : objectif, publication, zone et dates, budget,
// facturation (la première fois), montant à payer. Maquette validée le 2026-10-23.

export const dynamic = "force-dynamic";

const PLAN_LABEL = { gratuit: "Gratuit", croissance: "Croissance", pro: "Pro" } as const;

export default async function NewPubPage({ params }: { params: Promise<{ restaurantId: string }> }) {
  const { restaurantId } = await params;
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const access = await getAdminAccess(user.id, restaurantId);
  const av = await pubAvailability(restaurantId, access.isSuperAdmin);
  if (!av.open) notFound();

  const [plan, billing, ig, rest] = await Promise.all([
    getPlan(restaurantId),
    getBilling(restaurantId),
    instagramPosts(restaurantId),
    createAdminClient().from("restaurants").select("address").eq("id", restaurantId).single(),
  ]);
  const posts: PostOption[] = ig.ok
    ? ig.posts.map((p) => ({ id: p.id, mediaType: p.media_type, likes: p.like_count ?? 0, comments: p.comments_count ?? 0, thumbnail: p.thumbnail_url ?? (p.media_type !== "VIDEO" ? (p.media_url ?? null) : null), permalink: p.permalink ?? null, caption: p.caption ?? null }))
    : [];

  return (
    <div className="space-y-5 max-w-2xl">
      <div>
        <Link href={`/admin/${restaurantId}/pub`} className="text-[14px] text-boost-olive-dark hover:text-ink">‹ Pub</Link>
        <div className="mt-1.5">
          <PageHeader title="Nouvelle pub" />
        </div>
      </div>
      <NewAdForm
        restaurantId={restaurantId}
        today={todayBrussels()}
        posts={posts}
        address={(rest.data as { address: string | null } | null)?.address ?? null}
        feePct={AD_FEE_PCT[plan]}
        planLabel={PLAN_LABEL[plan]}
        vatRate={pubConfig().vatRate}
        billing={billing}
      />
    </div>
  );
}
