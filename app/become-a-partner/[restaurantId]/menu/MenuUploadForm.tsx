"use client";

import { useRef, useState } from "react";
import { submitOnboardingMenu } from "../../actions";

const TEMPLATE_ROWS: [string, string, string, string][] = [
  ["Salade César", "Entrée", "7,50", "1,20"],
  ["Finest burger", "Burger", "9,00", "0,94"],
  ["Menu 4 Tenders", "Menu", "12,50", "1,93"],
  ["Frites Medium (accompagnement gratuit)", "Accompagnement", "0,00", "0,24"],
  ["Frites Medium (à la carte)", "Accompagnement", "3,00", "0,24"],
  ["Onion rings (accompagnement gratuit)", "Accompagnement", "0,00", "0,35"],
  ["Onion rings (à la carte)", "Accompagnement", "3,50", "0,35"],
  ["Churros 6 pcs", "Dessert", "3,50", "0,31"],
  ["Tiramisu maison", "Dessert", "5,00", "0,80"],
  ["Coca-Cola 33cl", "Boisson", "2,50", "0,30"],
  ["Eau plate 50cl", "Boisson", "2,00", "0,15"],
  ["Milkshake vanille", "Boisson", "4,50", "0,65"],
];

const TEMPLATE_CSV =
  "nom;categorie;prix_vente;prix_revient\n" +
  TEMPLATE_ROWS.map((r) => r.join(";")).join("\n");

function downloadTemplate() {
  const blob = new Blob([TEMPLATE_CSV], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "modele-catalogue-menu.csv";
  a.click();
  URL.revokeObjectURL(url);
}

export function MenuUploadForm({ restaurantId }: { restaurantId: string }) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [csv, setCsv] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [warnings, setWarnings] = useState<string[]>([]);

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setFileName(file.name);
    setCsv(await file.text());
    setError(null);
    setWarnings([]);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!csv) {
      setError("Choisis d'abord ton fichier catalogue.");
      return;
    }

    setLoading(true);
    setError(null);

    const formData = new FormData();
    formData.set("csv", csv);

    const result = await submitOnboardingMenu(restaurantId, null, formData);

    if (result?.error) {
      setError(result.error);
      setWarnings(result.warnings ?? []);
      setLoading(false);
    }
    // si pas d'erreur, submitOnboardingMenu applique la grille par défaut
    // (ADR 0017 §4) puis redirige vers /admin/[restaurantId]/menu pour révision
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      {/* Bandeau confiance */}
      <div className="bg-gradient-to-br from-brand-dark to-gray-800 text-white rounded-2xl p-5">
        <p className="text-xs uppercase tracking-widest text-brand-gold font-bold mb-1">🔒 Usage interne uniquement</p>
        <p className="text-sm text-gray-200 leading-relaxed">
          Ce catalogue nous sert à construire <strong className="text-white">tes futures stratégies de
          promotion et de bundles</strong> (quel article offrir, à quel palier). Prix de vente et prix de
          revient ne sont <strong className="text-white">jamais montrés aux clients</strong> — seuls les noms
          d&apos;articles cadeaux peuvent apparaître dans l&apos;app.
        </p>
      </div>

      <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 text-sm text-amber-900 space-y-2">
        <p className="font-semibold">⚠️ Un même plat = plusieurs lignes si besoin</p>
        <p>
          Si un article existe à la fois en <strong>accompagnement gratuit</strong> et{" "}
          <strong>à la carte</strong> (ex. des frites), liste-le sur <strong>deux lignes distinctes</strong>{" "}
          avec des noms différents — comme dans le modèle ci-dessous. Chaque ligne devient un article à
          part entière, avec son propre identifiant.
        </p>
      </div>

      <div className="bg-white rounded-2xl shadow-xl p-6 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="font-bold text-gray-900">Aperçu du modèle</h2>
          <button
            type="button"
            onClick={downloadTemplate}
            className="text-xs font-semibold text-white bg-brand-red px-3 py-1.5 rounded-lg hover:bg-red-700 transition-colors"
          >
            📄 Télécharger le modèle CSV
          </button>
        </div>

        <div className="overflow-x-auto rounded-xl border border-gray-100">
          <table className="w-full text-xs">
            <thead>
              <tr className="bg-gray-50 text-gray-500">
                <th className="text-left px-3 py-2 font-semibold">nom</th>
                <th className="text-left px-3 py-2 font-semibold">categorie</th>
                <th className="text-right px-3 py-2 font-semibold">prix_vente</th>
                <th className="text-right px-3 py-2 font-semibold">prix_revient</th>
              </tr>
            </thead>
            <tbody>
              {TEMPLATE_ROWS.map((row, i) => (
                <tr key={i} className={i % 2 === 0 ? "bg-white" : "bg-gray-50/60"}>
                  <td className="px-3 py-1.5 text-gray-700">{row[0]}</td>
                  <td className="px-3 py-1.5 text-gray-500">{row[1]}</td>
                  <td className="px-3 py-1.5 text-right text-gray-700 tabular-nums">{row[2]} €</td>
                  <td className="px-3 py-1.5 text-right text-gray-400 tabular-nums">{row[3]} €</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="text-xs text-gray-500">
          Remplace ces lignes par ton propre menu — garde les mêmes 4 colonnes.
          <code className="mx-1 bg-gray-100 px-1 rounded">prix_revient</code>
          = coût matière réel (ce que ça te coûte à produire), pas le prix affiché en caisse.
        </p>
      </div>

      <div className="bg-white rounded-2xl shadow-xl p-6 space-y-4">
        <label className="block text-sm font-medium text-gray-700">Ton fichier catalogue</label>
        <div
          className="border-2 border-dashed border-gray-300 rounded-xl p-6 text-center cursor-pointer hover:border-brand-red transition-colors"
          onClick={() => fileRef.current?.click()}
        >
          {fileName ? (
            <p className="font-semibold text-gray-700 text-sm">📄 {fileName}</p>
          ) : (
            <>
              <p className="text-3xl mb-2">📋</p>
              <p className="font-semibold text-gray-700 text-sm">Clique pour choisir ton fichier CSV</p>
            </>
          )}
          <input ref={fileRef} type="file" accept=".csv,text/csv" className="hidden" onChange={onFile} />
        </div>

        {error && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-3">
            <p className="text-red-700 text-sm font-medium">{error}</p>
            {warnings.length > 0 && (
              <ul className="mt-2 text-xs text-red-600 list-disc list-inside space-y-0.5">
                {warnings.map((w, i) => <li key={i}>{w}</li>)}
              </ul>
            )}
          </div>
        )}

        <button
          type="submit"
          disabled={loading || !csv}
          className="w-full bg-brand-red text-white py-3 px-4 rounded-lg font-semibold hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          {loading ? "Envoi..." : "Terminer l'inscription →"}
        </button>
      </div>
    </form>
  );
}
