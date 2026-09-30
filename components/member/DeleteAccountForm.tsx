"use client";

import { useState } from "react";
import Link from "next/link";
import { Trash2 } from "lucide-react";
import { DELETION_REASONS, DELETION_DETAIL_MAX, type DeletionReason } from "@/lib/account-deletion";

export type DeletionLoss = { restaurant: string; points: number; gifts: string[] };

export function DeleteAccountForm({ losses }: { losses: DeletionLoss[] }) {
  const [reason, setReason] = useState<DeletionReason | null>(null);
  const [detail, setDetail] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const withSomething = losses.filter((l) => l.points > 0 || l.gifts.length > 0);

  async function confirmDelete() {
    setBusy(true);
    setMsg(null);
    const res = await fetch("/api/me/delete", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ reason, detail: reason === "autre" ? detail : "" }),
    });
    if (res.ok) {
      window.location.href = "/";
    } else {
      setMsg("Erreur — réessaie.");
      setBusy(false);
    }
  }

  return (
    <div className="space-y-5">
      {withSomething.length > 0 && (
        <div className="bg-white rounded-2xl border border-gray-100 p-5 space-y-2">
          <p className="font-semibold text-gray-900 text-sm">Ce que tu perds</p>
          <ul className="text-sm text-gray-700 space-y-1">
            {withSomething.map((l) => (
              <li key={l.restaurant}>
                {l.points > 0 && (
                  <>
                    <span className="font-semibold">{l.points.toLocaleString("fr-BE")} points</span> chez {l.restaurant}
                  </>
                )}
                {l.gifts.map((g) => (
                  <span key={g} className="block">
                    Ton cadeau qui t&apos;attend : <span className="font-semibold">{g}</span>
                  </span>
                ))}
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="bg-white rounded-2xl border border-gray-100 p-5 space-y-3">
        <p className="font-semibold text-gray-900 text-sm">Pourquoi pars-tu ? <span className="font-normal text-gray-500">(facultatif)</span></p>
        <div className="space-y-2">
          {DELETION_REASONS.map((r) => (
            <label key={r.key} className="flex items-center gap-3 text-sm text-gray-800">
              <input
                type="radio"
                name="reason"
                value={r.key}
                checked={reason === r.key}
                onChange={() => setReason(r.key)}
                className="w-4 h-4 accent-gray-900"
              />
              {r.label}
            </label>
          ))}
        </div>
        {reason === "autre" && (
          <textarea
            value={detail}
            onChange={(e) => setDetail(e.target.value.slice(0, DELETION_DETAIL_MAX))}
            rows={3}
            placeholder="Dis-nous en un mot (facultatif)"
            className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm"
          />
        )}
        {reason === "trop_de_messages" && (
          <div className="rounded-xl bg-gray-50 p-3 text-sm text-gray-700 space-y-2">
            <p>Tu peux couper les rappels et garder tes points.</p>
            <Link href="/compte#emails" className="inline-block font-semibold text-gray-900 underline">
              Choisir mes e-mails
            </Link>
          </div>
        )}
      </div>

      <div className="space-y-2">
        <button
          onClick={confirmDelete}
          disabled={busy}
          className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-xl border border-red-200 text-sm font-semibold text-red-700 hover:bg-red-50 disabled:opacity-50"
        >
          <Trash2 className="w-4 h-4 shrink-0" aria-hidden="true" />
          {busy ? "Suppression…" : "Supprimer définitivement mon compte"}
        </button>
        {msg && <p className="text-xs text-red-600">{msg}</p>}
        <p className="text-xs text-gray-500">
          Tes données personnelles sont effacées ou anonymisées. Les pièces liées à la comptabilité sont
          conservées de façon anonymisée, comme l&apos;exige la loi. C&apos;est irréversible.
        </p>
      </div>
    </div>
  );
}
