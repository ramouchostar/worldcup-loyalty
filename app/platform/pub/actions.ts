"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createServerSupabaseClient } from "@/lib/supabase";
import { attachManually, confirmPayment, launchRequest, retryPrepare, sendBack, setIdentity, setInvoiceNumber } from "@/lib/ads/requests";
import { runAdsSync } from "@/lib/ads/sync";

// ADR 0086 §2 — les gestes de Mehdi. Réservés au super-admin : chaque action se re-garde
// (une Server Action est une route publique).
async function requireSuperAdmin(): Promise<string> {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const { data: profile } = await supabase.from("profiles").select("is_super_admin").eq("id", user.id).single();
  if (!profile?.is_super_admin) redirect("/join?reason=platform-required");
  return user.id;
}

export type PubActionResult = { ok: boolean; error?: string; warning?: string };
const done = () => revalidatePath("/platform/pub");

export async function confirmPaymentAction(noticeId: string, receivedEuros: string, receivedOn: string): Promise<PubActionResult> {
  const userId = await requireSuperAdmin();
  const cents = Math.round(Number(receivedEuros.replace(",", ".")) * 100);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(receivedOn)) return { ok: false, error: "Date de réception invalide." };
  const r = await confirmPayment(noticeId, cents, receivedOn, userId);
  done();
  return r;
}

export async function launchAction(requestId: string): Promise<PubActionResult> {
  const userId = await requireSuperAdmin();
  const r = await launchRequest(requestId, userId);
  done();
  return r;
}

export async function sendBackAction(requestId: string, reason: string): Promise<PubActionResult> {
  const userId = await requireSuperAdmin();
  const r = await sendBack(requestId, reason, userId);
  done();
  return r;
}

export async function prepareAction(requestId: string): Promise<PubActionResult> {
  const userId = await requireSuperAdmin();
  const r = await retryPrepare(requestId, userId);
  done();
  return r;
}

export async function invoiceAction(noticeId: string, invoiceNumber: string): Promise<PubActionResult> {
  await requireSuperAdmin();
  const r = await setInvoiceNumber(noticeId, invoiceNumber);
  done();
  return r;
}

export async function attachAction(campaignId: string, restaurantId: string): Promise<PubActionResult> {
  const userId = await requireSuperAdmin();
  const r = await attachManually(campaignId, restaurantId, userId);
  done();
  return r;
}

export async function identityAction(restaurantId: string, page: string, ig: string): Promise<PubActionResult> {
  const userId = await requireSuperAdmin();
  const [pageId, ...pageName] = page.split("|");
  if (!pageId) return { ok: false, error: "Choisis une page." };
  const [igId, ...igName] = ig.split("|");
  const r = await setIdentity(restaurantId, { id: pageId, name: pageName.join("|") }, igId ? { id: igId, username: igName.join("|") } : null, userId);
  done();
  return r;
}

export async function syncNowAction(): Promise<PubActionResult> {
  await requireSuperAdmin();
  const s = await runAdsSync();
  done();
  return s.ok ? { ok: true } : { ok: false, error: s.errors.map((e) => `${e.step} : ${e.message}`).join(" · ") || "lecture impossible" };
}
