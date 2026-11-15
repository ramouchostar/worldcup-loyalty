"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createServerSupabaseClient } from "@/lib/supabase";
import { isEstablishmentAdmin } from "@/lib/admin-guard";
import { todayInBrussels } from "@/lib/qr-funnel";
import { judgeRedeem, normalizeVoucherCode } from "@/lib/ads/vouchers";
import { getVoucherByCode, getVoucherByToken, markVoucherRedeemed } from "@/lib/ads/vouchers-data";

// ADR 0104 §2 — la caisse valide un bon de pub. Même contrôle d'accès que le coupon du membre
// (ADR 0011, 0015 §7) : l'accès se vérifie sur l'établissement DU BON, siège d'équipe compris
// (c'est souvent l'équipier au comptoir qui scanne). Une seule utilisation : un second appui
// ne compte pas deux fois.

async function currentUser() {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login?reason=login-required");
  return user;
}

export async function redeemVoucherAction(formData: FormData): Promise<void> {
  const user = await currentUser();
  const token = String(formData.get("token") ?? "");
  const v = await getVoucherByToken(token);
  if (!v) redirect(`/admin/bon/${encodeURIComponent(token)}`);
  if (!(await isEstablishmentAdmin(user.id, v.restaurant_id))) redirect("/join?reason=admin-required");
  const verdict = judgeRedeem({ redeemedAt: v.redeemed_at }, v.offer, todayInBrussels());
  if (verdict.ok && !verdict.already) {
    const r = await markVoucherRedeemed(v.id, user.id);
    if (!r.ok) redirect(`/admin/bon/${token}?erreur=ecriture`);
    console.info(`[bon] utilisé restaurant=${v.restaurant_id} demande=${v.request_id}`);
  }
  revalidatePath(`/admin/bon/${token}`);
  redirect(`/admin/bon/${token}`);
}

/** Le code tapé à la caisse (sans QR) : ouvre le bon s'il est de cet établissement. */
export async function findVoucherAction(formData: FormData): Promise<void> {
  const user = await currentUser();
  const restaurantId = String(formData.get("restaurantId") ?? "");
  if (!restaurantId || !(await isEstablishmentAdmin(user.id, restaurantId))) redirect("/join?reason=admin-required");
  const code = normalizeVoucherCode(String(formData.get("code") ?? ""));
  if (!code) redirect(`/admin/${restaurantId}/bon?erreur=forme`);
  const v = await getVoucherByCode(restaurantId, code);
  if (!v) redirect(`/admin/${restaurantId}/bon?erreur=inconnu&code=${code}`);
  redirect(`/admin/bon/${v.token}`);
}
