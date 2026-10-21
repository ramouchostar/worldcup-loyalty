import { NextResponse } from "next/server";
import { requireProvider } from "@/lib/providers";
import { saveProviderLocale } from "@/lib/provider-locale";
import { getT } from "@/lib/i18n";

// PUT /api/prestataire/langue — le prestataire change SA langue (français, néerlandais, anglais).
// Body : { locale: "fr" | "nl" | "en" }.
export async function PUT(req: Request) {
  const guard = await requireProvider();
  if (!guard.ok) return guard.response;
  const body = await req.json().catch(() => null);
  const r = await saveProviderLocale(guard.provider.id, body?.locale);
  if (r.ok) return NextResponse.json({ ok: true, locale: r.locale });
  const { t } = getT("fr");
  return NextResponse.json({ error: t("lang.error") }, { status: r.reason === "invalid" ? 422 : 503 });
}
