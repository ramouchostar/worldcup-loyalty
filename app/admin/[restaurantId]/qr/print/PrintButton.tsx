"use client";

// Bouton d'impression (écran uniquement, masqué à l'impression). Ouvre la
// boîte d'impression du navigateur → « Enregistrer au format PDF » donne un
// fichier prêt-à-imprimer aux dimensions exactes du format (@page).
export function PrintButton() {
  return (
    <button
      onClick={() => window.print()}
      className="bg-brand-red text-white font-semibold px-5 py-2.5 rounded-xl hover:bg-red-700 transition-colors"
    >
      🖨️ Imprimer / Enregistrer en PDF
    </button>
  );
}
