import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { cookies } from "next/headers";
import { NextResponse, type NextRequest } from "next/server";
import type { EmailOtpType } from "@supabase/supabase-js";
import { createAdminClient } from "@/lib/supabase";

export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const token_hash = searchParams.get("token_hash");
  const type = searchParams.get("type") as EmailOtpType | null;

  const cookieStore = await cookies();
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get(name: string) {
          return cookieStore.get(name)?.value;
        },
        set(name: string, value: string, options: CookieOptions) {
          try {
            cookieStore.set({ name, value, ...options });
          } catch {}
        },
        remove(name: string, options: CookieOptions) {
          try {
            cookieStore.set({ name, value: "", ...options });
          } catch {}
        },
      },
    }
  );

  let authError = null;

  if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    authError = error;
  } else if (token_hash && type) {
    const { error } = await supabase.auth.verifyOtp({ token_hash, type });
    authError = error;
  }

  if (!authError) {
    // Récupération de mot de passe → page dédiée avant toute redirection
    if (type === "recovery") {
      return NextResponse.redirect(`${origin}/reset-password`);
    }

    const { data: { user } } = await supabase.auth.getUser();
    if (user) {
      const adminEmails = (process.env.ADMIN_EMAILS ?? "")
        .split(",")
        .map((e) => e.trim().toLowerCase())
        .filter(Boolean);

      if (adminEmails.includes((user.email ?? "").toLowerCase())) {
        const admin = createAdminClient();
        await admin
          .from("profiles")
          .update({ is_admin: true })
          .eq("id", user.id);
      }

      const { data: profile } = await supabase
        .from("profiles")
        .select("display_name")
        .eq("id", user.id)
        .single();

      if (!profile?.display_name) {
        return NextResponse.redirect(`${origin}/register`);
      }

      // ADR 0015 §2 — ouvre sur le dernier établissement rejoint, ou /join
      // si le membre a un profil mais n'a encore rejoint aucun restaurant.
      const { data: membership } = await supabase
        .from("memberships")
        .select("restaurant_id")
        .eq("user_id", user.id)
        .order("joined_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      return NextResponse.redirect(
        `${origin}${membership ? `/r/${membership.restaurant_id}/dashboard` : "/join"}`
      );
    }
    return NextResponse.redirect(`${origin}/join`);
  }

  return NextResponse.redirect(`${origin}/login?error=lien_invalide`);
}
