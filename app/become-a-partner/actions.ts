"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { PARTNER_ATTRIBUTION_COOKIE, decodeAttribution } from "@/lib/partner-attribution";
import { createRestaurantsFromDraft, partnerNextStep, PARTNER_PROGRESS_PATH, type DraftResult } from "@/lib/partner-signup";
import { createServerSupabaseClient, createAdminClient } from "@/lib/supabase";
import { isRestaurantOwner } from "@/lib/restaurant";
import { parseMenuCsv, upsertMenuCatalog } from "@/lib/menu";
import { applyDefaultRewardConfig } from "@/lib/reward-defaults";
import { isAllowedReceiptType } from "@/lib/receipt-ocr";
import { parseHttpUrl } from "@/lib/url";
import {
  discoverReceiptKey,
  validateProposedPattern,
  type ReceiptKeyProposal,
} from "@/lib/receipt-key-discovery";

// ADR 0075 §1 — le brouillon (établissements trouvés sur Google, corrigés)
// devient de vrais établissements `pending` dès que le compte existe. Le
// brouillon du navigateur arrive ici (compte Google, ou déjà connecté) ; celui
// d'une inscription e-mail passe par auth/callback (métadonnées). Même
// fonction des deux côtés : createRestaurantsFromDraft.
export async function registerDraftEstablishments(
  draftJson: string
): Promise<{ error: string } | { result: DraftResult; next: string | null }> {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Non authentifié. Reconnecte-toi puis réessaie." };

  let raw: unknown = null;
  try {
    raw = JSON.parse(draftJson);
  } catch {
    return { error: "Brouillon illisible. Recommence la recherche de ton établissement." };
  }

  const cookieStore = await cookies();
  const attribution = decodeAttribution(cookieStore.get(PARTNER_ATTRIBUTION_COOKIE)?.value);
  const result = await createRestaurantsFromDraft({ id: user.id, email: user.email ?? null }, raw, attribution);
  if (result.created.length && attribution) cookieStore.set(PARTNER_ATTRIBUTION_COOKIE, "", { maxAge: 0, path: "/" });
  cookieStore.set("pending_become_partner", "", { maxAge: 0, path: "/" });

  const ids = [...result.created, ...result.alreadyMine].map((r) => r.id);
  if (ids.length === 0 && result.takenByOthers.length === 0) {
    return { error: "Aucun établissement n'a pu être enregistré. Réessaie dans un instant." };
  }
  return { result, next: ids.length ? partnerNextStep(ids) : null };
}

// ADR 0075 §2 — les autres établissements à qui on applique la même carte ou
// la même caisse : seulement ceux de CE restaurateur (siège vérifié un par un).
async function ownedCopyTargets(userId: string, currentId: string, formData: FormData): Promise<string[]> {
  const ids = Array.from(new Set(formData.getAll("copy_to").map((v) => String(v)).filter((id) => id && id !== currentId))).slice(0, 10);
  const checks = await Promise.all(ids.map(async (id) => ((await isRestaurantOwner(userId, id)) ? id : null)));
  return checks.filter((id): id is string => !!id);
}

// ADR 0075 §6 — un établissement ajouté plus tard reprend la carte ou la
// caisse d'un établissement existant du même restaurateur (siège vérifié sur
// les deux). La carte est copiée article par article (prix et coûts compris,
// jamais montrés aux clients) ; la caisse : le format seulement, jamais
// store_code ni key_examples (ADR 0073).
export async function copyMenuFrom(targetId: string, sourceId: string): Promise<void> {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user || targetId === sourceId) return;
  if (!(await isRestaurantOwner(user.id, targetId)) || !(await isRestaurantOwner(user.id, sourceId))) return;

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("menu_items")
    .select("name, category, menu_price, cost_price")
    .eq("restaurant_id", sourceId)
    .eq("is_active", true);
  if (error || !data?.length) {
    console.error("[inscription] carte à reprendre illisible ou vide :", sourceId, error?.message);
    redirect(`/become-a-partner/${targetId}/menu`);
  }
  await upsertMenuCatalog(
    targetId,
    data.map((r) => ({
      name: r.name as string,
      category: r.category as string,
      menu_price: Number(r.menu_price),
      cost_price: Number(r.cost_price),
    })),
  );
  await applyDefaultRewardConfig(targetId);
  redirect(`/become-a-partner/${targetId}/receipt`);
}

export async function copyReceiptFormatFrom(targetId: string, sourceId: string): Promise<void> {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user || targetId === sourceId) return;
  if (!(await isRestaurantOwner(user.id, targetId)) || !(await isRestaurantOwner(user.id, sourceId))) return;

  const admin = createAdminClient();
  const { data: src } = await admin
    .from("restaurant_receipt_config")
    .select("has_reliable_key, key_label, key_description, key_pattern, position_hint, date_group, confirmed_at")
    .eq("restaurant_id", sourceId)
    .maybeSingle();
  if (!src?.confirmed_at) redirect(`/become-a-partner/${targetId}/receipt`);
  const { error } = await admin.from("restaurant_receipt_config").upsert({
    ...src,
    restaurant_id: targetId,
    key_examples: [],
    confirmed_at: new Date().toISOString(),
    confirmed_by: user.id,
    updated_at: new Date().toISOString(),
  });
  if (error) {
    console.error("[inscription] format de ticket non repris :", targetId, error.message);
    redirect(`/become-a-partner/${targetId}/receipt`);
  }
  redirect(PARTNER_PROGRESS_PATH);
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

  // ADR 0075 §2 — la même carte copiée dans les établissements choisis
  // (menu_items est par établissement, ADR 0013 : une copie par établissement,
  // qui divergent ensuite librement).
  const targets = [restaurantId, ...(await ownedCopyTargets(user.id, restaurantId, formData))];
  for (const id of targets) {
    await upsertMenuCatalog(id, items);
    // ADR 0017 §4 — dès le catalogue soumis, l'app calcule une grille protégée
    // (paliers dimensionnés par le panier moyen, articles sous plafond, cadeau
    // jetons) au lieu de laisser le resto sur la grille héritée. Non-destructif.
    await applyDefaultRewardConfig(id);
  }

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
  const configRow = {
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
  };
  // Ce que la découverte a compris du ticket au-delà de la clé (ADR 0066,
  // migration 20260923-1000) : tant qu'elle n'est pas appliquée, on
  // enregistre sans ce champ plutôt que de casser l'onboarding.
  let { error } = await admin
    .from("restaurant_receipt_config")
    .upsert({ ...configRow, receipt_profile: proposal.profile });
  if (error && /receipt_profile/.test(error.message)) {
    ({ error } = await admin.from("restaurant_receipt_config").upsert(configRow));
  }
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
  const copyTargets = await ownedCopyTargets(auth.userId, restaurantId, formData);

  // ADR 0075 §2 — même caisse dans plusieurs établissements : le FORMAT est
  // copié, jamais `store_code` (le code d'établissement imprimé dans la clé,
  // ADR 0073 — le copier ferait accepter chez B les tickets de A) ni
  // `key_examples` (de vraies clés de cet établissement). Upsert sans ces
  // colonnes : un store_code déjà posé chez la cible n'est pas touché.
  async function copyFormat(row: Record<string, unknown>) {
    for (const id of copyTargets) {
      const { error } = await admin
        .from("restaurant_receipt_config")
        .upsert({ ...row, restaurant_id: id, key_examples: [] });
      if (error) console.error("[inscription] format de ticket non copié vers", id, error.message);
    }
  }

  if (skip) {
    const row = {
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
    };
    const { error } = await admin.from("restaurant_receipt_config").upsert(row);
    if (error) return { error: "Erreur lors de l'enregistrement. Réessaie." };
    await copyFormat(row);
    // ADR 0075 §3 — fin du tunnel : la page d'avancement dit ce qui reste.
    redirect(PARTNER_PROGRESS_PATH);
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

  const row = {
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
  };
  const { error } = await admin.from("restaurant_receipt_config").upsert(row);
  if (error) return { error: "Erreur lors de l'enregistrement. Réessaie." };
  await copyFormat(row);

  // ADR 0075 §3 — fin du tunnel : la page d'avancement dit ce qui reste.
  // Réseaux sociaux : dans les réglages (§5), plus une étape.
  redirect(PARTNER_PROGRESS_PATH);
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
