import { redirect } from "next/navigation";
import Link from "next/link";
import { createServerSupabaseClient } from "@/lib/supabase";
import { getCurrentConsents } from "@/lib/consent";
import { PrivacySettings } from "@/components/member/PrivacySettings";
import { AccountActions } from "@/components/member/AccountActions";

export const metadata = { title: "Mon compte" };

export default async function ComptePage() {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const consents = await getCurrentConsents(user.id);

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-lg mx-auto px-4 py-8 space-y-5">
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
    </div>
  );
}
