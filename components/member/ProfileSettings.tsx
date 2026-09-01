"use client";

import { useState } from "react";
import { updateMemberProfile } from "@/app/compte/actions";

// ADR 0047 — « Mon profil » : prénom, zones et date de naissance vivent ICI,
// plus jamais dans le tunnel d'inscription. Chaque champ dit à quoi il sert —
// tout est facultatif.

const inputCls =
  "w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-red text-gray-900";

function ageFrom(dateStr: string): number | null {
  if (!dateStr) return null;
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return null;
  const now = new Date();
  let age = now.getFullYear() - d.getFullYear();
  const m = now.getMonth() - d.getMonth();
  if (m < 0 || (m === 0 && now.getDate() < d.getDate())) age--;
  return age;
}

export type ProfileInitial = {
  display_name: string;
  zones: string[];
  birth_date: string;
  parental_email: string;
};

export function ProfileSettings({ initial }: { initial: ProfileInitial }) {
  const [displayName, setDisplayName] = useState(initial.display_name);
  const [zoneHome, setZoneHome] = useState(initial.zones[0] ?? "");
  const [zoneWork, setZoneWork] = useState(initial.zones[1] ?? "");
  const [zoneSchool, setZoneSchool] = useState(initial.zones[2] ?? "");
  const [birthDate, setBirthDate] = useState(initial.birth_date);
  const [parentalEmail, setParentalEmail] = useState(initial.parental_email);
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState<{ kind: "ok" | "err"; text: string } | null>(null);

  const age = ageFrom(birthDate);
  const isMinor = age !== null && age < 13;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setMsg(null);
    const fd = new FormData();
    fd.set("display_name", displayName);
    for (const z of [zoneHome, zoneWork, zoneSchool]) if (z.trim()) fd.append("zones", z);
    fd.set("birth_date", birthDate);
    if (isMinor) fd.set("parental_email", parentalEmail);
    const res = await updateMemberProfile(null, fd);
    setMsg(res.error ? { kind: "err", text: res.error } : { kind: "ok", text: res.success ?? "Enregistré." });
    setLoading(false);
  }

  return (
    <div className="bg-white rounded-2xl border border-gray-100 p-5">
      <p className="font-semibold text-gray-900 text-sm">Mon profil</p>
      <p className="text-xs text-gray-400 mt-0.5 mb-4">
        Tout est facultatif — chaque info sert à quelque chose de précis.
      </p>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Ton prénom</label>
          <input
            type="text"
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            placeholder="Ex : Karim"
            maxLength={60}
            className={inputCls}
          />
          <p className="text-xs text-gray-400 mt-1">Pour qu&apos;on t&apos;écrive autrement que « toi ».</p>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Tes zones <span className="text-gray-400 font-normal">(où tu vis, travailles, étudies)</span>
          </label>
          <div className="space-y-2">
            <input type="text" value={zoneHome} onChange={(e) => setZoneHome(e.target.value)} placeholder="Ex : Molenbeek" maxLength={40} className={inputCls} />
            <div className="grid grid-cols-2 gap-2">
              <input type="text" value={zoneWork} onChange={(e) => setZoneWork(e.target.value)} placeholder="Zone de travail" maxLength={40} className={inputCls} />
              <input type="text" value={zoneSchool} onChange={(e) => setZoneSchool(e.target.value)} placeholder="Zone d'école" maxLength={40} className={inputCls} />
            </div>
          </div>
          <p className="text-xs text-gray-400 mt-1">On te propose les équipes actives près de chez toi.</p>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Date de naissance</label>
          <input type="date" value={birthDate} onChange={(e) => setBirthDate(e.target.value)} className={inputCls} />
          <p className="text-xs text-gray-400 mt-1">🎂 De quoi te gâter le jour J.</p>
        </div>

        {isMinor && (
          <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 space-y-2">
            <p className="text-xs text-amber-800">
              Tu as moins de 13 ans : l&apos;accord d&apos;un parent est nécessaire. Indique son email —
              il recevra une demande de confirmation.
            </p>
            <input
              type="email"
              value={parentalEmail}
              onChange={(e) => setParentalEmail(e.target.value)}
              placeholder="Email d'un parent"
              className="w-full px-3 py-2 border border-amber-300 rounded-lg text-sm"
            />
          </div>
        )}

        {msg && (
          <p className={`text-sm px-4 py-3 rounded-lg ${msg.kind === "ok" ? "text-green-700 bg-green-50" : "text-red-600 bg-red-50"}`}>
            {msg.text}
          </p>
        )}

        <button
          type="submit"
          disabled={loading}
          className="w-full bg-brand-red text-white py-3 px-4 rounded-lg font-semibold hover:bg-brand-red/85 disabled:opacity-50 transition-colors"
        >
          {loading ? "Enregistrement..." : "Enregistrer"}
        </button>
      </form>
    </div>
  );
}
