import { NextResponse } from "next/server";
import { createServerSupabaseClient } from "./supabase";
import { createAdminClient } from "./supabase";

type GuardResult =
  | { ok: true; userId: string }
  | { ok: false; response: ReturnType<typeof NextResponse.json> };

export async function requireAdmin(): Promise<GuardResult> {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return {
      ok: false,
      response: NextResponse.json({ error: "Non authentifié." }, { status: 401 }),
    };
  }

  // Vérifie is_admin via service_role (bypasse toute RLS)
  const admin = createAdminClient();
  const { data: profile } = await admin
    .from("profiles")
    .select("is_admin")
    .eq("id", user.id)
    .single();

  if (!(profile as { is_admin: boolean } | null)?.is_admin) {
    return {
      ok: false,
      response: NextResponse.json({ error: "Accès refusé." }, { status: 403 }),
    };
  }

  return { ok: true, userId: user.id };
}
