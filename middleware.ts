import { NextResponse, type NextRequest } from "next/server";
import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { getRestaurantId } from "@/lib/restaurant";

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

  // Lien de parrainage WhatsApp (/join?ref=CODE) — capture le code dans un
  // cookie httpOnly puis redirige vers l'inscription. Doit s'exécuter avant
  // le garde d'authentification ci-dessous : l'ami cliquant le lien n'a pas
  // encore de compte. Anciennement un app/join/route.ts séparé, mais il ne
  // peut pas coexister avec app/join/page.tsx (même segment de route).
  if (path === "/join" && !user) {
    const ref = request.nextUrl.searchParams.get("ref");
    if (ref && /^[A-Z0-9]{6}$/.test(ref)) {
      const response = NextResponse.redirect(new URL("/signup", request.url));
      response.cookies.set("belchicken_ref", ref, {
        httpOnly: true,
        maxAge: 60 * 60 * 24, // 24h — expire si l'ami ne s'inscrit pas
        sameSite: "lax",
        secure: process.env.NODE_ENV === "production",
        path: "/",
      });
      return response;
    }
  }

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
  const isBecomePartnerRoute = path.startsWith("/become-a-partner");
  const isPlatformRoute = path.startsWith("/platform");

  // Routes protégées : authentification requise
  if ((isRestaurantRoute || isAdminRoute || isJoinRoute || isBecomePartnerRoute || isPlatformRoute) && !user) {
    return NextResponse.redirect(new URL("/login", request.url));
  }

  // Route établissement : le membre doit avoir une adhésion pour CET
  // établissement précis (ADR 0015 §2 — pas de blocage global). L'équipe est
  // OPTIONNELLE (ADR 0018) : sans équipe, l'app reste entièrement accessible —
  // chaque page gère son état vide. Sans adhésion → landing /r/[id] (Rejoindre).
  if (isRestaurantRoute && user && currentRestaurantId) {
    const { data: membership } = await supabase
      .from("memberships")
      .select("restaurant_id")
      .eq("user_id", user.id)
      .eq("restaurant_id", currentRestaurantId)
      .maybeSingle();
    if (!membership) {
      return NextResponse.redirect(new URL(`/r/${currentRestaurantId}`, request.url));
    }
  }

  // Admin établissement (ADR 0015 §7) : pont legacy is_admin (restaurant par
  // défaut uniquement) OU owner_id (self-service, n'importe quel établissement).
  // /admin (nu) et /admin/coupon/[token] restent à authentification seule —
  // la résolution fine (liste des établissements, token) reste dans la page.
  const adminMatch = path.match(/^\/admin\/([^/]+)/);
  const adminRestaurantId = adminMatch?.[1];
  const isAdminEstablishmentRoute = !!adminRestaurantId && adminRestaurantId !== "coupon";

  if (isAdminEstablishmentRoute && user && adminRestaurantId) {
    const [{ data: profile }, { data: restaurant }] = await Promise.all([
      supabase.from("profiles").select("is_admin, is_super_admin").eq("id", user.id).single(),
      supabase.from("restaurants").select("owner_id").eq("id", adminRestaurantId).maybeSingle(),
    ]);
    const isLegacyAdmin = !!profile?.is_admin && adminRestaurantId === getRestaurantId();
    const isOwner = restaurant?.owner_id === user.id;
    // Le super-admin plateforme accède à la console de n'importe quel
    // établissement (support, gestion des données — ADR 0015 §7).
    const isSuperAdmin = !!profile?.is_super_admin;
    if (!isLegacyAdmin && !isOwner && !isSuperAdmin) {
      return NextResponse.redirect(new URL("/join", request.url));
    }
  }

  // Console plateforme : is_super_admin requis (ADR 0015 §7 — rôle distinct
  // de is_admin, au-dessus de tous les établissements)
  if (isPlatformRoute && user) {
    const { data: profile } = await supabase
      .from("profiles")
      .select("is_super_admin")
      .eq("id", user.id)
      .single();
    if (!profile?.is_super_admin) {
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
