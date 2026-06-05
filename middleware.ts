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

  // Redirige les utilisateurs déjà connectés hors des pages auth
  const isAuthRoute = path === "/login" || path === "/signup";
  if (isAuthRoute && user) {
    const { data: profile } = await supabase
      .from("profiles")
      .select("team_id")
      .eq("id", user.id)
      .single();
    const dest = profile?.team_id ? "/dashboard" : "/register";
    return NextResponse.redirect(new URL(dest, request.url));
  }

  const isMemberRoute =
    path.startsWith("/dashboard") ||
    path.startsWith("/submit-order") ||
    path.startsWith("/my-team") ||
    path.startsWith("/my-rewards") ||
    path.startsWith("/rewards") ||
    path.startsWith("/micro-rewards") ||
    path.startsWith("/parrainage") ||
    path.startsWith("/leaderboard") ||
    path.startsWith("/transfer");

  const isAdminRoute = path.startsWith("/admin");

  // Routes protégées : authentification requise
  if ((isMemberRoute || isAdminRoute) && !user) {
    return NextResponse.redirect(new URL("/login", request.url));
  }

  // Routes membres et admin : charge le profil une seule fois
  if ((isMemberRoute || isAdminRoute) && user) {
    const { data: profile } = await supabase
      .from("profiles")
      .select("team_id, is_admin")
      .eq("id", user.id)
      .single();

    // Membres : équipe obligatoire
    if (isMemberRoute && path !== "/register" && !profile?.team_id) {
      return NextResponse.redirect(new URL("/register", request.url));
    }

    // Admin : is_admin requis
    if (isAdminRoute && !profile?.is_admin) {
      return NextResponse.redirect(new URL("/dashboard", request.url));
    }
  }

  return supabaseResponse;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|auth/callback|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
