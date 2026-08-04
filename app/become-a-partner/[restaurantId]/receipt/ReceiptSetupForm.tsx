"use client";

import { useRef, useState } from "react";
import { analyzeReceiptSamples, confirmReceiptConfig } from "../../actions";
import type { ReceiptKeyProposal } from "@/lib/receipt-key-discovery";

// Étape 3/4 onboarding (ADR 0019). Deux phases :
// 1. upload 2-3 photos → analyse → proposition de clé unique ;
// 2. le restaurateur confirme (ou corrige les champs, ou déclare qu'il n'a
//    pas de numéro fiable). L'app propose, le restaurateur décide.
export function ReceiptSetupForm({ restaurantId }: { restaurantId: string }) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [files, setFiles] = useState<File[]>([]);
  const [analyzing, setAnalyzing] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [proposal, setProposal] = useState<ReceiptKeyProposal | null>(null);
  const [showAdvanced, setShowAdvanced] = useState(false);

  function onFiles(e: React.ChangeEvent<HTMLInputElement>) {
    const selected = Array.from(e.target.files ?? []).slice(0, 3);
    setFiles(selected);
    setError(null);
    setProposal(null);
  }

  async function handleAnalyze(e: React.FormEvent) {
    e.preventDefault();
    if (files.length < 2) {
      setError("Ajoute au moins 2 photos de tickets différents.");
      return;
    }
    setAnalyzing(true);
    setError(null);

    const formData = new FormData();
    for (const file of files) formData.append("receipts", file);

    const result = await analyzeReceiptSamples(restaurantId, null, formData);
    setAnalyzing(false);

    if (result.error) setError(result.error);
    else if (result.proposal) setProposal(result.proposal);
  }

  async function handleConfirm(formData: FormData) {
    setConfirming(true);
    setError(null);
    const result = await confirmReceiptConfig(restaurantId, null, formData);
    // Si pas d'erreur, l'action redirige vers l'étape 4 (réseaux sociaux).
    if (result?.error) {
      setError(result.error);
      setConfirming(false);
    }
  }

  return (
    <div className="space-y-5">
      {/* Phase 1 — upload + analyse */}
      <form onSubmit={handleAnalyze} className="bg-white rounded-2xl shadow-xl p-6 space-y-4">
        <label className="block text-sm font-medium text-gray-700">
          2 à 3 photos de tickets (JPG, PNG ou WebP — max 5 Mo chacune)
        </label>
        <div
          className="border-2 border-dashed border-gray-300 rounded-xl p-6 text-center cursor-pointer hover:border-brand-red transition-colors"
          onClick={() => fileRef.current?.click()}
        >
          {files.length > 0 ? (
            <div className="space-y-1">
              {files.map((f, i) => (
                <p key={i} className="font-semibold text-gray-700 text-sm">🎫 {f.name}</p>
              ))}
            </div>
          ) : (
            <>
              <p className="text-3xl mb-2">📸</p>
              <p className="font-semibold text-gray-700 text-sm">
                Clique pour choisir tes photos de tickets
              </p>
            </>
          )}
          <input
            ref={fileRef}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            multiple
            className="hidden"
            onChange={onFiles}
          />
        </div>

        <button
          type="submit"
          disabled={analyzing || files.length < 2}
          className="w-full bg-brand-red text-white py-3 px-4 rounded-lg font-semibold hover:bg-brand-red/85 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          {analyzing ? "Analyse des tickets..." : "Analyser mes tickets"}
        </button>
      </form>

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-3">
          <p className="text-red-700 text-sm font-medium">{error}</p>
        </div>
      )}

      {/* Phase 2 — proposition + confirmation */}
      {proposal && proposal.has_reliable_key && (
        <form action={handleConfirm} className="bg-white rounded-2xl shadow-xl p-6 space-y-4">
          <div>
            <h2 className="font-bold text-gray-900">Numéro repéré sur tes tickets ✅</h2>
            <p className="text-sm text-gray-500 mt-1">
              Vérifie que c&apos;est bien le numéro imprimé sur chaque ticket, corrige si besoin.
            </p>
          </div>

          <div>
            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">
              Nom du champ sur le ticket
            </label>
            <input
              name="key_label"
              defaultValue={proposal.key_label}
              required
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">
              Valeurs lues sur tes photos
            </label>
            <div className="space-y-2">
              {proposal.key_examples.map((example, i) => (
                <input
                  key={i}
                  name="key_examples"
                  defaultValue={example}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm font-mono"
                />
              ))}
            </div>
          </div>

          {proposal.position_hint && (
            <p className="text-xs text-gray-500">📍 Position : {proposal.position_hint}</p>
          )}
          {proposal.notes && (
            <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg p-2">
              {proposal.notes}
            </p>
          )}

          <button
            type="button"
            onClick={() => setShowAdvanced((v) => !v)}
            className="text-xs text-gray-400 underline"
          >
            {showAdvanced ? "Masquer les détails techniques" : "Détails techniques"}
          </button>

          <div className={showAdvanced ? "space-y-3" : "hidden"}>
            <div>
              <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">
                Description du format (prompt OCR)
              </label>
              <input
                name="key_description"
                defaultValue={proposal.key_description}
                required
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">
                Pattern (regex ancrée)
              </label>
              <input
                name="key_pattern"
                defaultValue={proposal.key_pattern}
                required
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm font-mono"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">
                Groupe de capture de la date (vide si aucune)
              </label>
              <input
                name="date_group"
                defaultValue={proposal.date_group ?? ""}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
              />
            </div>
            <input type="hidden" name="position_hint" value={proposal.position_hint} />
          </div>
          {!showAdvanced && (
            <>
              <input type="hidden" name="key_description" value={proposal.key_description} />
              <input type="hidden" name="key_pattern" value={proposal.key_pattern} />
              <input type="hidden" name="date_group" value={proposal.date_group ?? ""} />
              <input type="hidden" name="position_hint" value={proposal.position_hint} />
            </>
          )}

          <button
            type="submit"
            disabled={confirming}
            className="w-full bg-brand-red text-white py-3 px-4 rounded-lg font-semibold hover:bg-brand-red/85 disabled:opacity-50 transition-colors"
          >
            {confirming ? "Enregistrement..." : "C'est bien ça — continuer →"}
          </button>
        </form>
      )}

      {proposal && !proposal.has_reliable_key && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 text-sm text-amber-900 space-y-2">
          <p className="font-semibold">Aucun numéro fiable repéré sur ces tickets</p>
          <p>
            {proposal.notes || "Les photos ne laissent pas apparaître de numéro présent sur tous les tickets."}{" "}
            Tu peux réessayer avec des photos plus nettes, ou continuer sans : les commandes de
            tes clients passeront alors par ta file de vérification.
          </p>
        </div>
      )}

      {/* Sortie explicite — toujours disponible */}
      <form action={handleConfirm} className="text-center">
        <input type="hidden" name="skip" value="true" />
        <button
          type="submit"
          disabled={confirming}
          className="text-sm text-gray-400 underline hover:text-gray-600 disabled:opacity-50"
        >
          Je n&apos;ai pas de numéro fiable sur mes tickets — continuer sans
        </button>
      </form>
    </div>
  );
}
