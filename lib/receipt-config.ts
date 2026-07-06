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
};

// Config historique Belchicken : fallback des restos sans ligne en base
// (zéro régression même si le seed m32 n'a pas tourné).
export const LEGACY_BESTELNUMMER_CONFIG: ReceiptKeyConfig = {
  restaurant_id: "",
  has_reliable_key: true,
  key_label: "Bestelnummer",
  key_description: "a code in format YYYY-MM-DD/NNN/NNNNN (e.g. 2026-06-01/258/03993)",
  key_pattern: "^(\\d{4}-\\d{2}-\\d{2})/\\d{3}/\\d{5}$",
  key_examples: ["2026-06-01/258/03993"],
  position_hint: "printed near the top of the receipt",
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
