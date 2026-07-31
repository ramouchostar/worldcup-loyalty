import Link from "next/link";

// M1 (audit UX 2026-07) — sans cette page, la 404 Next par défaut n'a AUCUNE
// navigation → cul-de-sac systémique dès qu'un notFound() se déclenche (resto
// ou token invalide), surtout en PWA plein écran. On fournit une sortie.
export default function NotFound() {
  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center px-4">
      <div className="text-center max-w-sm">
        <p className="text-5xl mb-3">🔍</p>
        <h1 className="text-2xl font-bold text-gray-900">Page introuvable</h1>
        <p className="text-gray-500 text-sm mt-2">
          Cette page n&apos;existe pas ou n&apos;est plus disponible.
        </p>
        <Link
          href="/"
          className="inline-block mt-6 bg-brand-red text-white px-5 py-2.5 rounded-xl text-sm font-semibold hover:bg-brand-red/85 transition-colors"
        >
          ← Retour à l&apos;accueil
        </Link>
      </div>
    </div>
  );
}
