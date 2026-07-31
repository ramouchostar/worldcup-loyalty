import Link from "next/link";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Hors ligne",
  robots: { index: false },
};

export default function OfflinePage() {
  return (
    <main className="min-h-screen bg-brand-dark flex items-center justify-center px-5">
      <div className="text-center max-w-sm">
        <p className="text-6xl mb-5" role="img" aria-label="Pas de signal">📶</p>
        <h1 className="text-2xl font-black text-white mb-3">Pas de connexion</h1>
        <p className="text-gray-400 text-sm leading-relaxed mb-8">
          Tu es hors ligne. Reconnecte-toi pour accéder à Boosteats.
        </p>
        <Link
          href="/"
          className="inline-block bg-brand-red text-white font-bold px-6 py-3 rounded-xl hover:bg-brand-red/85 transition-colors"
        >
          Réessayer
        </Link>
      </div>
    </main>
  );
}
