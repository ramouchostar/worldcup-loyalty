// ADR 0102 — pendant le pilote, seul un super-admin connecte HubRise.

import { createServerSupabaseClient } from "@/lib/supabase";
import { SITE_ORIGIN } from "@/lib/site";

export async function superAdminId(): Promise<string | null> {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const { data: profile } = await supabase.from("profiles").select("is_super_admin").eq("id", user.id).single();
  return profile?.is_super_admin ? user.id : null;
}

/** Adresse publique des rappels : toujours la production, jamais une préversion. */
export function webhookUrl(): string {
  return `${process.env.NEXT_PUBLIC_APP_URL || SITE_ORIGIN}/api/webhooks/hubrise`;
}
