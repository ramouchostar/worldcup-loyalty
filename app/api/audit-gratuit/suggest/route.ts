import { NextResponse } from "next/server";
import { isPlacesConfigured, suggest } from "@/lib/audit/places";
import { clientIp, ipHash, uuidFromHash } from "@/lib/audit/leads";
import { checkRateLimit } from "@/lib/rate-limit";

// ADR 0071 — suggestions d'établissements pour /audit-gratuit (Bruxelles).
// Public, limité par IP (60 frappes / 10 min) : la session Places rend les
// suggestions gratuites quand elle se termine par une fiche.
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const q = (url.searchParams.get("q") ?? "").trim().slice(0, 80);
  const session = (url.searchParams.get("s") ?? "").slice(0, 64);
  if (q.length < 2 || !/^[\w-]{8,64}$/.test(session)) return NextResponse.json({ suggestions: [] });
  if (!isPlacesConfigured()) return NextResponse.json({ error: "indisponible" }, { status: 503 });

  const allowed = await checkRateLimit(uuidFromHash(ipHash(clientIp(req.headers))), "audit_suggest", 60, 600);
  if (!allowed) return NextResponse.json({ error: "trop_de_recherches" }, { status: 429 });

  try {
    return NextResponse.json({ suggestions: await suggest(q, session) }, { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    console.error("[audit-gratuit] suggestions :", e);
    return NextResponse.json({ error: "indisponible" }, { status: 502 });
  }
}
