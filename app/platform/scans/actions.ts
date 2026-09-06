"use server";

import { revalidatePath } from "next/cache";
import { createServerSupabaseClient, createAdminClient } from "@/lib/supabase";
import { validateAmount } from "@/lib/orders";
import { getReceiptConfig, extractDateFromKey } from "@/lib/receipt-config";
import { createPendingReward } from "@/lib/rewards";
import { incrementProgramRevenue } from "@/lib/budget";
import { insertOrderItems } from "@/lib/order-items";
import { linkScanToOrder } from "@/lib/receipt-scans";
import { sendPush } from "@/lib/notifications";
import type { ReceiptLineItem } from "@/lib/receipt-ocr";

// Rattrapage plateforme d'un ticket que le parcours normal a laissé au bord
// de la route : entête non reconnue, montant mal lu, commande refusée par le
// restaurateur. On tranche À LA PLACE du restaurateur, avec l'image sous les
// yeux — c'est le seul endroit du produit qui voit l'image, la lecture OCR et
// l'encodage final côte à côte (ADR 0036).
//
// Deux chemins, un seul geste côté écran :
//   • le scan n'a jamais produit de commande → on la CRÉE, validée ;
//   • le scan a une commande en attente ou refusée → on la corrige et on la
//     valide.
// Dans les deux cas la suite est celle d'une validation normale : CA du
// programme (ADR 0012), récompenses 3 couches (ADR 0006), notification au
// membre. Rien de spécifique, sinon on créerait un deuxième pipeline à
// maintenir.

// Trace laissée sur la commande : elle n'a pas été validée par le parcours
// habituel. Inconnu de FLAG_LABELS côté restaurateur (il n'affiche que ce
// qu'il connaît), lisible ici et en base.
const FORCED_FLAG = "platform_forced";

export type ScanActionResult = { ok: boolean; message: string };

// Même garde locale que app/platform/actions.ts : lib/admin-guard.ts renvoie
// des NextResponse, faits pour les routes API, pas pour les Server Actions.
async function requireSuperAdmin() {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const { data: profile } = await supabase.from("profiles").select("is_super_admin").eq("id", user.id).single();
  return profile?.is_super_admin ? user : null;
}

type ScanRecord = {
  id: string;
  restaurant_id: string;
  user_id: string;
  storage_path: string | null;
  scanned_at: string;
  order_id: string | null;
  ocr_amount: number | null;
  ocr_confidence: number | null;
  ocr_order_time: string | null;
  ocr_items: ReceiptLineItem[] | null;
};

type OrderRecord = {
  id: string;
  status: string;
  amount: number;
  user_id: string;
  team_id: string | null;
  flag_reasons: string[] | null;
};

// L'heure vient d'une lecture OCR : elle finit dans une colonne TIME, une
// valeur fantaisiste ferait échouer tout l'INSERT. On préfère pas d'heure.
function heureSaine(value: string | null): string | null {
  return value && /^\d{1,2}:\d{2}(:\d{2})?$/.test(value.trim()) ? value.trim() : null;
}

function euros(n: number): string {
  return n.toLocaleString("fr-BE", { style: "currency", currency: "EUR" });
}

/**
 * Suite d'une validation — identique à celle de /api/admin/orders : le CA du
 * programme d'abord (le budget du mois doit inclure cette commande au moment
 * où la récompense se calcule, ADR 0012), puis les trois couches, puis le
 * membre prévenu. Best-effort : la commande est déjà validée, un cadeau qui
 * ne part pas ne doit pas laisser croire que rien n'a été fait.
 */
async function creditOrder(params: {
  orderId: string;
  userId: string;
  teamId: string | null;
  restaurantId: string;
  amount: number;
}): Promise<string> {
  const { orderId, userId, teamId, restaurantId, amount } = params;
  await incrementProgramRevenue(restaurantId, amount);
  let reward = "";
  try {
    const result = await createPendingReward(orderId, userId, teamId, restaurantId, amount);
    reward = result.created ? " Cadeau crédité." : " Aucun nouveau cadeau (un cadeau est déjà en attente).";
  } catch (e) {
    console.error("[platform/scans] createPendingReward failed:", (e as Error).message);
    reward = " ⚠️ La commande est validée mais la récompense n'a pas pu être créée — à reprendre à la main.";
  }
  void sendPush(
    userId,
    restaurantId,
    `✅ Ta commande de ${euros(amount)} a été validée ! Tes récompenses t'attendent.`
  ).catch(() => {});
  return reward;
}

/**
 * Valide le ticket d'un scan, au montant (et à la clé) corrigés à la main.
 * Crée la commande si le scan n'en a jamais produit.
 */
export async function forceValidateScan(input: {
  scanId: string;
  amount: number;
  orderKey: string;
}): Promise<ScanActionResult> {
  const user = await requireSuperAdmin();
  if (!user) return { ok: false, message: "Accès refusé." };

  const amountError = validateAmount(input.amount);
  if (amountError) return { ok: false, message: amountError };
  const amount = parseFloat(Number(input.amount).toFixed(2));
  const key = (input.orderKey ?? "").trim();

  const admin = createAdminClient();
  const { data: scanRaw, error: scanError } = await admin
    .from("receipt_scans")
    .select("id, restaurant_id, user_id, storage_path, scanned_at, order_id, ocr_amount, ocr_confidence, ocr_order_time, ocr_items")
    .eq("id", input.scanId)
    .maybeSingle();
  if (scanError || !scanRaw) return { ok: false, message: "Scan introuvable." };
  const scan = scanRaw as ScanRecord;

  const now = new Date().toISOString();

  // ── Cas 1 : une commande existe déjà (en attente ou refusée) ────────────
  if (scan.order_id) {
    const { data: orderRaw } = await admin
      .from("orders")
      .select("id, status, amount, user_id, team_id, flag_reasons")
      .eq("id", scan.order_id)
      .maybeSingle();
    const order = orderRaw as OrderRecord | null;
    if (!order) return { ok: false, message: "La commande liée à ce scan est introuvable." };

    // Le score d'équipe est crédité par un trigger, au SEUL passage à
    // « validated » (m59). Rejouer une commande déjà validée avec un autre
    // montant changerait la ligne sans toucher au score : on refuse plutôt
    // que de laisser diverger les deux.
    if (order.status === "validated") {
      return { ok: false, message: "Cette commande est déjà validée — son montant ne peut plus être corrigé ici." };
    }

    const flags = Array.from(new Set([...(order.flag_reasons ?? []), FORCED_FLAG]));
    // Montant ET statut dans le même UPDATE : le trigger de score lit
    // NEW.amount au moment du passage à « validated ».
    const update: Record<string, unknown> = {
      amount,
      status: "validated",
      validated_at: now,
      rejection_reason: null,
      flag_reasons: flags,
    };
    if (key) {
      update.order_number = key;
      update.duplicate_key = `${scan.restaurant_id}:${key}`;
    }

    const { error: updateError } = await admin
      .from("orders")
      .update(update)
      .eq("id", order.id)
      .eq("restaurant_id", scan.restaurant_id); // jamais muter la commande d'un autre établissement
    if (updateError) {
      if (updateError.code === "23505") {
        return { ok: false, message: "Ce numéro de ticket appartient déjà à une autre commande — rien n'a été modifié." };
      }
      return { ok: false, message: "La commande n'a pas pu être validée." };
    }

    const reward = await creditOrder({
      orderId: order.id,
      userId: order.user_id,
      teamId: order.team_id,
      restaurantId: scan.restaurant_id,
      amount,
    });
    revalidatePath("/platform/scans");
    return { ok: true, message: `Commande validée à ${euros(amount)}.${reward}` };
  }

  // ── Cas 2 : le scan n'a jamais produit de commande ──────────────────────
  const { data: membershipRaw } = await admin
    .from("memberships")
    .select("team_id")
    .eq("user_id", scan.user_id)
    .eq("restaurant_id", scan.restaurant_id)
    .maybeSingle();
  const membership = membershipRaw as { team_id: string | null } | null;
  // ADR 0034 — l'équipe n'est pas exigée, l'adhésion à l'établissement si :
  // c'est elle qui porte le lien membre ↔ resto. Sans elle, la commande
  // n'aurait ni score ni cadeau à alimenter.
  if (!membership) {
    return { ok: false, message: "Ce membre n'a pas rejoint cet établissement : rien à créditer tant qu'il ne l'a pas fait." };
  }

  const config = await getReceiptConfig(scan.restaurant_id);
  // Date du ticket : celle encapsulée dans la clé quand le format la porte,
  // sinon le jour du scan — jamais « aujourd'hui », un rattrapage peut
  // arriver longtemps après.
  const orderDate = (key ? extractDateFromKey(key, config) : null) ?? scan.scanned_at.slice(0, 10);
  // Sans clé lisible, une clé synthétique DÉTERMINISTE : un double clic ne
  // crée pas deux commandes, l'index UNIQUE s'en charge.
  const duplicateKey = key ? `${scan.restaurant_id}:${key}` : `${scan.restaurant_id}:FORCED_${scan.id}`;

  const { data: inserted, error: insertError } = await admin
    .from("orders")
    .insert({
      user_id: scan.user_id,
      team_id: membership.team_id ?? null,
      amount,
      order_number: key || null,
      order_date: orderDate,
      order_time: heureSaine(scan.ocr_order_time),
      receipt_url: scan.storage_path,
      ocr_amount: scan.ocr_amount,
      ocr_confidence: scan.ocr_confidence,
      flag_reasons: [FORCED_FLAG],
      duplicate_key: duplicateKey,
      status: "validated",
      validated_at: now,
      submitted_at: scan.scanned_at,
      restaurant_id: scan.restaurant_id,
    })
    .select("id")
    .single();

  if (insertError || !inserted) {
    if (insertError?.code === "23505") {
      return { ok: false, message: "Ce ticket a déjà une commande (numéro en double) — rien n'a été créé." };
    }
    console.error("[platform/scans] insert order failed:", insertError?.message);
    return { ok: false, message: "La commande n'a pas pu être créée." };
  }

  const orderId = (inserted as { id: string }).id;
  // Le scan sait ce qu'il est devenu (ADR 0036) : la ligne passe en
  // « Devenu commande » et l'écart image ↔ encodage redevient lisible.
  await linkScanToOrder(scan.id, scan.user_id, orderId);
  // Lignes d'articles lues à l'époque (ADR 0020) : sans elles, la commande
  // rattrapée manquerait aux ventes par plat et au taux de rattachement.
  if (scan.ocr_items && scan.ocr_items.length > 0) {
    await insertOrderItems(orderId, scan.restaurant_id, scan.ocr_items);
  }

  const reward = await creditOrder({
    orderId,
    userId: scan.user_id,
    teamId: membership.team_id ?? null,
    restaurantId: scan.restaurant_id,
    amount,
  });
  revalidatePath("/platform/scans");
  return { ok: true, message: `Commande créée et validée à ${euros(amount)}.${reward}` };
}
