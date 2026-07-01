import { NextResponse, type NextRequest } from "next/server";
import { createServerClient, type CookieOptions } from "@supabase/ssr";

export async function middleware(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get(name: string) {
          return request.cookies.get(name)?.value;
        },
        set(name: string, value: string, options: CookieOptions) {
          request.cookies.set(name, value);
          supabaseResponse = NextResponse.next({ request });
          supabaseResponse.cookies.set(name, value, options);
        },
        remove(name: string, options: CookieOptions) {
          request.cookies.set(name, "");
          supabaseResponse = NextResponse.next({ request });
          supabaseResponse.cookies.set(name, "", options);
        },
      },
    }
  );

  const { data: { user } } = await supabase.auth.getUser();
  const path = request.nextUrl.pathname;

  // Redirige les utilisateurs déjà connectés hors des pages auth vers leur
  // établissement le plus récent (ADR 0015 §1-2 — plusieurs établissements
  // possibles, on ouvre sur le dernier rejoint), ou /join s'il n'en a aucun.
  const isAuthRoute = path === "/login" || path === "/signup";
  if (isAuthRoute && user) {
    const { data: membership } = await supabase
      .from("memberships")
      .select("restaurant_id")
      .eq("user_id", user.id)
      .order("joined_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    const dest = membership ? `/r/${membership.restaurant_id}/dashboard` : "/join";
    return NextResponse.redirect(new URL(dest, request.url));
  }

  const restaurantMatch = path.match(/^\/r\/([^/]+)\//);
  const currentRestaurantId = restaurantMatch?.[1];
  // /r/[id]/leaderboard reste public (classement consultable sans compte)
  const isPublicRestaurantRoute = !!currentRestaurantId && path === `/r/${currentRestaurantId}/leaderboard`;
  const isRestaurantRoute = !!restaurantMatch && !isPublicRestaurantRoute;

  const isAdminRoute = path.startsWith("/admin");
  const isJoinRoute = path === "/join";

  // Routes protégées : authentification requise
  if ((isRestaurantRoute || isAdminRoute || isJoinRoute) && !user) {
    return NextResponse.redirect(new URL("/login", request.url));
  }

  // Route établissement : le membre doit avoir une adhésion pour CET
  // établissement précis (ADR 0015 §2 — pas de blocage global)
  if (isRestaurantRoute && user && currentRestaurantId) {
    const myTeamPath = `/r/${currentRestaurantId}/my-team`;
    if (path !== myTeamPath) {
      const { data: membership } = await supabase
        .from("memberships")
        .select("team_id")
        .eq("user_id", user.id)
        .eq("restaurant_id", currentRestaurantId)
        .maybeSingle();
      if (!membership?.team_id) {
        return NextResponse.redirect(new URL(myTeamPath, request.url));
      }
    }
  }

  // Admin : is_admin requis (hors scope ADR 0015 §6-7 — inchangé)
  if (isAdminRoute && user) {
    const { data: profile } = await supabase
      .from("profiles")
      .select("is_admin")
      .eq("id", user.id)
      .single();
    if (!profile?.is_admin) {
      return NextResponse.redirect(new URL("/join", request.url));
    }
  }

  return supabaseResponse;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|auth/callback|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
