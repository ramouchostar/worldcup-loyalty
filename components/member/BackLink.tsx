import Link from "next/link";

/**
 * Lien retour unifié des pages membres (audit UX 2026-08-11, constat M4 nav).
 * Une seule règle partout : flèche + libellé texte (jamais de flèche seule),
 * cible tactile ≥ 44 px (WCAG 2.5.8 / guideline 48 dp), contraste gray-600.
 */
export function BackLink({ href, label = "Accueil" }: { href: string; label?: string }) {
  return (
    <Link
      href={href}
      className="inline-flex min-h-[44px] items-center gap-1.5 px-2 -ml-2 text-sm font-medium text-gray-600 hover:text-gray-900"
    >
      <span aria-hidden="true">←</span>
      {label}
    </Link>
  );
}
