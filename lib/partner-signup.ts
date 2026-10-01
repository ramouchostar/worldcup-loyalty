import { createAdminClient } from "@/lib/supabase";
import { generateRestaurantSlug } from "@/lib/restaurant";
import { upsertRestaurantAdmin } from "@/lib/restaurant-admins";
import { sendPartnerApplicationReceivedEmail } from "@/lib/email";
import { correctedFields, normalizeWebsite, sanitizeDraft, slugBase } from "@/lib/partner-draft";
import type { PartnerAttribution } from "@/lib/partner-attribution";

// ADR 0075 §1 — les établissements d'un brouillon deviennent de vrais
// établissements (`pending`) au moment où le compte existe. Appelé depuis le
// retour de confirmation e-mail (brouillon dans les métadonnées) et depuis
// /become-a-partner (brouillon du navigateur, compte Google ou déjà connecté).
// Le brouillon est revalidé ici (sanitizeDraft), jamais cru tel quel.

export type DraftResult = {
  /** Établissements créés par cet appel. */
  created: { id: string; name: string }[];
  /** Fiches Google déjà inscrites par ce même compte (brouillon renvoyé deux fois). */
  alreadyMine: { id: string; name: string }[];
  /** Fiches Google déjà inscrites par un AUTRE compte (ADR 0075 §7). */
  takenByOthers: string[];
};

// Colonnes ajoutées par 20261001-2321 / 20261001-1100 : sans elles, on crée
// quand même, sans ces champs (fail-open, journalisé).
const OPTIONAL_COLUMNS = ["google_place_id", "phone", "signup_prefill", "signup_attribution"] as const;

export async function createRestaurantsFromDraft(
  user: { id: string; email: string | null },
  rawDraft: unknown,
  attribution: PartnerAttribution | null,
): Promise<DraftResult> {
  const { establishments } = sanitizeDraft(rawDraft);
  const admin = createAdminClient();
  const result: DraftResult = { created: [], alreadyMine: [], takenByOthers: [] };
  if (establishments.length === 0) return result;

  // Fiches déjà inscrites : à moi (idempotence) ou à quelqu'un d'autre (refus).
  const placeIds = establishments.map((e) => e.placeId).filter((x): x is string => !!x);
  const taken = new Map<string, { id: string; name: string; mine: boolean }>();
  if (placeIds.length) {
    const { data, error } = await admin
      .from("restaurants")
      .select("id, name, google_place_id, owner_id")
      .in("google_place_id", placeIds);
    if (error) console.error("[inscription] google_place_id illisible, pas de contrôle de doublon :", error.message);
    for (const r of data ?? []) {
      taken.set(r.google_place_id as string, { id: r.id as string, name: r.name as string, mine: r.owner_id === user.id });
    }
  }

  let missingColumns = false;
  for (const e of establishments) {
    const prior = e.placeId ? taken.get(e.placeId) : undefined;
    if (prior) {
      if (prior.mine) result.alreadyMine.push({ id: prior.id, name: prior.name });
      else result.takenByOthers.push(e.name);
      continue;
    }

    const id = await generateRestaurantSlug(slugBase(e, establishments));
    const base = {
      id,
      name: e.name,
      sector: e.sector,
      address: e.address || null,
      cuisine_types: e.cuisine,
      website_url: normalizeWebsite(e.website) || null,
      google_maps_url: e.mapsUrl || null,
      status: "pending",
    };
    const extra = {
      google_place_id: e.placeId,
      phone: e.phone || null,
      signup_prefill: { source: e.placeId ? "google" : "manuel", corrected: correctedFields(e) },
      signup_attribution: attribution,
    };

    let { error } = await admin.from("restaurants").insert(missingColumns ? base : { ...base, ...extra });
    if (error && !missingColumns && OPTIONAL_COLUMNS.some((c) => error!.message.includes(c))) {
      missingColumns = true;
      console.error("[inscription] colonnes d'inscription absentes (migration 20261001-2321 ?) — créé sans :", error.message);
      ({ error } = await admin.from("restaurants").insert(base));
    }
    if (error) {
      // Course : la même fiche inscrite entre la lecture et l'écriture.
      if (error.code === "23505" && e.placeId) {
        result.takenByOthers.push(e.name);
        continue;
      }
      console.error("[inscription] création échouée :", e.name, error.message);
      continue;
    }

    // ADR 0041 — siège gérant ; le trigger dérive owner_id.
    await upsertRestaurantAdmin({ restaurantId: id, userId: user.id, role: "gerant", invitedBy: null });
    if (user.email) await sendPartnerApplicationReceivedEmail(user.email, e.name, id);
    result.created.push({ id, name: e.name });
  }

  if (result.takenByOthers.length) {
    console.warn("[inscription] fiches déjà inscrites par un autre compte :", result.takenByOthers.join(", "));
  }
  return result;
}

/** Où va le restaurateur une fois ses établissements créés. */
export function partnerNextStep(restaurantIds: string[]): string {
  return `/become-a-partner/${restaurantIds[0]}/menu`;
}
