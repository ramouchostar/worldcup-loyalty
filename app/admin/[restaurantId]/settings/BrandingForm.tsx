"use client";

import { useState } from "react";
import { updateRestaurantBranding } from "./actions";
import { BRAND_DEFAULTS } from "@/lib/branding";

type Initial = {
  brand_primary: string;
  brand_dark: string;
  brand_accent: string;
  logo_url: string | null; // URL publique (déjà résolue) ou null
};

const COLORS: { field: "brand_primary" | "brand_dark" | "brand_accent"; label: string; help: string; def: string }[] = [
  { field: "brand_primary", label: "Couleur principale", help: "Boutons, liens, éléments d'action", def: BRAND_DEFAULTS.primary },
  { field: "brand_dark", label: "Couleur foncée", help: "En-têtes et fonds sombres", def: BRAND_DEFAULTS.dark },
  { field: "brand_accent", label: "Couleur accent", help: "Badges et mises en avant", def: BRAND_DEFAULTS.accent },
];

export function BrandingForm({ restaurantId, initial }: { restaurantId: string; initial: Initial }) {
  const [colors, setColors] = useState({
    brand_primary: initial.brand_primary,
    brand_dark: initial.brand_dark,
    brand_accent: initial.brand_accent,
  });
  const [logoPreview, setLogoPreview] = useState<string | null>(initial.logo_url);
  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [removeLogo, setRemoveLogo] = useState(false);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<{ kind: "error" | "success"; text: string } | null>(null);

  const eff = (field: keyof typeof colors, def: string) => colors[field] || def;

  function setColor(field: keyof typeof colors, value: string) {
    setColors((c) => ({ ...c, [field]: value }));
  }

  function onLogoChange(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0] ?? null;
    setLogoFile(f);
    setRemoveLogo(false);
    if (f) setLogoPreview(URL.createObjectURL(f));
  }

  function clearLogo() {
    setLogoFile(null);
    setLogoPreview(null);
    setRemoveLogo(true);
  }

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    setMessage(null);
    const fd = new FormData();
    fd.set("brand_primary", colors.brand_primary);
    fd.set("brand_dark", colors.brand_dark);
    fd.set("brand_accent", colors.brand_accent);
    if (logoFile) fd.set("logo", logoFile);
    if (removeLogo) fd.set("remove_logo", "true");
    const result = await updateRestaurantBranding(restaurantId, null, fd);
    setLoading(false);
    if (result.error) setMessage({ kind: "error", text: result.error });
    if (result.success) setMessage({ kind: "success", text: result.success });
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      <div className="bg-white rounded-2xl border border-gray-100 p-5 space-y-5">
        <div>
          <h2 className="font-bold text-gray-900">Charte graphique</h2>
          <p className="text-xs text-gray-400 mt-0.5">
            Ton logo et tes couleurs s&apos;appliquent à ta page membre, à ta console et à tes QR codes.
            Laisse une couleur vide pour garder le style par défaut.
          </p>
        </div>

        {/* Logo */}
        <div>
          <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Logo</label>
          <div className="flex items-center gap-4">
            <div className="w-16 h-16 rounded-xl border border-gray-200 bg-gray-50 flex items-center justify-center overflow-hidden shrink-0">
              {logoPreview ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={logoPreview} alt="Logo" className="w-full h-full object-contain" />
              ) : (
                <span className="text-gray-300 text-2xl">🏪</span>
              )}
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="cursor-pointer bg-gray-100 hover:bg-gray-200 text-gray-700 text-sm font-medium px-3 py-1.5 rounded-lg inline-block w-fit transition-colors">
                {logoPreview ? "Changer" : "Ajouter un logo"}
                <input type="file" accept="image/png,image/jpeg,image/webp,image/svg+xml" onChange={onLogoChange} className="hidden" />
              </label>
              {logoPreview && (
                <button type="button" onClick={clearLogo} className="text-xs text-red-500 hover:underline w-fit">
                  Retirer le logo
                </button>
              )}
              <p className="text-xs text-gray-400">PNG, JPG, WebP ou SVG — 2 Mo max.</p>
            </div>
          </div>
        </div>

        {/* Couleurs */}
        <div className="space-y-3">
          {COLORS.map(({ field, label, help, def }) => (
            <div key={field} className="flex items-center gap-3">
              <input
                type="color"
                value={eff(field, def)}
                onChange={(e) => setColor(field, e.target.value.toUpperCase())}
                className="w-10 h-10 rounded-lg border border-gray-200 cursor-pointer shrink-0 bg-white"
                aria-label={label}
              />
              <div className="flex-1 min-w-0">
                <label className="block text-sm font-medium text-gray-800">{label}</label>
                <p className="text-xs text-gray-400">{help}</p>
              </div>
              <input
                type="text"
                value={colors[field]}
                onChange={(e) => setColor(field, e.target.value)}
                placeholder={def}
                className="w-28 border border-gray-300 rounded-lg px-2 py-1.5 text-sm font-mono uppercase"
              />
              {colors[field] && (
                <button type="button" onClick={() => setColor(field, "")} className="text-gray-300 hover:text-red-500 text-lg leading-none" aria-label="Réinitialiser">
                  ×
                </button>
              )}
            </div>
          ))}
        </div>

        {/* Aperçu live */}
        <div>
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Aperçu</p>
          <div className="rounded-xl overflow-hidden border border-gray-200">
            <div className="px-4 py-3 flex items-center gap-2" style={{ backgroundColor: eff("brand_dark", BRAND_DEFAULTS.dark) }}>
              {logoPreview ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={logoPreview} alt="" className="w-6 h-6 object-contain" />
              ) : null}
              <span className="text-white font-bold text-sm">{/* nom resto */}Ton établissement</span>
            </div>
            <div className="p-4 bg-white flex items-center gap-3">
              <button type="button" className="text-white text-sm font-semibold px-4 py-2 rounded-lg" style={{ backgroundColor: eff("brand_primary", BRAND_DEFAULTS.primary) }}>
                Rejoindre
              </button>
              <span className="text-xs font-bold px-2 py-1 rounded-full text-white" style={{ backgroundColor: eff("brand_accent", BRAND_DEFAULTS.accent) }}>
                Nouveau
              </span>
            </div>
          </div>
        </div>
      </div>

      {message && (
        <p className={`text-sm ${message.kind === "error" ? "text-red-600" : "text-green-700"}`}>{message.text}</p>
      )}

      <button
        type="submit"
        disabled={loading}
        className="w-full bg-brand-red text-white py-3 rounded-xl font-semibold hover:bg-red-700 disabled:opacity-50 transition-colors"
      >
        {loading ? "Enregistrement..." : "Enregistrer la charte"}
      </button>
    </form>
  );
}
