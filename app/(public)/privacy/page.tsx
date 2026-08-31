import fs from "fs";
import path from "path";
import Link from "next/link";
import { renderMarkdown } from "@/lib/render-markdown";
import { CookiePreferencesButton } from "@/components/analytics/CookiePreferencesButton";

export const metadata = { title: "Politique de confidentialité" };

export default function PrivacyPage() {
  const md = fs.readFileSync(
    path.join(process.cwd(), "docs/legal/politique-de-confidentialite.md"),
    "utf8"
  );

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
          <Link href="/terms" className="text-xs text-gray-400 hover:text-gray-600 underline">
            {"Conditions générales d'utilisation"}
          </Link>
          <Link href="/conditions-restaurateurs" className="text-xs text-gray-400 hover:text-gray-600 underline">
            Conditions restaurateurs
          </Link>
          <CookiePreferencesButton />
        </p>
      </div>
    </div>
  );
}
