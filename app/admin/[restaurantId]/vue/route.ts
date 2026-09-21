import { NextResponse, type NextRequest } from "next/server";
import { CONSOLE_VIEW_COOKIE, parseConsoleView } from "@/lib/admin-nav";

// Bascule vue simple ⇄ vue pro (ADR 0064). Une préférence d'affichage, pas
// un droit : les deux vues ouvrent exactement les mêmes pages, avec les mêmes
// gardes (le middleware et le layout re-vérifient l'accès à /admin/[id]/**,
// cette route comprise). Un cookie par appareil suffit : le restaurateur qui
// consulte sur son téléphone et fait sa compta sur l'ordinateur peut vouloir
// les deux.
//
// `next` ne peut ramener que dans la console de CET établissement — jamais
// une redirection ouverte vers un autre site.
export async function GET(req: NextRequest, { params }: { params: Promise<{ restaurantId: string }> }) {
  const { restaurantId } = await params;
  const base = `/admin/${restaurantId}`;
  const mode = parseConsoleView(req.nextUrl.searchParams.get("mode") ?? undefined);
  const next = req.nextUrl.searchParams.get("next");
  const safeNext =
    next && (next === base || next.startsWith(`${base}/`)) && !next.includes("//") && !next.startsWith(`${base}/vue`) ? next : base;

  const res = NextResponse.redirect(new URL(safeNext, req.url));
  res.cookies.set(CONSOLE_VIEW_COOKIE, mode, {
    path: "/admin",
    maxAge: 60 * 60 * 24 * 365,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    httpOnly: true,
  });
  return res;
}
