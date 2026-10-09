import Link from "next/link";
import type { Metadata } from "next";
import { LogOut } from "lucide-react";
import { requireProviderPage } from "@/lib/providers";

export const metadata: Metadata = { title: "Espace prestataire — Boosteats", robots: { index: false } };
export const dynamic = "force-dynamic";

// ADR 0084 — l'espace du prestataire. Un seul garde pour toutes ses pages :
// compte connecté ET prestataire ACTIF (un compte suspendu ou exclu est refusé
// ici, pas seulement par le middleware). Mobile d'abord : le prestataire
// ouvre un brief entre deux tournages.
export default async function ProviderLayout({ children }: { children: React.ReactNode }) {
  const { provider } = await requireProviderPage();

  return (
    <div className="min-h-screen bg-paper text-ink">
      <header className="bg-boost-night text-white">
        <div className="mx-auto max-w-3xl px-4 py-3 flex items-center gap-3">
          <Link href="/prestataire" className="min-w-0 flex-1">
            <p className="font-mono text-[10px] tracking-[0.14em] uppercase text-white/60">Boosteats · espace prestataire</p>
            <p className="font-display text-[17px] font-bold tracking-[-0.02em] truncate">{provider.display_name}</p>
          </Link>
          <form action="/api/auth/logout" method="post">
            <button type="submit" className="inline-flex items-center gap-1.5 min-h-[44px] px-3 rounded-lg text-[13px] text-white/80 hover:text-white hover:bg-white/10">
              <LogOut className="w-4 h-4" aria-hidden /> Déconnexion
            </button>
          </form>
        </div>
      </header>
      <main className="mx-auto max-w-3xl px-4 py-6">{children}</main>
    </div>
  );
}
