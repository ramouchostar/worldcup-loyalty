import fs from "fs";
import path from "path";
import Link from "next/link";
import { renderMarkdown } from "@/lib/render-markdown";

// BE Campaign Hub — l'outil interne de gestion des campagnes Meta / TikTok des
// clients. Ces trois pages (privacy, terms, data-deletion) sont les URL
// déclarées aux plateformes (app Meta, app TikTok) : ne pas les déplacer sans
// mettre à jour les deux apps. Même mécanique que /privacy : le markdown de
// docs/legal est la source unique, en français puis en anglais pour la revue.
export const metadata = { title: "Politique de confidentialité — BE Campaign Hub" };

export default function CampaignHubPrivacyPage() {
  const md = fs.readFileSync(path.join(process.cwd(), "docs/legal/campaign-hub-confidentialite.md"), "utf8");

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-3xl mx-auto px-4 py-8">
        <Link href="/" className="text-sm text-gray-400 hover:text-gray-600 transition-colors">
          ← Retour
        </Link>
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6 sm:p-8 mt-4">
          {renderMarkdown(md)}
        </div>
        <p className="text-center mt-5 flex items-center justify-center gap-4">
          <Link href="/campaign-hub/terms" className="text-xs text-gray-400 hover:text-gray-600 underline">
            {"Conditions d'utilisation"}
          </Link>
          <Link href="/campaign-hub/data-deletion" className="text-xs text-gray-400 hover:text-gray-600 underline">
            Suppression des données
          </Link>
        </p>
      </div>
    </div>
  );
}
