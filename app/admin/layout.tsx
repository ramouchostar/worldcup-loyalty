import Link from "next/link";

const navLinks = [
  { href: "/admin",               label: "📊 Dashboard" },
  { href: "/admin/orders",        label: "🧾 Commandes" },
  { href: "/admin/micro-rewards", label: "⭐ Actions" },
  { href: "/admin/referrals",    label: "👥 Parrainages" },
  { href: "/admin/teams",         label: "🏴 Équipes" },
  { href: "/admin/thresholds",    label: "🎯 Seuils CA" },
];

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-gray-100">
      <header className="bg-brand-dark text-white shadow-md sticky top-0 z-10">
        <div className="max-w-5xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span className="text-brand-gold font-black text-lg">⚙️ Admin</span>
            <span className="text-gray-500 text-sm">Belchicken WorldCup</span>
          </div>
          <Link href="/dashboard" className="text-xs text-gray-400 hover:text-white transition-colors">
            ← Retour membre
          </Link>
        </div>
      </header>

      <div className="max-w-5xl mx-auto px-4 py-6 flex gap-6">
        {/* Sidebar */}
        <nav className="hidden md:flex flex-col gap-1 w-48 shrink-0">
          {navLinks.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className="flex items-center gap-2 px-3 py-2.5 rounded-lg text-sm font-medium text-gray-700 hover:bg-white hover:text-brand-red transition-colors"
            >
              {link.label}
            </Link>
          ))}
        </nav>

        {/* Mobile nav */}
        <div className="md:hidden w-full mb-4">
          <div className="flex overflow-x-auto gap-2 pb-1">
            {navLinks.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className="shrink-0 px-3 py-2 bg-white rounded-lg text-sm font-medium text-gray-700 hover:text-brand-red border border-gray-200"
              >
                {link.label}
              </Link>
            ))}
          </div>
        </div>

        {/* Content */}
        <main className="flex-1 min-w-0">{children}</main>
      </div>
    </div>
  );
}
