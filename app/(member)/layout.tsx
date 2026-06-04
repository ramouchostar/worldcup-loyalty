import Link from "next/link";
import { PushNotificationBanner } from "@/components/PushNotificationBanner";

const navLinks = [
  { href: "/dashboard",     label: "Dashboard",   icon: "🏠" },
  { href: "/submit-order",  label: "Commande",    icon: "🧾" },
  { href: "/rewards",       label: "Récompenses", icon: "🎁" },
  { href: "/micro-rewards", label: "Actions",     icon: "⭐" },
  { href: "/leaderboard",   label: "Classement",  icon: "🏆" },
];

export default function MemberLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-brand-dark text-white shadow-md sticky top-0 z-10">
        <div className="max-w-2xl mx-auto px-4 py-3 flex items-center justify-between">
          <Link href="/dashboard" className="font-bold text-lg tracking-tight" aria-label="Accueil WorldCup Loyalty">
            🏆 <span className="text-brand-gold">WorldCup</span> Loyalty
          </Link>
          <span className="text-xs text-gray-400" aria-hidden="true">Belchicken</span>
        </div>
      </header>

      <PushNotificationBanner />

      <main className="max-w-2xl mx-auto px-4 py-6" id="main-content">
        {children}
      </main>

      <nav
        className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 z-10"
        aria-label="Navigation principale"
      >
        <div className="max-w-2xl mx-auto flex justify-around">
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

      <div className="h-16" />
    </div>
  );
}
