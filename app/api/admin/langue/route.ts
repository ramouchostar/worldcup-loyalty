import { NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase";
import { saveUserLocale } from "@/lib/user-locale";
import { getT } from "@/lib/i18n";

// PUT /api/admin/langue — l'utilisateur connecté change SA langue (français, néerlandais, anglais) : pages « Prestataires » et e-mails du module.
// Body : { locale: "fr" | "nl" | "en" }. Jamais l'identifiant de quelqu'un d'autre : c'est toujours le compte connecté.
export async function PUT(req: Request) {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Non authentifié." }, { status: 401 });
  const body = await req.json().catch(() => null);
  const r = await saveUserLocale(user.id, body?.locale);
  if (r.ok) return NextResponse.json({ ok: true, locale: r.locale });
  return NextResponse.json({ error: getT("fr").t("rest.lang.error") }, { status: r.reason === "invalid" ? 422 : 503 });
}
