"use client";

import { useState } from "react";
import type { ConsentMap } from "@/lib/consent";

type Key = "marketing" | "insights" | "zones";

export function PrivacySettings({ initial }: { initial: ConsentMap }) {
  const [state, setState] = useState({
    marketing: initial.marketing_push || initial.marketing_whatsapp,
    insights: initial.insights_commerciaux,
    zones: initial.zones,
  });
  const [saving, setSaving] = useState<Key | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  async function toggle(k: Key, value: boolean) {
    setSaving(k);
    setMsg(null);
    const consents: Record<string, boolean> = {};
    if (k === "marketing") { consents.marketing_push = value; consents.marketing_whatsapp = value; }
    if (k === "insights") consents.insights_commerciaux = value;
    if (k === "zones") consents.zones = value;

    const res = await fetch("/api/consents", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ consents }),
    });
    if (res.ok) {
      setState((s) => ({ ...s, [k]: value }));
      setMsg("Préférence enregistrée.");
    } else {
      setMsg("Erreur — réessaie.");
    }
    setSaving(null);
  }

  return (
    <div className="bg-white rounded-2xl border border-gray-100 p-5 space-y-4">
      <p className="font-semibold text-gray-900">Mes consentements</p>
      <Row
        label="Recevoir les offres de mes restaurants"
        desc="Notifications push et WhatsApp."
        checked={state.marketing}
        busy={saving === "marketing"}
        onChange={(v) => toggle("marketing", v)}
      />
      <Row
        label="Statistiques anonymisées"
        desc="Autoriser l'usage de mes données anonymisées pour des statistiques."
        checked={state.insights}
        busy={saving === "insights"}
        onChange={(v) => toggle("insights", v)}
      />
      <Row
        label="Découverte d'équipes par zone"
        desc="Utiliser mes zones pour me proposer des équipes proches."
        checked={state.zones}
        busy={saving === "zones"}
        onChange={(v) => toggle("zones", v)}
      />
      {msg && <p className="text-xs text-gray-500">{msg}</p>}
    </div>
  );
}

function Row({
  label, desc, checked, busy, onChange,
}: {
  label: string; desc: string; checked: boolean; busy: boolean; onChange: (v: boolean) => void;
}) {
  return (
    <div className="flex items-start justify-between gap-3">
      <div className="min-w-0">
        <p className="text-sm font-medium text-gray-800">{label}</p>
        <p className="text-xs text-gray-500">{desc}</p>
      </div>
      <button
        type="button"
        onClick={() => onChange(!checked)}
        disabled={busy}
        aria-pressed={checked}
        aria-label={label}
        className={`relative w-11 h-6 rounded-full transition-colors shrink-0 ${checked ? "bg-brand-red" : "bg-gray-300"} disabled:opacity-50`}
      >
        <span className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${checked ? "translate-x-5" : ""}`} />
      </button>
    </div>
  );
}
