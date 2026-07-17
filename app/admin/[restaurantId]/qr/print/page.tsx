import { redirect, notFound } from "next/navigation";
import QRCode from "qrcode";
import { createServerSupabaseClient } from "@/lib/supabase";
import { getRestaurant, getRestaurantBranding, logoPublicUrl } from "@/lib/restaurant";
import { BRAND_DEFAULTS } from "@/lib/branding";
import { PrintButton } from "./PrintButton";

const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? "https://worldcup-loyalty.vercel.app";

// Trois supports imprimables, aux dimensions physiques exactes (@page).
const FORMATS = {
  a6: {
    label: "Sticker de table (A6)",
    page: "105mm 148mm",
    w: "105mm", h: "148mm",
    qr: "62mm",
    title: "Scanne pour rejoindre",
    sub: "Gagne des cadeaux à chaque commande.",
  },
  flyer: {
    label: "Flyer à emporter (A5)",
    page: "148mm 210mm",
    w: "148mm", h: "210mm",
    qr: "80mm",
    title: "Scanne à la maison",
    sub: "Rejoins la communauté et cumule des récompenses sur tes prochaines commandes.",
  },
  a4: {
    label: "Affiche caisse (A4)",
    page: "210mm 297mm",
    w: "210mm", h: "297mm",
    qr: "120mm",
    title: "Scanne & rejoins-nous",
    sub: "Gagne des cadeaux à chaque commande, fais progresser ton équipe.",
  },
} as const;

type FormatKey = keyof typeof FORMATS;

export default async function QrPrintPage({
  params,
  searchParams,
}: {
  params: Promise<{ restaurantId: string }>;
  searchParams: Promise<{ format?: string }>;
}) {
  const { restaurantId } = await params;
  const { format } = await searchParams;
  const fmt = (format && format in FORMATS ? format : "a6") as FormatKey;
  const spec = FORMATS[fmt];

  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const restaurant = await getRestaurant(restaurantId);
  if (!restaurant) notFound();
  const branding = await getRestaurantBranding(restaurantId);

  const primary = branding.brand_primary ?? BRAND_DEFAULTS.primary;
  const dark = branding.brand_dark ?? BRAND_DEFAULTS.dark;
  const accent = branding.brand_accent ?? BRAND_DEFAULTS.accent;
  const logo = logoPublicUrl(branding.logo_url);
  const targetUrl = `${APP_URL}/r/${restaurantId}`;

  // QR vectoriel aux couleurs de la charte (module = couleur foncée du resto).
  const qrSvg = await QRCode.toString(targetUrl, {
    type: "svg",
    errorCorrectionLevel: "M",
    margin: 1,
    color: { dark, light: "#FFFFFF" },
  });

  return (
    <>
      <style
        // contenu dynamique (@page selon le format) → dangerouslySetInnerHTML
        // pour éviter que React ne diffe le texte CSS à l'hydratation (err #329)
        dangerouslySetInnerHTML={{
          __html: `
        @page { size: ${spec.page}; margin: 0; }
        html, body { background: #f3f4f6; }
        @media print {
          html, body { margin: 0 !important; background: #fff !important; }
          .no-print { display: none !important; }
          /* N'imprimer QUE la feuille — masque le chrome admin (header, nav). */
          body { visibility: hidden !important; }
          .print-sheet { visibility: visible !important; position: absolute !important;
            top: 0 !important; left: 0 !important; margin: 0 !important; box-shadow: none !important; }
          .print-sheet * { visibility: visible !important; }
        }
      `,
        }}
      />

      {/* Barre d'action — écran uniquement */}
      <div className="no-print sticky top-0 z-10 bg-white border-b border-gray-200 px-4 py-3 flex items-center justify-between gap-3">
        <a href={`/admin/${restaurantId}/qr`} className="text-sm text-gray-500 hover:text-gray-800">← Retour</a>
        <span className="text-sm font-medium text-gray-700">{spec.label}</span>
        <PrintButton />
      </div>

      <div className="no-print text-center text-xs text-gray-400 mt-3 px-4">
        Astuce : dans la fenêtre d&apos;impression, choisis « Enregistrer au format PDF », marges « Aucune »,
        et coche « Graphiques d&apos;arrière-plan » pour garder les couleurs.
      </div>

      {/* Feuille au format exact */}
      <div className="flex justify-center py-8 px-4">
        <div
          className="print-sheet bg-white shadow-xl flex flex-col items-center text-center"
          style={{
            width: spec.w,
            height: spec.h,
            padding: "10mm",
            boxSizing: "border-box",
            justifyContent: "space-between",
          }}
        >
          {/* En-tête : logo + nom */}
          <div className="flex flex-col items-center gap-2" style={{ color: dark }}>
            {logo ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={logo} alt="" style={{ height: "16mm", objectFit: "contain" }} />
            ) : null}
            <div style={{ fontWeight: 800, fontSize: fmt === "a4" ? "34px" : "20px", lineHeight: 1.1 }}>
              {restaurant.name}
            </div>
          </div>

          {/* Titre accroche */}
          <div style={{ color: primary, fontWeight: 800, fontSize: fmt === "a4" ? "40px" : fmt === "flyer" ? "28px" : "22px", lineHeight: 1.1 }}>
            {spec.title}
          </div>

          {/* QR encadré */}
          <div style={{ border: `3px solid ${accent}`, borderRadius: "6mm", padding: "4mm", background: "#fff" }}>
            <div
              style={{ width: spec.qr, height: spec.qr }}
              className="[&>svg]:w-full [&>svg]:h-full [&>svg]:block"
              dangerouslySetInnerHTML={{ __html: qrSvg }}
            />
          </div>

          {/* Sous-texte + URL */}
          <div className="flex flex-col items-center gap-1" style={{ color: dark }}>
            <p style={{ fontSize: fmt === "a4" ? "18px" : "12px", maxWidth: "80%", opacity: 0.85 }}>{spec.sub}</p>
            <p style={{ fontFamily: "monospace", fontSize: fmt === "a4" ? "14px" : "9px", opacity: 0.5 }}>
              {targetUrl.replace(/^https?:\/\//, "")}
            </p>
          </div>
        </div>
      </div>
    </>
  );
}
