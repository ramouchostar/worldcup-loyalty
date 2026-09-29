import { createAdminClient } from "./supabase";

// ADR 0019 — Config de clé unique de ticket par établissement.
// Découverte à l'onboarding (lib/receipt-key-discovery.ts), confirmée par
// le restaurateur, consommée par le pipeline OCR client (prompt dynamique,
// validation, duplicate_key). Service role uniquement : le pattern sert à
// l'anti-doublon, jamais exposé aux membres.

export type ReceiptKeyConfig = {
  restaurant_id: string;
  has_reliable_key: boolean;
  key_label: string | null;
  key_description: string | null;
  key_pattern: string | null;
  key_examples: string[];
  position_hint: string | null;
  date_group: number | null;
  confirmed_at: string | null;
  /**
   * Code de l'établissement, groupe du milieu de la clé (223 Kraainem, 258 Houba — ADR 0073).
   * Absent tant que la migration 20260929-1100 n'est pas passée, ou pour un
   * établissement dont on ne connaît pas encore le code : pas de contrôle.
   */
  store_code?: string | null;
};

// La forme de la clé imprimée par les bornes Belchicken (ADR 0073), MESURÉE sur
// 92 clés distinctes lues à l'identique par trois modèles (2026-09-29) :
//   AAAA-MM-JJ / code de l'établissement (3 chiffres) / « 0 », un chiffre de 1 à 9, puis 1 à 3 chiffres
// Le dernier groupe est un nombre libre de 10 à 9 999 précédé d'un 0, JAMAIS
// complété par des zéros : 3, 4 ou 5 caractères (036, 0121, 01645) — 89 clés sur
// 93 en ont 5, 3 en ont 4, 1 en a 3. Aucun 0 en deuxième position sur 92 clés ;
// Haiku en produisait 5 sur 141 (zéros ajoutés à tort) : le motif les refuse.
export const TICKET_KEY_PATTERN = "^(\\d{4}-\\d{2}-\\d{2})/\\d{3}/0[1-9]\\d{1,3}$";
// Pas de code d'exemple dans la consigne : « 258 » (Houba) y figurait pour les
// trois établissements et Haiku l'a recopié à Kraainem (2026-09-29, 4 commandes).
export const TICKET_KEY_DESCRIPTION =
  "a code printed as YYYY-MM-DD/NNN/0NNNN: the date, a 3-digit code, then a number that always starts with 0 followed by a digit from 1 to 9. That last number has 3 to 5 characters in total (for example 036, 0121 or 01645). Copy it exactly as printed: never pad it with extra zeros, never shorten it, never add or drop a digit";

// Config historique Belchicken : fallback des restos sans ligne en base
// (zéro régression même si le seed m32 n'a pas tourné).
export const LEGACY_BESTELNUMMER_CONFIG: ReceiptKeyConfig = {
  restaurant_id: "",
  has_reliable_key: true,
  key_label: "Bestelnummer",
  key_description: TICKET_KEY_DESCRIPTION,
  key_pattern: TICKET_KEY_PATTERN,
  key_examples: [],
  // Terrain Houba 2026-09-17 : « near the top » était faux — le Bestelnummer
  // est EN BAS, dans le bloc de paiement. Les établissements créés avec ce
  // défaut (houba, de-bue) voyaient leurs tickets de borne refusés : le petit
  // ticket n'a pas le nom du resto en haut, la clé est sa seule preuve.
  position_hint:
    "printed near the bottom of the receipt, in the payment block after the total (Betaalmethode / Bestelnummer / Kanaal)",
  date_group: 1,
  confirmed_at: null,
};

export async function getReceiptConfig(restaurantId: string): Promise<ReceiptKeyConfig> {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("restaurant_receipt_config")
    .select("*")
    .eq("restaurant_id", restaurantId)
    .maybeSingle();
  if (error || !data) {
    return { ...LEGACY_BESTELNUMMER_CONFIG, restaurant_id: restaurantId };
  }
  return data as ReceiptKeyConfig;
}

/**
 * Les codes des AUTRES établissements du réseau (ADR 0073) : ils permettent de
 * dire « ce ticket vient d'ailleurs » plutôt que « reprends la photo ». Fail-open :
 * colonne absente (migration pas passée) ou panne → liste vide, aucun contrôle
 * d'origine, la forme de la clé reste vérifiée.
 */
export async function getOtherStoreCodes(restaurantId: string): Promise<string[]> {
  try {
    const admin = createAdminClient();
    const { data, error } = await admin
      .from("restaurant_receipt_config")
      .select("store_code")
      .neq("restaurant_id", restaurantId)
      .not("store_code", "is", null);
    if (error) throw error;
    return [...new Set(((data ?? []) as { store_code: string }[]).map((r) => r.store_code))];
  } catch {
    return [];
  }
}

// Compile le pattern de la config ; null si absent ou invalide (une regex
// corrompue en base ne doit jamais faire tomber la soumission).
export function compileKeyPattern(config: ReceiptKeyConfig): RegExp | null {
  if (!config.has_reliable_key || !config.key_pattern) return null;
  try {
    return new RegExp(config.key_pattern);
  } catch {
    return null;
  }
}

// Équivalent configurable de validateOrderNumber (lib/orders.ts, legacy).
// Retourne un message d'erreur ou null si la clé est valide.
export function validateOrderKey(key: string, config: ReceiptKeyConfig): string | null {
  const re = compileKeyPattern(config);
  if (!re) return null; // pas de clé fiable → rien à valider
  if (!re.test(key.trim())) {
    const label = config.key_label ?? "numéro de commande";
    const example = config.key_examples[0];
    return `${label} invalide${example ? ` (exemple attendu : ${example})` : ""}. Vérifie le numéro sur ton ticket.`;
  }
  return null;
}

// Extrait la date YYYY-MM-DD encapsulée dans la clé si la config le permet
// (remplace le orderNumber.split("/")[0] codé en dur du Bestelnummer).
export function extractDateFromKey(key: string, config: ReceiptKeyConfig): string | null {
  const re = compileKeyPattern(config);
  if (!re || config.date_group === null) return null;
  const match = re.exec(key.trim());
  const captured = match?.[config.date_group];
  return captured && /^\d{4}-\d{2}-\d{2}$/.test(captured) ? captured : null;
}
