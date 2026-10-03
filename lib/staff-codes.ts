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
import { brusselsMonthStartIso, nextMonth, previousMonth } from "./staff-status";

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

/**
 * Adresse encodée dans le QR d'un prénom (ADR 0053 §2) — UNE seule source pour
 * le badge public, la planche A4 et le PNG : l'arrivée compte dans l'entonnoir
 * général (c'est un scan de QR) ET par prénom (`p=`).
 */
export function staffQrTargetUrl(appUrl: string, restaurantId: string, code: string): string {
  return `${appUrl}/r/${restaurantId}?utm_source=qr_code&utm_medium=staff&p=${code}`;
}

/** Codes ACTIFS d'un établissement, dans l'ordre de création — la planche A4
 *  n'imprime jamais un code désactivé (son badge est mort, ADR 0053 §5).
 *  null = migration absente. */
export async function listActiveStaffCodes(restaurantId: string): Promise<StaffCode[] | null> {
  try {
    const admin = createAdminClient();
    const { data, error } = await admin
      .from("staff_codes")
      .select("*")
      .eq("restaurant_id", restaurantId)
      .eq("is_active", true)
      .order("created_at");
    if (error) return null;
    return (data ?? []) as StaffCode[];
  } catch {
    return null;
  }
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
  createdAt: string;
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
        createdAt: c.created_at,
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

// ── Contenu du badge : lib/staff-status.ts (pur, lisible côté client) ─────
export { STAFF_PITCH, STAFF_FAQ } from "./staff-status";

// ── Bilan d'un mois civil (ADR 0077, séquence « Ton équipe en salle ce mois-ci ») ──

export type StaffMonthRow = {
  id: string;
  label: string;
  isActive: boolean;
  createdAt: string;
  landings: number;
  signups: number;
  withTicket: number;
};

export type StaffMonthStats = {
  rows: StaffMonthRow[];
  landings: number;
  signups: number;
  withTicket: number;
  signupsPrev: number; // inscrits par l'équipe le mois d'avant
};

/** null = migration absente ou lecture en échec : le moteur n'envoie pas de bilan. */
export async function getStaffMonthStats(restaurantId: string, yyyymm: number): Promise<StaffMonthStats | null> {
  try {
    const admin = createAdminClient();
    const from = brusselsMonthStartIso(yyyymm);
    const to = brusselsMonthStartIso(nextMonth(yyyymm));
    const prevFrom = brusselsMonthStartIso(previousMonth(yyyymm));
    const fromDay = `${Math.floor(yyyymm / 100)}-${String(yyyymm % 100).padStart(2, "0")}-01`;
    const toMonth = nextMonth(yyyymm);
    const toDay = `${Math.floor(toMonth / 100)}-${String(toMonth % 100).padStart(2, "0")}-01`;

    const [{ data: codes, error }, { data: landings, error: e2 }, { data: acquisitions, error: e3 }] = await Promise.all([
      admin.from("staff_codes").select("*").eq("restaurant_id", restaurantId).order("created_at"),
      admin.from("staff_landings").select("code_id, count").eq("restaurant_id", restaurantId).gte("day", fromDay).lt("day", toDay),
      admin.from("staff_acquisitions").select("code_id, user_id, joined_at").eq("restaurant_id", restaurantId).gte("joined_at", prevFrom).lt("joined_at", to),
    ]);
    if (error || e2 || e3) return null;

    const acq = (acquisitions ?? []) as { code_id: string; user_id: string; joined_at: string }[];
    const inMonth = acq.filter((a) => a.joined_at >= from);
    const userIds = Array.from(new Set(inMonth.map((a) => a.user_id)));
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
    const landingsBy = new Map<string, number>();
    for (const l of (landings ?? []) as { code_id: string; count: number }[]) {
      landingsBy.set(l.code_id, (landingsBy.get(l.code_id) ?? 0) + l.count);
    }

    const rows = ((codes ?? []) as StaffCode[]).map((c) => {
      const mine = inMonth.filter((a) => a.code_id === c.id);
      return {
        id: c.id,
        label: c.label,
        isActive: c.is_active,
        createdAt: c.created_at,
        landings: landingsBy.get(c.id) ?? 0,
        signups: mine.length,
        withTicket: mine.filter((a) => withOrder.has(a.user_id)).length,
      };
    });
    return {
      rows,
      landings: rows.reduce((n, r) => n + r.landings, 0),
      signups: rows.reduce((n, r) => n + r.signups, 0),
      withTicket: rows.reduce((n, r) => n + r.withTicket, 0),
      signupsPrev: acq.length - inMonth.length,
    };
  } catch {
    return null;
  }
}
