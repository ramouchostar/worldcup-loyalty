"use server";

import { revalidatePath } from "next/cache";
import { createServerSupabaseClient } from "@/lib/supabase";
import { isSequenceKey } from "@/lib/message-catalog";
import { setMessageEnabled } from "@/lib/message-log";
import { sendTestEmail } from "@/lib/email";
import { defaultImage, previewEntries } from "@/lib/email-templates/fixtures";

// Même garde locale que les autres Server Actions de /platform : un layout ne
// protège pas une action, chaque action revérifie le super-admin.
async function requireSuperAdmin() {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const { data: profile } = await supabase.from("profiles").select("is_super_admin").eq("id", user.id).single();
  return profile?.is_super_admin ? user : null;
}

// ADR 0063 §2 — allume ou éteint une séquence pour UN établissement.
export async function toggleSequence(
  messageKey: string,
  restaurantId: string,
  enabled: boolean
): Promise<{ ok: boolean; error?: string }> {
  const user = await requireSuperAdmin();
  if (!user) return { ok: false, error: "Réservé à la plateforme." };
  // Liste close : on ne pilote que les séquences du catalogue, jamais une
  // clé reçue telle quelle d'un POST forgé.
  if (!isSequenceKey(messageKey) || !restaurantId) return { ok: false, error: "Séquence inconnue." };
  const res = await setMessageEnabled(messageKey, restaurantId, enabled, user.id);
  if (!res.ok) return { ok: false, error: res.error };
  revalidatePath("/platform/messages");
  return { ok: true };
}

// E-mail de test : un gabarit, rendu sur ses données d'exemple (établissement
// fictif), envoyé à l'adresse du super-admin qui clique — jamais à un tiers.
export async function sendTestEmailAction(entryId: string): Promise<{ ok: boolean; message: string }> {
  const user = await requireSuperAdmin();
  if (!user?.email) return { ok: false, message: "Réservé à la plateforme." };
  const entry = previewEntries({ logoUrl: null, image: defaultImage }).find((e) => e.id === entryId);
  if (!entry) return { ok: false, message: "Gabarit inconnu." };
  const sent = await sendTestEmail(user.email, user.id, entry.email, entry.audience === "membre" ? "member" : "restaurant");
  revalidatePath("/platform/messages");
  return sent
    ? { ok: true, message: `Parti vers ${user.email}. Il apparaît dans le journal ci-dessous.` }
    : { ok: false, message: "Pas parti — la raison est dans « Dernier échec » et dans le journal." };
}
