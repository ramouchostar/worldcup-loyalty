import Link from "next/link";
import { createServerSupabaseClient } from "@/lib/supabase";
import { UserNav } from "@/components/member/UserNav";
import { PushNotificationBanner } from "@/components/PushNotificationBanner";
import { InAppNotificationBanner } from "@/components/member/InAppNotificationBanner";

const navLinks = [
  { href: "/dashboard",     label: "Dashboard",   icon: "🏠" },
  { href: "/submit-order",  label: "Commande",    icon: "🧾" },
  { href: "/rewards",       label: "Récompenses", icon: "🎁" },
  { href: "/micro-rewards", label: "Actions",     icon: "⭐" },
  { href: "/leaderboard",   label: "Classement",  icon: "🏆" },
];

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

      <PushNotificationBanner />
      <InAppNotificationBanner />

      <main className="max-w-2xl mx-auto px-4 py-6" id="main-content">
        {children}
      </main>

      <nav
        className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 z-10"
        aria-label="Navigation principale"
      >
        <div className="max-w-2xl mx-auto flex justify-around pb-safe">
          {navLinks.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className="flex flex-col items-center py-2 px-1 text-xs text-gray-600 hover:text-brand-red transition-colors min-w-0"
              aria-label={link.label}
            >
              <span className="text-lg leading-none mb-0.5" aria-hidden="true">{link.icon}</span>
              <span className="truncate">{link.label}</span>
            </Link>
          ))}
        </div>
      </nav>

      <div style={{ height: "calc(4rem + env(safe-area-inset-bottom, 0px))" }} />
    </div>
  );
}
