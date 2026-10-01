"use client";

import { useState, useTransition } from "react";
import { setEmailSequence } from "@/app/compte/actions";

// ADR 0063 §2 — « Mes e-mails » : là où mène « Gérer mes e-mails » en pied de
// chaque e-mail. Avant, ce lien arrivait sur une page dont la seule action
// forte était « Supprimer mon compte » : on veut moins d'e-mails, on part.

const SEQUENCES: { key: string; label: string; desc: string }[] = [
  { key: "first_ticket", label: "Rappels du premier ticket", desc: "Tant que tu n'as envoyé aucun ticket." },
  { key: "install_app", label: "Installer l'app", desc: "Deux rappels au plus." },
  { key: "team_invite", label: "Rejoindre une équipe", desc: "Une fois par semestre au plus." },
  { key: "referral_nudge", label: "Inviter tes amis", desc: "Le lendemain d'un cadeau récupéré." },
];

export function EmailSettings({ optedOut, available }: { optedOut: string[]; available: boolean }) {
  const [off, setOff] = useState(() => new Set(optedOut));
  const [pending, startTransition] = useTransition();
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  function toggle(key: string, enabled: boolean) {
    setBusy(key);
    setMsg(null);
    startTransition(async () => {
      const { ok } = await setEmailSequence(key, enabled);
      if (ok) {
        setOff((s) => {
          const next = new Set(s);
          if (enabled) next.delete(key);
          else next.add(key);
          return next;
        });
        setMsg("Préférence enregistrée.");
      } else {
        setMsg("Erreur — réessaie.");
      }
      setBusy(null);
    });
  }

  return (
    <div id="emails" className="bg-white rounded-2xl border border-gray-100 p-5 space-y-4 scroll-mt-4">
      <div>
        <p className="font-semibold text-gray-900">Mes e-mails</p>
        <p className="text-xs text-gray-500 mt-1">
          Coupe les rappels dont tu ne veux pas. Tu restes membre et tu gardes tes points.
        </p>
      </div>
      {SEQUENCES.map((s) => {
        const checked = !off.has(s.key);
        return (
          <div key={s.key} className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-sm font-medium text-gray-800">{s.label}</p>
              <p className="text-xs text-gray-500">{s.desc}</p>
            </div>
            <button
              type="button"
              onClick={() => toggle(s.key, !checked)}
              disabled={!available || (pending && busy === s.key)}
              aria-pressed={checked}
              aria-label={s.label}
              className={`relative w-11 h-6 rounded-full transition-colors shrink-0 ${checked ? "bg-brand-red" : "bg-gray-300"} disabled:opacity-50`}
            >
              <span className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${checked ? "translate-x-5" : ""}`} />
            </button>
          </div>
        );
      })}
      <p className="text-xs text-gray-500">
        Les e-mails sur tes cadeaux (cadeau prêt, cadeau qui expire) continuent : ils font partie du programme.
      </p>
      {!available && <p className="text-xs text-gray-500">Réglage momentanément indisponible — réessaie plus tard.</p>}
      {msg && <p className="text-xs text-gray-500">{msg}</p>}
    </div>
  );
}
