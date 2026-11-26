import Link from "next/link";
import { ArrowRight } from "@/components/icons";

// La barre de retour en haut des pages d'articles (maquette ADR 0111).

export function TopBack({ href, label }: { href: string; label: string }) {
  return (
    <nav className="border-b border-paper-border px-4 py-1">
      <Link href={href} className="inline-flex min-h-[44px] items-center gap-1.5 text-[15px] font-semibold text-ink hover:text-boost-olive-dark focus-visible:outline focus-visible:outline-2 focus-visible:outline-ink">
        <ArrowRight size={20} aria-hidden="true" className="rotate-180" />
        {label}
      </Link>
    </nav>
  );
}
