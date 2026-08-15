"use client";

import { useEffect, useRef, useState } from "react";
import { updateRestaurantBranding, detectRestaurantDesign } from "./actions";
import { BRAND_DEFAULTS, FONT_OPTIONS } from "@/lib/branding";

type Initial = {
  brand_primary: string;
  brand_dark: string;
  brand_accent: string;
  brand_font: string;
  logo_url: string | null; // URL publique (déjà résolue) ou null
  hero_image_url: string | null; // idem
};

const COLORS: { field: "brand_primary" | "brand_dark" | "brand_accent"; label: string; help: string; def: string }[] = [
  { field: "brand_primary", label: "Couleur principale", help: "Boutons, liens, éléments d'action", def: BRAND_DEFAULTS.primary },
  { field: "brand_dark", label: "Couleur foncée", help: "En-têtes et fonds sombres", def: BRAND_DEFAULTS.dark },
  { field: "brand_accent", label: "Couleur accent", help: "Badges et mises en avant", def: BRAND_DEFAULTS.accent },
];

export function BrandingForm({
  restaurantId,
  initial,
  websiteUrl,
}: {
  restaurantId: string;
  initial: Initial;
  websiteUrl: string | null;
}) {
  const [colors, setColors] = useState({
    brand_primary: initial.brand_primary,
    brand_dark: initial.brand_dark,
    brand_accent: initial.brand_accent,
  });
  const [font, setFont] = useState(initial.brand_font);
  const [logoPreview, setLogoPreview] = useState<string | null>(initial.logo_url);
  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [removeLogo, setRemoveLogo] = useState(false);
  const [heroPreview, setHeroPreview] = useState<string | null>(initial.hero_image_url);
  const [heroFile, setHeroFile] = useState<File | null>(null);
  const [removeHero, setRemoveHero] = useState(false);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<{ kind: "error" | "success"; text: string } | null>(null);
  const [detecting, setDetecting] = useState(false);
  const [detectMessage, setDetectMessage] = useState<{ kind: "error" | "success"; text: string } | null>(null);
  // La détection modifie des champs situés bien plus bas que le bouton : sans
  // scroll ni surlignage, le restaurateur croit qu'il ne s'est rien passé.
  const [highlight, setHighlight] = useState(false);
  const detectedRef = useRef<HTMLDivElement>(null);
  const highlightTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => () => {
    if (highlightTimer.current) clearTimeout(highlightTimer.current);
  }, []);

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

  function onHeroChange(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0] ?? null;
    setHeroFile(f);
    setRemoveHero(false);
    if (f) setHeroPreview(URL.createObjectURL(f));
  }

  function clearHero() {
    setHeroFile(null);
    setHeroPreview(null);
    setRemoveHero(true);
  }

  async function handleDetect() {
    setDetecting(true);
    setDetectMessage(null);
    const result = await detectRestaurantDesign(restaurantId);
    setDetecting(false);
    if (result.error) {
      setDetectMessage({ kind: "error", text: result.error });
      return;
    }
    if (result.suggestion) {
      const s = result.suggestion;
      setColors({ brand_primary: s.brand_primary, brand_dark: s.brand_dark, brand_accent: s.brand_accent });
      setFont(s.brand_font);
      setDetectMessage({
        kind: "success",
        text: s.style_notes
          ? `Suggestion appliquée — ${s.style_notes}. Vérifie ci-dessous, puis enregistre.`
          : "Suggestion appliquée — vérifie ci-dessous, puis enregistre.",
      });
      detectedRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
      setHighlight(true);
      if (highlightTimer.current) clearTimeout(highlightTimer.current);
      highlightTimer.current = setTimeout(() => setHighlight(false), 3000);
    }
  }

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    setMessage(null);
    const fd = new FormData();
    fd.set("brand_primary", colors.brand_primary);
    fd.set("brand_dark", colors.brand_dark);
    fd.set("brand_accent", colors.brand_accent);
    fd.set("brand_font", font);
    if (logoFile) fd.set("logo", logoFile);
    if (removeLogo) fd.set("remove_logo", "true");
    if (heroFile) fd.set("hero", heroFile);
    if (removeHero) fd.set("remove_hero", "true");
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
            Ton logo, tes couleurs et ta police s&apos;appliquent à ta page membre, à ta console et à tes QR codes.
            Laisse un champ vide pour garder le style par défaut.
          </p>
        </div>

        {/* Détection depuis le site web */}
        <div className="bg-gray-50 rounded-xl border border-gray-100 p-3.5">
          <button
            type="button"
            onClick={handleDetect}
            disabled={!websiteUrl || detecting}
            className="w-full bg-brand-dark text-white text-sm font-semibold py-2.5 rounded-lg hover:bg-brand-dark/85 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            {detecting ? "Analyse en cours... (jusqu'à 45 secondes)" : "✨ Détecter mon design depuis mon site"}
          </button>
          <p className="text-xs text-gray-400 mt-1.5">
            {websiteUrl
              ? "Propose couleurs et police à partir de ton site (et Instagram/TikTok si renseignés) — à valider ci-dessous, rien n'est enregistré automatiquement."
              : "Ajoute le lien de ton site dans « Infos & liens » ci-dessus pour activer la détection."}
          </p>
          {detectMessage && (
            <p className={`text-sm mt-2 ${detectMessage.kind === "error" ? "text-red-600" : "text-green-700"}`}>
              {detectMessage.text}
            </p>
          )}
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

        {/* Image hero */}
        <div>
          <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
            Image hero (dashboard membre)
          </label>
          <div className="flex items-center gap-4">
            <div className="w-24 h-16 rounded-xl border border-gray-200 bg-gray-50 flex items-center justify-center overflow-hidden shrink-0">
              {heroPreview ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={heroPreview} alt="Hero" className="w-full h-full object-cover" />
              ) : (
                <span className="text-gray-300 text-xl">🖼️</span>
              )}
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="cursor-pointer bg-gray-100 hover:bg-gray-200 text-gray-700 text-sm font-medium px-3 py-1.5 rounded-lg inline-block w-fit transition-colors">
                {heroPreview ? "Changer" : "Ajouter une image"}
                <input type="file" accept="image/png,image/jpeg,image/webp,image/svg+xml" onChange={onHeroChange} className="hidden" />
              </label>
              {heroPreview && (
                <button type="button" onClick={clearHero} className="text-xs text-red-500 hover:underline w-fit">
                  Retirer l&apos;image
                </button>
              )}
              <p className="text-xs text-gray-400">En fond de la carte d&apos;accueil du dashboard membre — 2 Mo max.</p>
            </div>
          </div>
        </div>

        {/* Aperçu + réglages détectés — cible du scroll après « Détecter mon
            design » : l'aperçu en tête montre le résultat, les champs juste en
            dessous restent ajustables. */}
        <div
          ref={detectedRef}
          className={`scroll-mt-4 space-y-5 rounded-xl -m-2 p-2 transition-shadow duration-500 ${
            highlight ? "ring-2 ring-brand-red/40" : "ring-0"
          }`}
        >
          {/* Aperçu live */}
          <div>
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Aperçu</p>
            <div
              className="rounded-xl overflow-hidden border border-gray-200"
              style={{ fontFamily: FONT_OPTIONS.find((f) => f.key === font)?.cssVar }}
            >
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

          {/* Police */}
          <div>
            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Police</label>
            <div className="grid grid-cols-2 gap-2">
              {FONT_OPTIONS.map((f) => (
                <button
                  key={f.key}
                  type="button"
                  onClick={() => setFont(font === f.key ? "" : f.key)}
                  className={`text-left border rounded-lg px-3 py-2 transition-colors ${
                    font === f.key ? "border-brand-red bg-brand-red/5" : "border-gray-200 hover:border-gray-300"
                  }`}
                  style={{ fontFamily: f.cssVar }}
                >
                  <span className="text-sm font-medium text-gray-800">{f.label}</span>
                  <p className="text-xs text-gray-400" style={{ fontFamily: f.cssVar }}>
                    Ton établissement
                  </p>
                </button>
              ))}
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
        </div>
      </div>

      {message && (
        <p className={`text-sm ${message.kind === "error" ? "text-red-600" : "text-green-700"}`}>{message.text}</p>
      )}

      <button
        type="submit"
        disabled={loading}
        className="w-full bg-brand-red text-white py-3 rounded-xl font-semibold hover:bg-brand-red/85 disabled:opacity-50 transition-colors"
      >
        {loading ? "Enregistrement..." : "Enregistrer la charte"}
      </button>
    </form>
  );
}
