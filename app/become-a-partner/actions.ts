"use server";

import { redirect } from "next/navigation";
import { createServerSupabaseClient, createAdminClient } from "@/lib/supabase";
import { generateRestaurantSlug, isRestaurantOwner } from "@/lib/restaurant";
import { parseMenuCsv, upsertMenuCatalog } from "@/lib/menu";
import { applyDefaultRewardConfig } from "@/lib/reward-defaults";
import { isAllowedReceiptType } from "@/lib/receipt-ocr";
import { parseHttpUrl } from "@/lib/url";
import {
  discoverReceiptKey,
  validateProposedPattern,
  type ReceiptKeyProposal,
} from "@/lib/receipt-key-discovery";

// ADR 0015 §6-7 — un membre connecté crée son établissement lui-même et en
// devient l'admin (owner_id). Reste invisible (status 'pending') jusqu'à
// validation manuelle par le super-admin plateforme (/platform).
export async function createPartnerRestaurant(
  _prevState: { error: string } | null,
  formData: FormData
): Promise<{ error: string } | null> {
  const name = (formData.get("name") as string)?.trim();
  const sector = (formData.get("sector") as string)?.trim();
  const address = (formData.get("address") as string)?.trim() || null;
  const cuisineTypes = formData.getAll("cuisine_types").map((v) => String(v).trim()).filter(Boolean);

  if (!name || name.length < 2) {
    return { error: "Entre le nom de ton restaurant." };
  }
  // ADR 0016 §2 — maille d'agrégation de la page publique /secteurs
  if (!sector || sector.length < 2) {
    return { error: "Indique ta ville ou ton quartier." };
  }
  if (cuisineTypes.length > 5) {
    return { error: "5 types de cuisine maximum." };
  }

  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Non authentifié. Reconnecte-toi puis réessaie." };

  const slug = await generateRestaurantSlug(name);
  const admin = createAdminClient();
  const { error } = await admin.from("restaurants").insert({
    id: slug,
    name,
    sector,
    address,
    cuisine_types: cuisineTypes,
    owner_id: user.id,
    status: "pending",
  });

  if (error) {
    return { error: "Erreur lors de la création. Réessaie." };
  }

  redirect(`/become-a-partner/${slug}/menu`);
}

// Étape 2 — catalogue menu obligatoire (ADR 0013, réutilise lib/menu.ts tel
// quel). Nécessaire pour les stratégies de bundling/promotion à venir —
// chaque rôle d'un même article (ex. accompagnement gratuit vs à la carte)
// doit être soumis comme une ligne séparée par le restaurateur.
export async function submitOnboardingMenu(
  restaurantId: string,
  _prevState: { error: string; warnings?: string[] } | null,
  formData: FormData
): Promise<{ error: string; warnings?: string[] } | null> {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Non authentifié. Reconnecte-toi puis réessaie." };

  const owner = await isRestaurantOwner(user.id, restaurantId);
  if (!owner) return { error: "Tu n'es pas le propriétaire de cet établissement." };

  const csv = (formData.get("csv") as string) ?? "";
  const { items, errors } = parseMenuCsv(csv);

  if (items.length === 0) {
    return { error: "Aucun article valide trouvé dans le fichier.", warnings: errors };
  }

  await upsertMenuCatalog(restaurantId, items);

  // ADR 0017 §4 — dès le catalogue soumis, l'app calcule une grille protégée
  // (paliers dimensionnés par le panier moyen, articles sous plafond, cadeau
  // jetons) au lieu de laisser le resto sur la grille héritée. Non-destructif.
  await applyDefaultRewardConfig(restaurantId);

  // Étape 3/4 (ADR 0019) : découverte de la clé unique des tickets.
  redirect(`/become-a-partner/${restaurantId}/receipt`);
}

// ─── Étape 3 — clé unique du ticket (ADR 0019) ────────────────────────────────

async function requireOwner(restaurantId: string): Promise<{ userId: string } | { error: string }> {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Non authentifié. Reconnecte-toi puis réessaie." };
  const owner = await isRestaurantOwner(user.id, restaurantId);
  if (!owner) return { error: "Tu n'es pas le propriétaire de cet établissement." };
  return { userId: user.id };
}

export type ReceiptAnalysisState = {
  error?: string;
  proposal?: ReceiptKeyProposal;
};

// Analyse one-shot des tickets d'exemple (modèle fort — coût unique à
// l'onboarding). Enregistre la proposition SANS confirmed_at : l'app
// propose, le restaurateur décide (même principe qu'ADR 0013).
export async function analyzeReceiptSamples(
  restaurantId: string,
  _prevState: ReceiptAnalysisState | null,
  formData: FormData
): Promise<ReceiptAnalysisState> {
  const auth = await requireOwner(restaurantId);
  if ("error" in auth) return { error: auth.error };

  const files = formData
    .getAll("receipts")
    .filter((f): f is File => f instanceof File && f.size > 0)
    .slice(0, 3);

  if (files.length < 2) {
    return { error: "Ajoute au moins 2 photos de tickets différents." };
  }
  for (const file of files) {
    if (file.size > 5 * 1024 * 1024) return { error: "Image trop lourde (max 5 Mo par photo)." };
    if (!isAllowedReceiptType(file.type)) {
      return { error: "Format non supporté. Utilise JPG, PNG ou WebP." };
    }
  }

  const { data: restaurant } = await createAdminClient()
    .from("restaurants")
    .select("name")
    .eq("id", restaurantId)
    .single();

  let proposal: ReceiptKeyProposal;
  try {
    proposal = await discoverReceiptKey(files, restaurant?.name ?? restaurantId);
  } catch (err) {
    console.error("[receipt-discovery] échec:", err);
    return { error: "L'analyse des tickets a échoué. Réessaie avec des photos plus nettes." };
  }

  const admin = createAdminClient();
  const { error } = await admin.from("restaurant_receipt_config").upsert({
    restaurant_id: restaurantId,
    has_reliable_key: proposal.has_reliable_key,
    key_label: proposal.key_label || null,
    key_description: proposal.key_description || null,
    key_pattern: proposal.key_pattern || null,
    key_examples: proposal.key_examples,
    position_hint: proposal.position_hint || null,
    date_group: proposal.date_group,
    confirmed_at: null,
    confirmed_by: null,
    updated_at: new Date().toISOString(),
  });
  if (error) return { error: "Erreur lors de l'enregistrement de la proposition. Réessaie." };

  return { proposal };
}

// Confirmation (éventuellement corrigée) par le restaurateur. skip=true
// enregistre explicitement "pas de clé fiable" : les commandes de ce resto
// passeront par la file admin (flag no_order_key).
export async function confirmReceiptConfig(
  restaurantId: string,
  _prevState: { error: string } | null,
  formData: FormData
): Promise<{ error: string } | null> {
  const auth = await requireOwner(restaurantId);
  if ("error" in auth) return { error: auth.error };

  const skip = formData.get("skip") === "true";
  const admin = createAdminClient();

  if (skip) {
    const { error } = await admin.from("restaurant_receipt_config").upsert({
      restaurant_id: restaurantId,
      has_reliable_key: false,
      key_label: null,
      key_description: null,
      key_pattern: null,
      key_examples: [],
      position_hint: null,
      date_group: null,
      confirmed_at: new Date().toISOString(),
      confirmed_by: auth.userId,
      updated_at: new Date().toISOString(),
    });
    if (error) return { error: "Erreur lors de l'enregistrement. Réessaie." };
    // Étape 4/4 (optionnelle) : liens réseaux sociaux.
    redirect(`/become-a-partner/${restaurantId}/social`);
  }

  const keyLabel = (formData.get("key_label") as string)?.trim();
  const keyDescription = (formData.get("key_description") as string)?.trim();
  const keyPattern = (formData.get("key_pattern") as string)?.trim();
  const keyExamples = formData
    .getAll("key_examples")
    .map((v) => String(v).trim())
    .filter(Boolean);
  const positionHint = (formData.get("position_hint") as string)?.trim() || null;
  const rawDateGroup = (formData.get("date_group") as string)?.trim();
  const dateGroup = rawDateGroup && /^\d+$/.test(rawDateGroup) ? parseInt(rawDateGroup, 10) : null;

  if (!keyLabel || !keyDescription || !keyPattern) {
    return { error: "Nom du champ, description et pattern sont requis." };
  }
  const patternError = validateProposedPattern(keyPattern, keyExamples);
  if (patternError) return { error: patternError };

  const { error } = await admin.from("restaurant_receipt_config").upsert({
    restaurant_id: restaurantId,
    has_reliable_key: true,
    key_label: keyLabel,
    key_description: keyDescription,
    key_pattern: keyPattern,
    key_examples: keyExamples,
    position_hint: positionHint,
    date_group: dateGroup,
    confirmed_at: new Date().toISOString(),
    confirmed_by: auth.userId,
    updated_at: new Date().toISOString(),
  });
  if (error) return { error: "Erreur lors de l'enregistrement. Réessaie." };

  // Étape 4/4 (optionnelle) : liens réseaux sociaux.
  redirect(`/become-a-partner/${restaurantId}/social`);
}

// ─── Étape 4 (optionnelle) — liens réseaux sociaux ───────────────────────────
// Alimentent les actions sociales du dashboard membre (Carte Actions).
// Skippable : reconfigurable à tout moment depuis /admin/[restaurantId]/settings.
export async function submitOnboardingSocial(
  restaurantId: string,
  _prevState: { error: string } | null,
  formData: FormData
): Promise<{ error: string } | null> {
  const auth = await requireOwner(restaurantId);
  if ("error" in auth) return { error: auth.error };

  if (formData.get("skip") !== "true") {
    const admin = createAdminClient();
    const { error } = await admin
      .from("restaurants")
      .update({
        google_maps_url: parseHttpUrl(formData.get("google_maps_url") as string),
        instagram_url: parseHttpUrl(formData.get("instagram_url") as string),
        tiktok_url: parseHttpUrl(formData.get("tiktok_url") as string),
        facebook_url: parseHttpUrl(formData.get("facebook_url") as string),
      })
      .eq("id", restaurantId);
    if (error) return { error: "Erreur lors de l'enregistrement. Réessaie." };
  }

  redirect(`/admin/${restaurantId}/menu`);
}
