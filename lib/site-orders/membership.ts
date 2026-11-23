// ADR 0108 §2 — commander, c'est rejoindre le restaurant (ADR 0015 §3 : l'adhésion est libre). La première commande envoyée crée
// l'appartenance si elle n'existe pas : sans elle, le membre ne verrait ni ses points ni le restaurant dans son app.
//
// Ce que ce chemin NE fait PAS, volontairement : ni parrainage, ni attribution à un serveur (ADR 0053), ni équipe, ni consentement
// marketing. Une commande du site ne vaut pas un scan de QR : rien n'est attribué à quelqu'un qui n'a pas été scanné. Les envois
// marketing gardent leur propre accord (ADR 0014, ADR 0025). Service role ; best-effort : une panne ne fait JAMAIS échouer une
// commande déjà enregistrée, elle se dit dans les journaux.

import { createAdminClient } from "../supabase";

export async function ensureSiteMembership(userId: string, restaurantId: string): Promise<boolean> {
  try {
    const { error } = await createAdminClient()
      .from("memberships")
      .upsert({ user_id: userId, restaurant_id: restaurantId }, { onConflict: "user_id,restaurant_id", ignoreDuplicates: true });
    if (error) {
      console.error("[site-orders] adhésion non créée :", error.message);
      return false;
    }
    return true;
  } catch (e) {
    console.error("[site-orders] adhésion non créée :", e);
    return false;
  }
}
