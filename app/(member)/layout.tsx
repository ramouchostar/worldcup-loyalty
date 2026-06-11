import Link from "next/link";
import { createServerSupabaseClient } from "@/lib/supabase";
import { UserNav } from "@/components/member/UserNav";
import { PushNotificationBanner } from "@/components/PushNotificationBanner";
import { InAppNotificationBanner } from "@/components/member/InAppNotificationBanner";
import { BottomNav } from "@/components/member/BottomNav";
import { InstallPrompt } from "@/components/member/InstallPrompt";

export default async function MemberLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-brand-dark text-white shadow-md sticky top-0 z-10">
        <div className="max-w-2xl mx-auto px-4 py-3 flex items-center justify-between">
          <Link href="/dashboard" className="font-bold text-lg tracking-tight" aria-label="Accueil WorldCup Loyalty">
            🏆 <span className="text-brand-gold">WorldCup</span> Loyalty
          </Link>
          <UserNav email={user?.email ?? ""} />
        </div>
      </header>

      <InstallPrompt />
      <PushNotificationBanner />
      <InAppNotificationBanner />

      <main className="max-w-2xl mx-auto px-4 py-6" id="main-content">
        {children}
      </main>

      <BottomNav />

      <div style={{ height: "calc(4rem + env(safe-area-inset-bottom, 0px))" }} />
    </div>
  );
}
