"use client";

import { useState } from "react";

export function AccountActions() {
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  function exportData() {
    window.location.href = "/api/me/export";
  }

  async function deleteAccount() {
    const ok = window.confirm(
      "Supprimer définitivement ton compte ? Tes données personnelles seront effacées ou anonymisées. Cette action est irréversible."
    );
    if (!ok) return;
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
        ⬇️ Exporter mes données (JSON)
      </button>

      <button
        onClick={deleteAccount}
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
    </div>
  );
}
