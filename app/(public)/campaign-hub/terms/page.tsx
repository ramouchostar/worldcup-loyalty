import fs from "fs";
import path from "path";
import Link from "next/link";
import { renderMarkdown } from "@/lib/render-markdown";

// BE Campaign Hub — URL déclarée aux plateformes (voir campaign-hub/privacy).
export const metadata = { title: "Conditions d'utilisation — BE Campaign Hub" };

export default function CampaignHubTermsPage() {
  const md = fs.readFileSync(path.join(process.cwd(), "docs/legal/campaign-hub-conditions.md"), "utf8");

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
          <Link href="/campaign-hub/privacy" className="text-xs text-gray-400 hover:text-gray-600 underline">
            Politique de confidentialité
          </Link>
          <Link href="/campaign-hub/data-deletion" className="text-xs text-gray-400 hover:text-gray-600 underline">
            Suppression des données
          </Link>
        </p>
      </div>
    </div>
  );
}
