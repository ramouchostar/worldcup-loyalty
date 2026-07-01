import { type NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase";

// Lien d'adhésion partageable : /join-team?code=ABC123
// Capture le code dans un cookie puis redirige vers /r/[restaurantId]/my-team
// (résolu depuis l'équipe du code — ADR 0015, plusieurs établissements
// possibles, join_code reste unique globalement).
export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get("code")?.toUpperCase() ?? "";
  const validCode = /^[A-Z0-9]{6}$/.test(code);

  let restaurantId: string | null = null;
  if (validCode) {
    const admin = createAdminClient();
    const { data: team } = await admin
      .from("teams")
      .select("restaurant_id")
      .eq("join_code", code)
      .maybeSingle();
    restaurantId = team?.restaurant_id ?? null;
  }

  const response = NextResponse.redirect(
    new URL(restaurantId ? `/r/${restaurantId}/my-team` : "/join", request.url)
  );

  if (validCode) {
    response.cookies.set("pending_join_code", code, {
      httpOnly: true,
      maxAge: 60 * 15, // 15 min
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
    });
  }

  return response;
}
