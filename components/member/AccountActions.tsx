"use client";

import { useEffect, useRef, useState } from "react";

export function AccountActions() {
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  // Modale in-app accessible à la place du window.confirm natif
  // (audit UX 2026-08-11 — accessibilité, AccountActions.tsx:14-17).
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [exported, setExported] = useState(false);
  const exportTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);

  function exportData() {
    window.location.href = "/api/me/export";
    // Feedback : le téléchargement ne change pas de page, rien ne confirme
    // sinon que le clic a fonctionné.
    setExported(true);
    if (exportTimer.current) clearTimeout(exportTimer.current);
    exportTimer.current = setTimeout(() => setExported(false), 2000);
  }

  useEffect(() => {
    return () => {
      if (exportTimer.current) clearTimeout(exportTimer.current);
    };
  }, []);

  // Fermeture Échap + focus initial sur « Annuler » (choix le moins destructif).
  useEffect(() => {
    if (!confirmOpen) return;
    cancelRef.current?.focus();
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") setConfirmOpen(false);
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [confirmOpen]);

  async function deleteAccount() {
    setConfirmOpen(false);
    setBusy(true);
    setMsg(null);
    const res = await fetch("/api/me/delete", { method: "POST" });
    if (res.ok) {
      window.location.href = "/";
    } else {
      setMsg("Erreur — réessaie.");
      setBusy(false);
    }
  }

  return (
    <div className="bg-white rounded-2xl border border-gray-100 p-5 space-y-3">
      <p className="font-semibold text-gray-900 text-sm">Mes données</p>

      <button
        onClick={exportData}
        className="w-full text-left px-4 py-3 rounded-lg border border-gray-200 text-sm font-medium text-gray-800 hover:bg-gray-50"
      >
        {exported ? (
          <span className="text-green-700" role="status">Export téléchargé ✓</span>
        ) : (
          <>⬇️ Exporter mes données (JSON)</>
        )}
      </button>

      <button
        onClick={() => setConfirmOpen(true)}
        disabled={busy}
        className="w-full text-left px-4 py-3 rounded-lg border border-red-200 text-sm font-medium text-red-700 hover:bg-red-50 disabled:opacity-50"
      >
        {busy ? "Suppression…" : "🗑️ Supprimer mon compte"}
      </button>

      {msg && <p className="text-xs text-red-600">{msg}</p>}

      <p className="text-xs text-gray-400">
        La suppression efface ou anonymise tes données personnelles. Les pièces liées à la comptabilité
        sont conservées de façon anonymisée, comme l&apos;exige la loi.
      </p>

      {confirmOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4"
          onClick={() => setConfirmOpen(false)}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="delete-account-title"
            aria-describedby="delete-account-desc"
            className="w-full max-w-sm bg-white rounded-2xl p-5 space-y-4 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <p id="delete-account-title" className="font-semibold text-gray-900">
              Supprimer ton compte ?
            </p>
            <p id="delete-account-desc" className="text-sm text-gray-600">
              Ton compte et ton historique seront supprimés définitivement.
            </p>
            <div className="flex flex-col gap-2">
              <button
                onClick={deleteAccount}
                className="w-full min-h-[48px] px-4 rounded-lg bg-red-600 text-white text-sm font-semibold hover:bg-red-700 focus:ring-2 focus:ring-red-600 focus:ring-offset-2"
              >
                Supprimer définitivement
              </button>
              <button
                ref={cancelRef}
                onClick={() => setConfirmOpen(false)}
                className="w-full min-h-[48px] px-4 rounded-lg bg-gray-100 text-gray-800 text-sm font-semibold hover:bg-gray-200 focus:ring-2 focus:ring-gray-400 focus:ring-offset-2"
              >
                Annuler
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
