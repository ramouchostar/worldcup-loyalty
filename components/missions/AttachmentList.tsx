import { Download } from "lucide-react";
import type { AttachmentView } from "@/lib/mission-files";
import { humanSizeL, type Locale } from "@/lib/i18n/core";

// Les pièces jointes, en lecture : un lien par fichier vers la route de téléchargement (qui vérifie l'accès puis
// redirige vers un lien signé de 60 secondes, téléchargement forcé). Jamais un lien durable dans la page.

export function AttachmentList({ files, base, query = "", locale = "fr" }: { locale?: Locale; files: readonly AttachmentView[]; /** `/api/admin/missions/<id>/files` ou `/api/prestataire/missions/<id>/files` */ base: string; /** `?restaurantId=…` côté restaurateur */ query?: string }) {
  if (files.length === 0) return null;
  return (
    <ul className="space-y-1.5">
      {files.map((f) => (
        <li key={f.id}>
          <a href={`${base}/${f.id}${query}`} className="inline-flex items-center gap-2 min-h-[36px] text-[13.5px] font-semibold text-ink underline underline-offset-2">
            <Download className="w-4 h-4 shrink-0" aria-hidden />
            <span className="break-all">{f.name}</span>
            <span className="font-normal text-ink-muted no-underline">({humanSizeL(f.size, locale)})</span>
          </a>
        </li>
      ))}
    </ul>
  );
}
