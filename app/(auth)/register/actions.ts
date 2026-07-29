"use server";

import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { createAdminClient } from "@/lib/supabase";
import { sanitizeZones } from "@/lib/zones";
import { recordConsents } from "@/lib/consent";
import { sendWelcomeEmail } from "@/lib/email";

function ageFromISO(d: string): number | null {
  const dt = new Date(d);
  if (isNaN(dt.getTime())) return null;
  const now = new Date();
  let age = now.getFullYear() - dt.getFullYear();
  const m = now.getMonth() - dt.getMonth();
  if (m < 0 || (m === 0 && now.getDate() < dt.getDate())) age--;
  return age;
}

// ADR 0015 — le choix de l'établissement se fait sur /join (table `restaurants`).
// ADR 0022 — collecte la date de naissance (contrôle d'âge / mineurs) et
// enregistre les consentements granulaires à l'inscription.
export async function registerProfile(
  _prevState: { error: string } | null,
  formData: FormData
): Promise<{ error: string } | null> {
  const displayName = (formData.get("display_name") as string).trim();
  if (!displayName) return { error: "Entre ton prénom." };

  // ADR 0018 — zones du membre (1 à 3)
  const zones = sanitizeZones(formData.getAll("zones"));
  if (zones.length === 0) {
    return { error: "Indique au moins ta zone (ville ou quartier où tu vis)." };
  }

  // ADR 0022 — âge
  const birthDate = ((formData.get("birth_date") as string) || "").trim();
  const age = ageFromISO(birthDate);
  if (age === null || age < 0 || age > 120) {
    return { error: "Indique une date de naissance valide." };
  }

  // ADR 0022 — acceptation de la politique (information, obligatoire)
  if (formData.get("accept_policy") !== "1") {
    return { error: "Tu dois accepter la politique de confidentialité et les conditions d'utilisation." };
  }

  const isMinor = age < 13;
  const parentalEmail = ((formData.get("parental_email") as string) || "").trim();
  if (isMinor && !parentalEmail) {
    return { error: "Un email d'un parent est requis pour les moins de 13 ans." };
  }

  // Opt-ins facultatifs (séparés — jamais groupés dans l'acceptation)
  const optMarketing = formData.get("opt_marketing") === "1";
  const optInsights = formData.get("opt_insights") === "1";

  const cookieStore = await cookies();
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            );
          } catch {}
        },
      },
    }
  );

  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.user) {
    return { error: "Non authentifié. Reconnecte-toi puis réessaie." };
  }
  const user = session.user;

  // Écritures via service role (contourne côté serveur le verrouillage RLS
  // du profil, m34, tout en restant sur le profil de l'utilisateur authentifié).
  const admin = createAdminClient();
  const { error } = await admin
    .from("profiles")
    .update({
      display_name: displayName,
      zones,
      birth_date: birthDate,
      is_minor: isMinor,
      parental_consent_status: isMinor ? "pending" : "none",
      parental_email: isMinor ? parentalEmail : null,
    })
    .eq("id", user.id);

  if (error) {
    return { error: "Erreur lors de l'enregistrement. Réessaie." };
  }

  // Enregistre les consentements (journal append-only, ADR 0022)
  await recordConsents(
    user.id,
    {
      programme: true,
      zones: true,
      marketing_push: optMarketing,
      marketing_whatsapp: optMarketing,
      insights_commerciaux: optInsights,
    },
    "signup",
    admin
  );

  // Bienvenue — une seule fois, à la création du profil. Attendu (pas
  // fire-and-forget) : une Server Action se termine à l'appel de redirect(),
  // un envoi non attendu risquerait d'être coupé avant de partir. Best-effort
  // côté résultat : un échec d'envoi ne bloque jamais l'inscription (cf.
  // lib/email.ts, ne lève jamais).
  if (user.email) await sendWelcomeEmail(user.email, displayName);

  // Arrivée via le QR / lien d'un établissement précis → on y retourne.
  const pendingRestaurantId = cookieStore.get("pending_restaurant_id")?.value;
  if (pendingRestaurantId) {
    cookieStore.set("pending_restaurant_id", "", { maxAge: 0, path: "/" });
    redirect(`/r/${pendingRestaurantId}`);
  }

  redirect("/join");
}
