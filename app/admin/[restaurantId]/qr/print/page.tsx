import { redirect, notFound } from "next/navigation";
import QRCode from "qrcode";
import { createServerSupabaseClient } from "@/lib/supabase";
import { getRestaurant, getRestaurantBranding, logoPublicUrl } from "@/lib/restaurant";
import { BRAND_DEFAULTS, brandStyle, hexToRgbChannels } from "@/lib/branding";
import { PrintButton } from "./PrintButton";
import { KraainemPrintSheet, type KraainemFormat } from "./kraainem-sheet";

const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? "https://worldcup-loyalty.vercel.app";

// Belchicken Kraainem a sa propre identité imprimée (design Claude "Templates
// QR Belchicken" — fond clair, cadre accent, copy bilingue FR/NL) : variante
// spéciale à cet établissement, le template générique ci-dessous reste
// inchangé pour tous les autres restos.
const KRAAINEM_ID = "kraainem";
const KRAAINEM_FORMATS = {
  sticker: { label: "Sticker vitrine (80×80mm)", page: "80mm 80mm" },
  flyer: { label: "Flyer à emporter (A5)", page: "148mm 210mm" },
  affiche: { label: "Affiche murale (A3)", page: "297mm 420mm" },
} as const;

// Trois supports imprimables, aux dimensions physiques exactes (@page).
// heroHeight : bande photo en bleed (m48 hero_image_url) — absente sur le
// sticker de table (a6), trop petit pour rester lisible avec une photo.
const FORMATS = {
  a6: {
    label: "Sticker de table (A6)",
    page: "105mm 148mm",
    w: "105mm", h: "148mm",
    qr: "62mm",
    heroHeight: null,
    title: "Scanne pour gagner",
    sub: "Cumule des récompenses à chaque commande.",
  },
  flyer: {
    label: "Flyer à emporter (A5)",
    page: "148mm 210mm",
    w: "148mm", h: "210mm",
    qr: "78mm",
    heroHeight: "55mm",
    title: "Scanne, rejoins, et gagne à chaque commande",
    sub: "Rejoins la communauté et débloque des récompenses au fil de tes commandes.",
  },
  a4: {
    label: "Affiche caisse (A4)",
    page: "210mm 297mm",
    w: "210mm", h: "297mm",
    qr: "130mm",
    heroHeight: "90mm",
    title: "Chaque commande te rapproche d'un cadeau",
    sub: "Scanne le code, rejoins la communauté, et fais progresser ton équipe vers de nouvelles récompenses.",
  },
} as const;

type FormatKey = keyof typeof FORMATS;

// Barre d'action écran uniquement (retour, libellé du format, bouton
// imprimer) — identique pour le template Kraainem et le template générique.
function ActionBar({ restaurantId, label }: { restaurantId: string; label: string }) {
  return (
    <>
      <div className="no-print sticky top-0 z-10 bg-white border-b border-gray-200 px-4 py-3 flex items-center justify-between gap-3">
        <a href={`/admin/${restaurantId}/qr`} className="text-sm text-gray-500 hover:text-gray-800">← Retour</a>
        <span className="text-sm font-medium text-gray-700">{label}</span>
        <PrintButton />
      </div>
      <div className="no-print text-center text-xs text-gray-400 mt-3 px-4">
        Astuce : dans la fenêtre d&apos;impression, choisis « Enregistrer au format PDF », marges « Aucune »,
        et coche « Graphiques d&apos;arrière-plan » pour garder les couleurs.
      </div>
    </>
  );
}

function printStyles(pageSize: string) {
  return `
    @page { size: ${pageSize}; margin: 0; }
    html, body { background: #f3f4f6; }
    /* Sans ça, Chrome/Safari n'impriment pas les couleurs/images de fond
       tant que l'utilisateur n'a pas coché "Graphiques d'arrière-plan" —
       la bande photo hero et son dégradé de lisibilité disparaissaient
       silencieusement, laissant le texte blanc sur fond blanc. */
    .print-sheet, .print-sheet * {
      -webkit-print-color-adjust: exact !important;
      print-color-adjust: exact !important;
    }
    @media print {
      html, body { margin: 0 !important; background: #fff !important; }
      .no-print { display: none !important; }
      /* N'imprimer QUE la feuille — masque le chrome admin (header, nav). */
      body { visibility: hidden !important; }
      .print-sheet { visibility: visible !important; position: absolute !important;
        top: 0 !important; left: 0 !important; margin: 0 !important; box-shadow: none !important; }
      .print-sheet * { visibility: visible !important; }
    }
  `;
}

export default async function QrPrintPage({
  params,
  searchParams,
}: {
  params: Promise<{ restaurantId: string }>;
  searchParams: Promise<{ format?: string }>;
}) {
  const { restaurantId } = await params;
  const { format } = await searchParams;
  const isKraainem = restaurantId === KRAAINEM_ID;

  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const restaurant = await getRestaurant(restaurantId);
  if (!restaurant) notFound();
  const branding = await getRestaurantBranding(restaurantId);
  const targetUrl = `${APP_URL}/r/${restaurantId}`;

  if (isKraainem) {
    const fmt = (format && format in KRAAINEM_FORMATS ? format : "sticker") as KraainemFormat;
    const spec = KRAAINEM_FORMATS[fmt];
    const accent = branding.brand_accent ?? BRAND_DEFAULTS.accent;
    const logo = logoPublicUrl(branding.logo_url);
    const urlLabel = targetUrl.replace(/^https?:\/\//, "");

    // Règle dure de la maquette : QR toujours noir pur sur blanc pur, jamais
    // teinté à la couleur de marque, correction d'erreur niveau H.
    const qrSvg = await QRCode.toString(targetUrl, {
      type: "svg",
      errorCorrectionLevel: "H",
      margin: 0,
      color: { dark: "#0A0A0A", light: "#FFFFFF" },
    });

    return (
      <>
        <style dangerouslySetInnerHTML={{ __html: printStyles(spec.page) }} />
        <ActionBar restaurantId={restaurantId} label={spec.label} />
        <div className="flex justify-center py-8 px-4">
          <div className="shadow-xl">
            <KraainemPrintSheet
              fmt={fmt}
              restaurantName={restaurant.name}
              accent={accent}
              logo={logo}
              qrSvg={qrSvg}
              urlLabel={urlLabel}
            />
          </div>
        </div>
      </>
    );
  }

  const fmt = (format && format in FORMATS ? format : "a6") as FormatKey;
  const spec = FORMATS[fmt];

  const primary = branding.brand_primary ?? BRAND_DEFAULTS.primary;
  const dark = branding.brand_dark ?? BRAND_DEFAULTS.dark;
  const accent = branding.brand_accent ?? BRAND_DEFAULTS.accent;
  const logo = logoPublicUrl(branding.logo_url);
  const hero = spec.heroHeight ? logoPublicUrl(branding.hero_image_url) : null;
  const darkChannels = hexToRgbChannels(dark) ?? "12 21 9";
  const accentChannels = hexToRgbChannels(accent) ?? "169 187 110";

  // QR vectoriel aux couleurs de la charte (module = couleur foncée du resto).
  const qrSvg = await QRCode.toString(targetUrl, {
    type: "svg",
    errorCorrectionLevel: "M",
    margin: 1,
    color: { dark, light: "#FFFFFF" },
  });

  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: printStyles(spec.page) }} />
      <ActionBar restaurantId={restaurantId} label={spec.label} />

      {/* Feuille au format exact — fond plein cadre (couleur foncée de la
          charte) plutôt qu'un fond blanc : évite les grands vides neutres et
          fait ressortir le badge titre + le QR (retour restaurateur). */}
      <div className="flex justify-center py-8 px-4">
        <div
          className="print-sheet shadow-xl"
          style={{
            ...brandStyle(branding),
            background: dark,
            width: spec.w,
            height: spec.h,
            padding: "10mm",
            boxSizing: "border-box",
            fontFamily: "var(--brand-font)",
            position: "relative",
            overflow: "hidden",
          }}
        >
          {/* Texture confetti — casse l'aplat de couleur, inspirée des écrans
              de jeu instantané (points/cadeaux) plutôt qu'un fond neutre.
              z-index 0 : sous le contenu réel, visible seulement dans les
              zones transparentes entre les éléments. */}
          <div
            style={{
              position: "absolute",
              inset: 0,
              zIndex: 0,
              backgroundImage: `radial-gradient(circle, rgba(${accentChannels}, 0.4) 1.4mm, transparent 1.5mm)`,
              backgroundSize: "13mm 13mm",
              pointerEvents: "none",
            }}
          />

          {/* Cadeaux décoratifs dans les coins — clin d'œil ludique (A4 uniquement, assez de place) */}
          {fmt === "a4" && (
            <>
              <div style={{ position: "absolute", zIndex: 0, top: "8mm", left: "8mm", fontSize: "40px", transform: "rotate(-18deg)", opacity: 0.9 }}>🎁</div>
              <div style={{ position: "absolute", zIndex: 0, top: "8mm", right: "8mm", fontSize: "40px", transform: "rotate(18deg)", opacity: 0.9 }}>🎁</div>
            </>
          )}

          {/* Contenu réel — au-dessus de la texture/des cadeaux décoratifs */}
          <div
            className="flex flex-col items-center text-center"
            style={{ position: "relative", zIndex: 1, width: "100%", height: "100%", justifyContent: "space-between" }}
          >

          {/* En-tête : bande photo hero (m48) en bleed si dispo, sinon logo + nom sur le fond foncé */}
          {hero ? (
            <div
              style={{
                margin: "-10mm -10mm 0 -10mm",
                width: "calc(100% + 20mm)",
                height: spec.heroHeight!,
                flexShrink: 0,
                backgroundImage: `linear-gradient(to bottom, rgba(${darkChannels}, 0.05) 45%, rgba(${darkChannels}, 1) 96%), url(${hero})`,
                backgroundSize: "cover",
                backgroundPosition: "center",
                display: "flex",
                alignItems: "flex-end",
                justifyContent: "center",
                padding: "5mm",
                boxSizing: "border-box",
              }}
            >
              <div className="flex items-center gap-2">
                {logo ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={logo} alt="" style={{ height: "12mm", objectFit: "contain", filter: "drop-shadow(0 1px 3px rgba(0,0,0,.5))" }} />
                ) : null}
                <div
                  style={{
                    color: "#fff",
                    fontWeight: 800,
                    fontSize: fmt === "a4" ? "30px" : "20px",
                    lineHeight: 1.1,
                    textShadow: "0 1px 4px rgba(0,0,0,.5)",
                  }}
                >
                  {restaurant.name}
                </div>
              </div>
            </div>
          ) : (
            <div className="flex flex-col items-center gap-2" style={{ marginTop: "8mm" }}>
              {logo ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={logo} alt="" style={{ height: fmt === "a4" ? "24mm" : "18mm", objectFit: "contain", filter: "drop-shadow(0 1px 3px rgba(0,0,0,.4))" }} />
              ) : null}
              <div style={{ color: "#fff", fontWeight: 800, fontSize: fmt === "a4" ? "40px" : "20px", lineHeight: 1.1 }}>
                {restaurant.name}
              </div>
            </div>
          )}

          {/* Titre accroche — badge plein de couleur primaire + emoji cadeau, pas juste du texte coloré */}
          <div
            style={{
              background: primary,
              color: "#fff",
              fontWeight: 800,
              fontSize: fmt === "a4" ? "38px" : fmt === "flyer" ? "24px" : "19px",
              lineHeight: 1.15,
              borderRadius: "999px",
              padding: fmt === "a4" ? "7mm 12mm" : "5mm 8mm",
              marginTop: fmt === "a4" ? "6mm" : "10mm",
              boxShadow: "0 2mm 4mm rgba(0,0,0,.18)",
              transform: fmt === "a4" ? "rotate(-2deg)" : undefined,
            }}
          >
            🎁 {spec.title}
          </div>

          {/* QR encadré — anneau pointillé couleur primaire en plus du cadre
              plein accent, pour un effet "sticker" ludique (retour restaurateur) */}
          <div
            style={{
              border: `2px dashed ${primary}`,
              borderRadius: "9mm",
              padding: "3mm",
              marginTop: fmt === "a4" ? "6mm" : "10mm",
            }}
          >
            <div style={{ border: `3px solid ${accent}`, borderRadius: "6mm", padding: "4mm", background: "#fff" }}>
              <div
                style={{ width: spec.qr, height: spec.qr }}
                className="[&>svg]:w-full [&>svg]:h-full [&>svg]:block"
                dangerouslySetInnerHTML={{ __html: qrSvg }}
              />
            </div>
          </div>

          {/* Sous-texte + signature — texte clair sur le fond foncé */}
          <div className="flex flex-col items-center gap-1" style={{ color: "#fff", marginTop: fmt === "a4" ? "6mm" : "10mm" }}>
            <p style={{ fontSize: fmt === "a4" ? "18px" : "12px", maxWidth: "80%", opacity: 0.9 }}>{spec.sub}</p>
            <p style={{ fontSize: fmt === "a4" ? "14px" : "9px", opacity: 0.6, letterSpacing: "0.02em" }}>
              Propulsé par Boosteats
            </p>
          </div>
          </div>

          {/* Liseré accent en pied de page — touche finale, cadre le support (au-dessus de tout) */}
          <div style={{ position: "absolute", zIndex: 2, left: 0, right: 0, bottom: 0, height: "3mm", background: accent }} />
        </div>
      </div>
    </>
  );
}
