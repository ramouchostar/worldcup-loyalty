// ADR 0107 §10 — le numéro WhatsApp de commande d'un établissement (table `site_order_settings`, service role uniquement).
// Une table absente (migration pas appliquée) se lit « pas de numéro » : le secours n'affiche pas de bouton WhatsApp, rien ne casse.

import { createAdminClient } from "../supabase";
import { isWhatsAppNumber } from "./whatsapp";

const isMissingTable = (error: { code?: string; message?: string } | null) =>
  !!error && (error.code === "PGRST205" || error.code === "42P01" || (/site_order_settings/.test(error.message ?? "") && /(does not exist|Could not find the table)/i.test(error.message ?? "")));

/** Le numéro choisi par le restaurateur, ou `null` (jamais choisi, illisible, ou table pas encore là). Une panne de lecture se lit « aucun » et se dit au journal. */
export async function readWhatsApp(restaurantId: string): Promise<string | null> {
  const { data, error } = await createAdminClient().from("site_order_settings").select("whatsapp").eq("restaurant_id", restaurantId).maybeSingle();
  if (error) {
    if (!isMissingTable(error)) console.error("[site-orders] numéro WhatsApp illisible :", error.message);
    return null;
  }
  const n = (data as { whatsapp?: unknown } | null)?.whatsapp;
  return isWhatsAppNumber(n) ? n : null;
}

export type SaveOutcome = { ok: true } | { ok: false; status: number; error: string };

/** Écrit (ou efface, avec `null`) le numéro. Le format est revérifié ici : la base le refuse de toute façon. */
export async function saveWhatsApp(restaurantId: string, number: string | null, userId: string): Promise<SaveOutcome> {
  if (number !== null && !isWhatsAppNumber(number)) return { ok: false, status: 400, error: "Ce numéro n'est pas lisible. Exemple : 0470 12 34 56." };
  const { error } = await createAdminClient().from("site_order_settings").upsert(
    { restaurant_id: restaurantId, whatsapp: number, updated_by: userId, updated_at: new Date().toISOString() },
    { onConflict: "restaurant_id" },
  );
  if (error) {
    if (isMissingTable(error)) return { ok: false, status: 503, error: "Cette fonction n'est pas encore activée." };
    console.error("[site-orders] numéro WhatsApp non écrit :", error.message);
    return { ok: false, status: 500, error: "Erreur serveur. Réessaie dans un instant." };
  }
  return { ok: true };
}
