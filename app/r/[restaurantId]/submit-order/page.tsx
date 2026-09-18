import { createServerSupabaseClient } from "@/lib/supabase";
import { loadRewardGrid } from "@/lib/rewards";
import { ticketPromiseItems } from "@/lib/home-view";
import { ensureMembership } from "@/app/join/actions";
import { getRestaurantBranding, logoPublicUrl } from "@/lib/restaurant";
import { getReceiptConfig } from "@/lib/receipt-config";
import { getFramingGuideUrl } from "@/lib/receipt-scans";
import { getTeamPrompt } from "@/lib/teams";
import SubmitOrderClient from "@/components/member/SubmitOrderClient";

// ADR 0040 — le scan est ouvert aux visiteurs : la photo d'abord, le compte au
// moment de l'envoi (« garde tes points »). Un connecté non-membre qui ouvre
// cet écran veut soumettre un ticket ICI → adhésion automatique (adhésion
// libre, ADR 0015 §3) — sinon /api/orders répondrait 403 au moment de l'envoi.
export default async function SubmitOrderPage({
  params,
  searchParams,
}: {
  params: Promise<{ restaurantId: string }>;
  searchParams: Promise<{ resume?: string }>;
}) {
  const { restaurantId } = await params;
  const { resume } = await searchParams;

  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (user) {
    const { data: membership } = await supabase
      .from("memberships")
      .select("user_id")
      .eq("user_id", user.id)
      .eq("restaurant_id", restaurantId)
      .maybeSingle();
    if (!membership) await ensureMembership(restaurantId);
  }

  // Même logo qu'en tête de la landing (ADR 0042/0043) — cohérence visuelle
  // du parcours visiteur d'un écran à l'autre.
  const branding = await getRestaurantBranding(restaurantId);
  const logoUrl = logoPublicUrl(branding.logo_url);

  // Guide de cadrage (incident 2026-09-02) : le spécimen nomme la clé du
  // ticket de CET établissement (« Bestelnummer »…). Seul le libellé sort —
  // le pattern reste service-role (ADR 0019).
  const receiptConfig = await getReceiptConfig(restaurantId);
  const keyLabel = receiptConfig.has_reliable_key ? receiptConfig.key_label : null;
  // Photo réelle de la zone à cadrer (echantillons/, ADR 0036 §3) — null si
  // aucun échantillon n'existe pour ce resto : le spécimen dessiné reste.
  const guidePhotoUrl = await getFramingGuideUrl(restaurantId);

  // Étape 10 — la question d'équipe (ADR 0031) se pose sur l'écran de succès
  // du ticket validé, plus à l'arrivée au dashboard : le cadeau vient de
  // tomber, la question se formule par le gain. getTeamPrompt filtre déjà :
  // équipe existante, relance pas échue → null.
  const teamPrompt = user ? await getTeamPrompt(user.id, restaurantId) : null;

  // Écran d'attente du membre (audit écran photo, 2026-09-15) : pendant la
  // vérification, ce que le ticket peut rapporter — noms de la grille solo,
  // jamais de seuil (ADR 0059) — ou, si un cadeau attend déjà, ce cadeau :
  // tant qu'il attend, un ticket n'en crée pas d'autre (ADR 0011).
  let waitPromise: string[] = [];
  let waitingGift: string | null = null;
  if (user) {
    const [grid, { data: gift }] = await Promise.all([
      loadRewardGrid(restaurantId),
      supabase
        .from("pending_rewards")
        .select("solo_item")
        .eq("user_id", user.id)
        .eq("restaurant_id", restaurantId)
        .eq("status", "available")
        .limit(1)
        .maybeSingle(),
    ]);
    waitPromise = ticketPromiseItems(grid.solo);
    waitingGift = (gift as { solo_item: string | null } | null)?.solo_item ?? null;
  }

  return (
    <SubmitOrderClient
      visitor={!user}
      resume={resume === "1"}
      logoUrl={logoUrl}
      receiptKeyLabel={keyLabel}
      guidePhotoUrl={guidePhotoUrl}
      teamPrompt={teamPrompt ? { suggestions: teamPrompt.suggestions.slice(0, 3) } : null}
      waitPromise={waitPromise}
      waitingGift={waitingGift}
    />
  );
}
