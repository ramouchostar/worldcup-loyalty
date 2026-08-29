import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { getRestaurantId } from "@/lib/restaurant";
import { OWNER_INVITE_COOKIE, isValidInviteToken } from "@/lib/owner-invite-token";

export async function middleware(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          supabaseResponse = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          );
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

  // Lien d'invitation restaurateur (/invite/[token], ADR 0032) — le restaurateur
  // n'a pas encore de compte : on mémorise le token dans un cookie httpOnly
  // (même mécanique que le parrainage ci-dessus) puis on LAISSE PASSER vers
  // la page d'invitation, qui explique de quoi il s'agit avant l'inscription.
  // Le cookie sert au retour : inscription/connexion → /invite/[token].
  const inviteMatch = path.match(/^\/invite\/([^/]+)$/);
  if (inviteMatch && !user && isValidInviteToken(inviteMatch[1])) {
    supabaseResponse.cookies.set(OWNER_INVITE_COOKIE, inviteMatch[1], {
      httpOnly: true,
      maxAge: 60 * 60 * 24 * 14, // aligné sur la durée de vie de l'invitation
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
    });
    return supabaseResponse;
  }

  // Invitation en attente : elle prime sur le routage par rôle ci-dessous —
  // le restaurateur qui vient de s'inscrire doit atterrir sur son invitation,
  // pas sur l'app membre. Consommée (cookie effacé) par l'acceptation ou le
  // « Pas maintenant » (app/invite/[token]/actions.ts).
  const pendingInvite = request.cookies.get(OWNER_INVITE_COOKIE)?.value;
  if (
    user &&
    (path === "/login" || path === "/signup" || path === "/join") &&
    pendingInvite &&
    isValidInviteToken(pendingInvite)
  ) {
    return NextResponse.redirect(new URL(`/invite/${pendingInvite}`, request.url));
  }

  // Redirige les utilisateurs déjà connectés hors des pages auth, par rôle
  // (ADR 0030 §1 — plateforme > console > membre ; `as=resto` force la
  // console). Même hiérarchie que lib/post-login.ts, dupliquée ici car le
  // middleware n'embarque pas la clé service-role — garder les deux en phase.
  const isAuthRoute = path === "/login" || path === "/signup";
  if (isAuthRoute && user) {
    const [{ data: profile }, { data: owned }, { data: seats }, { data: membership }] = await Promise.all([
      supabase.from("profiles").select("is_admin, is_super_admin").eq("id", user.id).single(),
      supabase.from("restaurants").select("id").eq("owner_id", user.id).limit(1),
      // ADR 0041 — siège restaurant_admins (gérant/manager/équipe), pas
      // seulement owner_id. Lisible ici via RLS self-read, sans clé
      // service-role.
      supabase.from("restaurant_admins").select("restaurant_id").eq("user_id", user.id).limit(1),
      supabase
        .from("memberships")
        .select("restaurant_id")
        .eq("user_id", user.id)
        .order("joined_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
    ]);
    const hasConsole = (owned ?? []).length > 0 || (seats ?? []).length > 0 || !!profile?.is_admin;
    const asResto = request.nextUrl.searchParams.get("as") === "resto";
    let dest: string;
    if (asResto) {
      dest = hasConsole ? "/admin" : profile?.is_super_admin ? "/platform" : "/become-a-partner";
    } else if (profile?.is_super_admin) {
      dest = "/platform";
    } else if (hasConsole) {
      dest = "/admin";
    } else {
      dest = membership ? `/r/${membership.restaurant_id}/dashboard` : "/join";
    }
    return NextResponse.redirect(new URL(dest, request.url));
  }

  const restaurantMatch = path.match(/^\/r\/([^/]+)\//);
  const currentRestaurantId = restaurantMatch?.[1];
  // /r/[id]/leaderboard reste public (classement consultable sans compte) ;
  // /r/[id]/submit-order aussi (ADR 0040 — la photo d'abord, le compte à
  // l'envoi ; la page gère elle-même visiteur, reprise et adhésion auto).
  const isPublicRestaurantRoute =
    !!currentRestaurantId &&
    (path === `/r/${currentRestaurantId}/leaderboard` ||
      path === `/r/${currentRestaurantId}/submit-order`);
  const isRestaurantRoute = !!restaurantMatch && !isPublicRestaurantRoute;

  const isAdminRoute = path.startsWith("/admin");
  const isJoinRoute = path === "/join";
  const isBecomePartnerRoute = path.startsWith("/become-a-partner");
  const isPlatformRoute = path.startsWith("/platform");

  // Routes protégées : authentification requise. `reason` → bandeau clair
  // sur la page de login (ADR 0030 §8 — refus parlants, jamais silencieux).
  if ((isRestaurantRoute || isAdminRoute || isJoinRoute || isBecomePartnerRoute || isPlatformRoute) && !user) {
    // `as=resto` (ADR 0030 §1) bascule /login sur l'habillage « Espace
    // restaurateur » (LoginForm.tsx) : badge dédié, lien direct "Inscrire mon
    // restaurant", et surtout passé au formulaire mot de passe → resolvePostLoginDestination
    // renvoie déjà /become-a-partner dans ce cas. Sans lui, un prospect
    // anonyme tombait sur l'habillage générique membre (constaté en usage).
    const loginUrl = isBecomePartnerRoute
      ? "/login?reason=login-required&as=resto"
      : "/login?reason=login-required";
    const response = NextResponse.redirect(new URL(loginUrl, request.url));
    // Un prospect anonyme sur /become-a-partner n'a pas encore de compte : le
    // détour par /login (ou /register pour un tout nouveau compte) faisait
    // perdre son intention, et il retombait sur le parcours membre (/join)
    // au lieu du formulaire partenaire. Même mécanique que pending_restaurant_id
    // ci-dessous — cookie consommé par auth/callback et register/actions (le
    // param `as=resto` ci-dessus ne survit pas au aller-retour magic-link/OAuth).
    if (isBecomePartnerRoute) {
      response.cookies.set("pending_become_partner", "1", {
        httpOnly: true,
        maxAge: 60 * 60 * 24,
        sameSite: "lax",
        secure: process.env.NODE_ENV === "production",
        path: "/",
      });
    }
    return response;
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

  // Admin établissement (ADR 0015 §7 + ADR 0041) : pont legacy is_admin
  // (restaurant par défaut uniquement) OU owner_id (self-service) OU siège
  // restaurant_admins (gérant/manager/équipe — plusieurs admins possibles).
  // /admin (nu) et /admin/coupon/[token] restent à authentification seule —
  // la résolution fine (liste des établissements, token) reste dans la page.
  const adminMatch = path.match(/^\/admin\/([^/]+)/);
  const adminRestaurantId = adminMatch?.[1];
  const isAdminEstablishmentRoute = !!adminRestaurantId && adminRestaurantId !== "coupon";

  if (isAdminEstablishmentRoute && user && adminRestaurantId) {
    const [{ data: profile }, { data: restaurant }, { data: seat }] = await Promise.all([
      supabase.from("profiles").select("is_admin, is_super_admin").eq("id", user.id).single(),
      supabase.from("restaurants").select("owner_id").eq("id", adminRestaurantId).maybeSingle(),
      // Lisible via RLS self-read (restaurant_admins_own_read), sans clé
      // service-role — même contrainte que le reste de ce fichier.
      supabase
        .from("restaurant_admins")
        .select("role")
        .eq("restaurant_id", adminRestaurantId)
        .eq("user_id", user.id)
        .maybeSingle(),
    ]);
    const isLegacyAdmin = !!profile?.is_admin && adminRestaurantId === getRestaurantId();
    const isOwner = restaurant?.owner_id === user.id;
    const hasSeat = !!seat;
    // Le super-admin plateforme accède à la console de n'importe quel
    // établissement (support, gestion des données — ADR 0015 §7).
    const isSuperAdmin = !!profile?.is_super_admin;
    if (!isLegacyAdmin && !isOwner && !isSuperAdmin && !hasSeat) {
      // ADR 0030 §8 — refus parlant : /join affiche pourquoi on atterrit là.
      return NextResponse.redirect(new URL("/join?reason=admin-required", request.url));
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
      // ADR 0030 §8 — refus parlant.
      return NextResponse.redirect(new URL("/join?reason=platform-required", request.url));
    }
  }

  return supabaseResponse;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|auth/callback|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
