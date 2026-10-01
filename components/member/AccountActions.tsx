import Link from "next/link";
import { Download } from "lucide-react";

// La suppression n'est plus un bouton rouge au milieu des réglages : on y
// arrivait en cherchant « moins d'e-mails ». Elle reste à deux gestes, sur sa
// propre page (/compte/supprimer) — simple, jamais cachée (RGPD art. 17).
export function AccountActions() {
  return (
    <div className="bg-white rounded-2xl border border-gray-100 p-5 space-y-3">
      <p className="font-semibold text-gray-900 text-sm">Mes données</p>

      <a
        href="/api/me/export"
        className="w-full flex items-center gap-2 px-4 py-3 rounded-lg border border-gray-200 text-sm font-medium text-gray-800 hover:bg-gray-50"
      >
        <Download className="w-4 h-4 shrink-0" aria-hidden="true" />
        Exporter mes données (JSON)
      </a>

      <Link href="/compte/supprimer" className="block text-sm text-gray-500 underline">
        Supprimer mon compte
      </Link>
    </div>
  );
}
