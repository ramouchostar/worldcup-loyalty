import { redirect } from "next/navigation";
import Link from "next/link";
import { createServerSupabaseClient } from "@/lib/supabase";
import { getCurrentConsents } from "@/lib/consent";
import { createAdminClient } from "@/lib/supabase";
import { PrivacySettings } from "@/components/member/PrivacySettings";
import { ProfileSettings } from "@/components/member/ProfileSettings";
import { AccountActions } from "@/components/member/AccountActions";

export const metadata = { title: "Mon compte" };

export default async function ComptePage() {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const consents = await getCurrentConsents(user.id);
  // ADR 0047 — le profil (prénom, zones, naissance) vit ici, plus dans le
  // tunnel d'inscription. Lecture service-role (profil verrouillé RLS, m34).
  const { data: profileRaw } = await createAdminClient()
    .from("profiles")
    .select("display_name, zones, birth_date, parental_email")
    .eq("id", user.id)
    .maybeSingle();
  const profile = profileRaw as {
    display_name: string | null;
    zones: string[] | null;
    birth_date: string | null;
    parental_email: string | null;
  } | null;

  // /compte est HORS de la zone membre /r/[id] : elle n'hérite donc ni de la
  // BottomNav ni du header. Sans ce lien, l'utilisateur est piégé en PWA plein
  // écran (aucun bouton retour navigateur). On revient sur son établissement.
  const { data: membership } = await supabase
    .from("memberships")
    .select("restaurant_id")
    .eq("user_id", user.id)
    .limit(1)
    .maybeSingle();
  const backHref = membership?.restaurant_id
    ? `/r/${membership.restaurant_id}/dashboard`
    : "/";

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-lg mx-auto px-4 py-8 space-y-5">
        <Link
          href={backHref}
          className="inline-flex items-center gap-1.5 text-sm font-medium text-gray-500 hover:text-gray-900 transition-colors"
        >
          <span aria-hidden="true">←</span> Retour à l&apos;app
        </Link>
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Mon compte</h1>
          <p className="text-gray-500 text-sm mt-1">
            Confidentialité, consentements et données personnelles.
          </p>
        </div>

        <ProfileSettings
          initial={{
            display_name: profile?.display_name ?? "",
            zones: profile?.zones ?? [],
            birth_date: profile?.birth_date ?? "",
            parental_email: profile?.parental_email ?? "",
          }}
        />

        <PrivacySettings initial={consents} />

        <div className="bg-white rounded-2xl border border-gray-100 p-5 space-y-2">
          <p className="font-semibold text-gray-900 text-sm">Documents</p>
          <div className="flex flex-col gap-1.5 text-sm">
            <Link href="/privacy" className="text-brand-red underline">Politique de confidentialité</Link>
            <Link href="/terms" className="text-brand-red underline">Conditions d&apos;utilisation</Link>
          </div>
        </div>

        <AccountActions />
      </div>
    </div>
  );
}
