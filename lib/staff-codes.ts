// ADR 0053 — Acquisition par le personnel en salle.
//
// Des codes NOMMÉS (prénom seul, jamais le poste), sans compte : le personnel
// n'a pas de siège console (ADR 0041) et n'en a pas besoin — il a besoin d'un
// QR. Mécanique volontairement séparée du parrainage membre (compte
// obligatoire, unicité filleul à vie, jetons — cf. ADR 0053 § Contexte).
// Service-role uniquement, tout best-effort : la mesure ne casse jamais le
// parcours client (même règle qu'ADR 0037).
import { createAdminClient } from "./supabase";
import { todayInBrussels } from "./qr-funnel";

// Même alphabet et même longueur que les codes de parrainage : lisible,
// tapable, et le middleware les valide avec la même forme.
export const STAFF_CODE_RE = /^[A-Z0-9]{6}$/;
const CODE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789"; // sans I/L/O/0/1 ambigus

export function generateStaffCode(): string {
  let out = "";
  for (let i = 0; i < 6; i++) {
    out += CODE_ALPHABET[Math.floor(Math.random() * CODE_ALPHABET.length)];
  }
  return out;
}

export type StaffCode = {
  id: string;
  restaurant_id: string;
  code: string;
  label: string;
  is_active: boolean;
  created_at: string;
};

/** Crée un code pour un prénom. Réessaie sur collision de code (rarissime). */
export async function createStaffCode(
  restaurantId: string,
  label: string
): Promise<StaffCode | null> {
  const admin = createAdminClient();
  const cleanLabel = label.trim().slice(0, 40);
  if (!cleanLabel) return null;
  for (let attempt = 0; attempt < 3; attempt++) {
    const { data, error } = await admin
      .from("staff_codes")
      .insert({ restaurant_id: restaurantId, code: generateStaffCode(), label: cleanLabel })
      .select("*")
      .single();
    if (!error) return data as StaffCode;
    if (error.code !== "23505") {
      console.error("[staff-codes] createStaffCode failed:", error.message);
      return null;
    }
  }
  return null;
}

export async function setStaffCodeActive(
  restaurantId: string,
  codeId: string,
  isActive: boolean
): Promise<boolean> {
  const admin = createAdminClient();
  const { error } = await admin
    .from("staff_codes")
    .update({ is_active: isActive })
    .eq("id", codeId)
    .eq("restaurant_id", restaurantId); // jamais le code d'un autre établissement
  if (error) console.error("[staff-codes] setStaffCodeActive failed:", error.message);
  return !error;
}

/** Résout un code ACTIF — pour le badge public et l'attribution. */
export async function resolveStaffCode(code: string): Promise<StaffCode | null> {
  if (!STAFF_CODE_RE.test(code)) return null;
  try {
    const admin = createAdminClient();
    const { data } = await admin
      .from("staff_codes")
      .select("*")
      .eq("code", code)
      .eq("is_active", true)
      .maybeSingle();
    return (data as StaffCode | null) ?? null;
  } catch {
    return null; // migration absente → fail-open
  }
}

/** Arrivée sur la vitrine via un QR de personnel. Best-effort, jamais bloquant. */
export async function recordStaffLanding(restaurantId: string, code: string): Promise<void> {
  try {
    const resolved = await resolveStaffCode(code);
    if (!resolved || resolved.restaurant_id !== restaurantId) return;
    const admin = createAdminClient();
    const { error } = await admin.rpc("record_staff_landing", {
      p_restaurant_id: restaurantId,
      p_day: todayInBrussels(),
      p_code_id: resolved.id,
    });
    if (error) throw error;
  } catch (e) {
    console.error("[staff-codes] recordStaffLanding failed:", (e as Error).message);
  }
}

/**
 * Attribue une NOUVELLE adhésion au code salle du cookie. Appelée après le
 * parrainage membre, qui prime (ADR 0053 §3) ; l'unicité (user, resto) fait
 * qu'un membre n'est jamais réattribué. Best-effort.
 */
export async function attributeStaffSignup(
  restaurantId: string,
  userId: string,
  code: string
): Promise<void> {
  try {
    const resolved = await resolveStaffCode(code);
    if (!resolved || resolved.restaurant_id !== restaurantId) return;
    const admin = createAdminClient();
    const { error } = await admin
      .from("staff_acquisitions")
      .upsert(
        { restaurant_id: restaurantId, code_id: resolved.id, user_id: userId },
        { onConflict: "user_id,restaurant_id", ignoreDuplicates: true }
      );
    if (error) throw error;
  } catch (e) {
    console.error("[staff-codes] attributeStaffSignup failed:", (e as Error).message);
  }
}

// ── Statistiques console (« qui apporte les clients ») ──────────────────────

export type StaffStats = {
  id: string;
  code: string;
  label: string;
  isActive: boolean;
  landings30d: number;
  signupsTotal: number;
  signups30d: number;
  withTicket: number; // inscrits via ce code ayant ≥ 1 commande validée
};

export async function getStaffStats(restaurantId: string): Promise<StaffStats[] | null> {
  try {
    const admin = createAdminClient();
    const since = new Date(Date.now() - 30 * 86400_000);
    const sinceDay = since.toISOString().slice(0, 10);

    const [{ data: codes, error }, { data: landings }, { data: acquisitions }] = await Promise.all([
      admin.from("staff_codes").select("*").eq("restaurant_id", restaurantId).order("created_at"),
      admin.from("staff_landings").select("code_id, count").eq("restaurant_id", restaurantId).gte("day", sinceDay),
      admin.from("staff_acquisitions").select("code_id, user_id, joined_at").eq("restaurant_id", restaurantId),
    ]);
    if (error) return null; // migration absente → la console explique quoi appliquer

    const codeRows = (codes ?? []) as StaffCode[];
    if (codeRows.length === 0) return [];

    const acqRows = (acquisitions ?? []) as { code_id: string; user_id: string; joined_at: string }[];
    // « Dont ont envoyé un ticket » : parmi les recrutés, qui a au moins une
    // commande validée dans CET établissement.
    const userIds = Array.from(new Set(acqRows.map((a) => a.user_id)));
    const withOrder = new Set<string>();
    if (userIds.length > 0) {
      const { data: orders } = await admin
        .from("orders")
        .select("user_id")
        .eq("restaurant_id", restaurantId)
        .eq("status", "validated")
        .in("user_id", userIds)
        .limit(5000);
      for (const o of (orders ?? []) as { user_id: string }[]) withOrder.add(o.user_id);
    }

    const landingsByCode = new Map<string, number>();
    for (const l of (landings ?? []) as { code_id: string; count: number }[]) {
      landingsByCode.set(l.code_id, (landingsByCode.get(l.code_id) ?? 0) + l.count);
    }

    return codeRows.map((c) => {
      const mine = acqRows.filter((a) => a.code_id === c.id);
      return {
        id: c.id,
        code: c.code,
        label: c.label,
        isActive: c.is_active,
        landings30d: landingsByCode.get(c.id) ?? 0,
        signupsTotal: mine.length,
        signups30d: mine.filter((a) => new Date(a.joined_at) >= since).length,
        withTicket: mine.filter((a) => withOrder.has(a.user_id)).length,
      };
    });
  } catch {
    return null;
  }
}

// ── Contenu du badge (validé par le porteur, 2026-09-10) ────────────────────

export const STAFF_PITCH =
  "Vous connaissez notre programme de fidélité ? Vous photographiez votre ticket, vous gagnez des cadeaux — je vous montre, ça prend 20 secondes.";

export const STAFF_FAQ: { q: string; a: string }[] = [
  { q: "C'est payant ?", a: "Non — gratuit, pour toujours. Pas de carte à garder." },
  { q: "Je gagne quoi ?", a: "Des cadeaux du menu à mesure que vos tickets s'accumulent, à retirer au comptoir." },
  { q: "Et mes données ?", a: "Elles ne servent qu'au programme — jamais revendues, effaçables à tout moment." },
];
