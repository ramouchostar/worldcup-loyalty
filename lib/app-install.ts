import { createAdminClient } from "./supabase";

// Mesure de l'installation de l'app (PWA) par membre — complément ADR 0038.
// Signal : l'app s'ouvre en mode installé (voir components/member/
// AppInstallBeacon.tsx). Tout est FAIL-OPEN : tant que la migration
// 20260822-2023-member-app-installs n'est pas appliquée (ou en cas de panne),
// rien ne casse — on ne compte simplement pas.

export type AppPlatform = "ios" | "android" | "desktop" | "other";
export const APP_PLATFORMS: AppPlatform[] = ["ios", "android", "desktop", "other"];
export const PLATFORM_LABEL: Record<AppPlatform, string> = {
  ios: "iPhone",
  android: "Android",
  desktop: "Ordinateur",
  other: "Autre",
};

export type AppInstall = {
  user_id: string;
  platform: AppPlatform;
  installed_at: string;
  last_opened_at: string;
  opens: number;
};

// Enregistre une ouverture en mode installé. Retourne false si la table est
// absente / en erreur (jamais propagé).
export async function recordAppOpen(userId: string, platform: AppPlatform, userAgent: string | null): Promise<boolean> {
  try {
    const admin = createAdminClient();
    const now = new Date().toISOString();
    const ua = userAgent ? userAgent.slice(0, 200) : null;
    const { data, error } = await admin
      .from("member_app_installs")
      .select("opens")
      .eq("user_id", userId)
      .maybeSingle();
    if (error) throw error;
    if (data) {
      const { error: e2 } = await admin
        .from("member_app_installs")
        .update({ last_opened_at: now, opens: (Number((data as { opens: number }).opens) || 0) + 1, platform, user_agent: ua })
        .eq("user_id", userId);
      if (e2) throw e2;
    } else {
      const { error: e3 } = await admin
        .from("member_app_installs")
        .insert({ user_id: userId, platform, installed_at: now, last_opened_at: now, opens: 1, user_agent: ua });
      if (e3) throw e3;
    }
    return true;
  } catch (e) {
    console.error("[app-install] recordAppOpen failed:", (e as Error).message);
    return false;
  }
}

// Installations d'un lot de membres (pages Membres / Mes clients).
export async function getAppInstallsByUser(userIds: string[]): Promise<Map<string, AppInstall>> {
  const map = new Map<string, AppInstall>();
  if (userIds.length === 0) return map;
  try {
    const admin = createAdminClient();
    for (let i = 0; i < userIds.length; i += 500) {
      const { data, error } = await admin
        .from("member_app_installs")
        .select("user_id, platform, installed_at, last_opened_at, opens")
        .in("user_id", userIds.slice(i, i + 500));
      if (error) throw error;
      for (const r of (data as AppInstall[] | null) ?? []) map.set(r.user_id, r);
    }
  } catch (e) {
    console.error("[app-install] getAppInstallsByUser failed:", (e as Error).message);
  }
  return map;
}
