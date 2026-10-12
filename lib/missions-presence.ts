import { createAdminClient } from "./supabase";
import { todayInBrussels } from "./qr-funnel";
import { logEvent } from "./missions";
import { judgeConfirm } from "./mission-reminders";
import { addDays } from "./console-journey";

// ADR 0084 §5 — « je serai là » : de J-2 au jour J, chaque partie confirme sa présence. L'heure est
// gardée (preuve en cas de litige) ; confirmer deux fois ne change rien (idempotent).

export type Side = "restaurant" | "provider";
export type ConfirmResult = { ok: true; already: boolean } | { ok: false; reason: "not_found" | "not_booked" | "too_early" | "too_late" | "unavailable" };

export async function confirmPresence(missionId: string, side: Side, scope: { restaurantId?: string; providerId?: string }, actorId: string): Promise<ConfirmResult> {
  try {
    const admin = createAdminClient();
    let q = admin.from("missions").select("id, status, shoot_date, j2_confirmed_provider_at, j2_confirmed_restaurant_at").eq("id", missionId);
    q = side === "restaurant" ? q.eq("restaurant_id", scope.restaurantId ?? "") : q.eq("provider_id", scope.providerId ?? "");
    const { data, error } = await q.maybeSingle();
    if (error) throw error;
    const m = data as { id: string; status: string; shoot_date: string | null; j2_confirmed_provider_at: string | null; j2_confirmed_restaurant_at: string | null } | null;
    if (!m) return { ok: false, reason: "not_found" };
    if (m.status !== "date_bloquee") return { ok: false, reason: "not_booked" };
    const column = side === "restaurant" ? "j2_confirmed_restaurant_at" : "j2_confirmed_provider_at";
    if (m[column]) return { ok: true, already: true };

    const verdict = judgeConfirm(m.shoot_date, todayInBrussels());
    if (verdict === "too_early") return { ok: false, reason: "too_early" };
    if (verdict !== "ok") return { ok: false, reason: "too_late" };

    const now = new Date().toISOString();
    const { data: moved, error: e2 } = await admin
      .from("missions")
      .update({ [column]: now, updated_at: now })
      .eq("id", missionId)
      .eq("status", "date_bloquee")
      .is(column, null) // deux clics : une seule heure gardée
      .select("id");
    if (e2) throw e2;
    if (!moved || moved.length === 0) return { ok: true, already: true };
    await logEvent(missionId, { kind: "j2_confirmed", actorKind: side, actorId, meta: { side } });
    return { ok: true, already: false };
  } catch (e) {
    console.error("[missions-presence] confirmPresence failed:", (e as Error).message);
    return { ok: false, reason: "unavailable" };
  }
}

export type WatchedMission = { id: string; restaurant_id: string; restaurant_name: string; provider_name: string; shoot_date: string; shoot_start: string | null; missing: string[] };

/** Les tournages des deux prochains jours dont une présence manque : ce que la plateforme rappelle à la main. */
export async function listUnconfirmed(): Promise<WatchedMission[]> {
  try {
    const today = todayInBrussels();
    const { data, error } = await createAdminClient()
      .from("missions")
      .select("id, restaurant_id, shoot_date, shoot_start, j2_confirmed_provider_at, j2_confirmed_restaurant_at, restaurants(name), providers(display_name)")
      .eq("status", "date_bloquee")
      .gte("shoot_date", today)
      .lte("shoot_date", addDays(today, 2))
      .order("shoot_date", { ascending: true });
    if (error) throw error;
    const out: WatchedMission[] = [];
    for (const r of (data ?? []) as unknown as { id: string; restaurant_id: string; shoot_date: string; shoot_start: string | null; j2_confirmed_provider_at: string | null; j2_confirmed_restaurant_at: string | null; restaurants: { name: string } | null; providers: { display_name: string } | null }[]) {
      const restaurant = r.restaurants?.name ?? r.restaurant_id;
      const provider = r.providers?.display_name ?? "Prestataire";
      const missing = [!r.j2_confirmed_restaurant_at && restaurant, !r.j2_confirmed_provider_at && provider].filter(Boolean) as string[];
      if (missing.length > 0) out.push({ id: r.id, restaurant_id: r.restaurant_id, restaurant_name: restaurant, provider_name: provider, shoot_date: r.shoot_date, shoot_start: r.shoot_start, missing });
    }
    return out;
  } catch (e) {
    console.error("[missions-presence] listUnconfirmed failed:", (e as Error).message);
    return [];
  }
}
