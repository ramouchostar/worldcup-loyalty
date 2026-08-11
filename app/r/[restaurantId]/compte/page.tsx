import { redirect } from "next/navigation";
import Link from "next/link";
import { createServerSupabaseClient } from "@/lib/supabase";
import { getCurrentConsents } from "@/lib/consent";
import { PrivacySettings } from "@/components/member/PrivacySettings";
import { AccountActions } from "@/components/member/AccountActions";
import { BackLink } from "@/components/member/BackLink";

export const metadata = { title: "Mon compte" };

// /compte vit désormais sous le layout membre (audit UX 2026-08-11, constat
// M9 nav) : header + BottomNav hérités, plus de retour vers un resto
// arbitraire. L'ancienne URL /compte redirige ici (liens et emails existants).
export default async function ComptePage({
  params,
}: {
  params: Promise<{ restaurantId: string }>;
}) {
  const { restaurantId } = await params;

  // Le middleware garde déjà /r/[id]/* (auth + adhésion à CET établissement) ;
  // garde défensive conservée car la page a besoin de user.id.
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login?reason=login-required");

  const consents = await getCurrentConsents(user.id);

  return (
    <div className="space-y-5">
      {/* ADR 0030 §5 — pas un onglet de la BottomNav → ← vers le parent logique */}
      <BackLink href={`/r/${restaurantId}/dashboard`} />
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Mon compte</h1>
        <p className="text-gray-500 text-sm mt-1">
          Confidentialité, consentements et données personnelles.
        </p>
      </div>

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
  );
}
