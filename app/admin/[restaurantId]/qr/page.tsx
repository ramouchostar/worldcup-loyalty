import { redirect } from "next/navigation";
import { notFound } from "next/navigation";
import Link from "next/link";
import QRCode from "qrcode";
import { createServerSupabaseClient } from "@/lib/supabase";
import { getRestaurant, getRestaurantBranding } from "@/lib/restaurant";
import { BRAND_DEFAULTS } from "@/lib/branding";

const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? "https://worldcup-loyalty.vercel.app";

// QR code de l'établissement — pointe vers sa landing publique /r/[slug].
// Généré côté serveur aux couleurs de la charte (ADR 0015) : PNG haute
// résolution + SVG vectoriel, et trois supports imprimables prêts à l'emploi.
export default async function AdminQrPage({ params }: { params: Promise<{ restaurantId: string }> }) {
  const { restaurantId } = await params;
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const restaurant = await getRestaurant(restaurantId);
  if (!restaurant) notFound();

  const branding = await getRestaurantBranding(restaurantId);
  const isKraainem = restaurantId === "kraainem";
  const dark = branding.brand_dark ?? BRAND_DEFAULTS.dark;
  const targetUrl = `${APP_URL}/r/${restaurantId}`;

  // Belchicken Kraainem : QR toujours noir pur sur blanc pur (règle dure du
  // design "Templates QR Belchicken"), même sur l'export brut destiné à un
  // imprimeur pro — jamais teinté à la couleur de marque.
  const qrColor = isKraainem ? "#0A0A0A" : dark;

  const [svg, pngDataUrl] = await Promise.all([
    QRCode.toString(targetUrl, {
      type: "svg",
      errorCorrectionLevel: "M",
      margin: 2,
      color: { dark: qrColor, light: "#FFFFFF" },
    }),
    QRCode.toDataURL(targetUrl, {
      errorCorrectionLevel: "M",
      width: 2048, // impression nette jusqu'au format affiche
      margin: 2,
      color: { dark: qrColor, light: "#FFFFFF" },
    }),
  ]);

  const svgDataUrl = `data:image/svg+xml;base64,${Buffer.from(svg).toString("base64")}`;

  const formats: { key: string; icon: string; label: string; desc: string }[] = isKraainem
    ? [
        { key: "sticker", icon: "🍽️", label: "Sticker vitrine", desc: "80 × 80 mm — vitrine & caisse" },
        { key: "flyer", icon: "🛍️", label: "Flyer à emporter", desc: "A5 · 148 × 210 mm — à glisser dans les sacs" },
        { key: "affiche", icon: "🧾", label: "Affiche murale", desc: "A3 · 297 × 420 mm — mur & entrée" },
      ]
    : [
        { key: "a6", icon: "🍽️", label: "Sticker de table", desc: "A6 · 105 × 148 mm — à coller sur les tables" },
        { key: "flyer", icon: "🛍️", label: "Flyer à emporter", desc: "A5 · 148 × 210 mm — à glisser dans les sacs" },
        { key: "a4", icon: "🧾", label: "Affiche caisse", desc: "A4 · 210 × 297 mm — à afficher au comptoir" },
      ];

  return (
    <div className="space-y-6 max-w-lg">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">QR code de {restaurant.name}</h1>
        <p className="text-gray-500 text-sm mt-1">
          Un client qui le scanne arrive sur ta page, s&apos;inscrit et rejoint ta
          communauté. Choisis un support prêt-à-imprimer, ou télécharge le QR brut.
        </p>
      </div>

      {restaurant.status !== "active" && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 text-sm text-amber-900">
          ⚠️ Ton établissement n&apos;est pas encore validé : la page de destination
          restera invisible aux clients jusqu&apos;à l&apos;approbation. Tu peux préparer
          l&apos;impression, mais attends la validation avant d&apos;afficher le QR.
        </div>
      )}

      {/* Supports imprimables */}
      <div className="space-y-3">
        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Supports prêts à imprimer</p>
        <div className="grid gap-3">
          {formats.map((f) => (
            <Link
              key={f.key}
              href={`/admin/${restaurantId}/qr/print?format=${f.key}`}
              className="flex items-center gap-4 bg-white rounded-2xl border border-gray-100 p-4 hover:border-brand-gold/50 hover:shadow-sm transition-all"
            >
              <span className="text-3xl">{f.icon}</span>
              <div className="flex-1 min-w-0">
                <p className="font-semibold text-gray-900">{f.label}</p>
                <p className="text-xs text-gray-400">{f.desc}</p>
              </div>
              <span className="text-brand-red font-semibold text-sm shrink-0">Imprimer →</span>
            </Link>
          ))}
        </div>
        <p className="text-xs text-gray-400">
          🎨 Les supports reprennent ton logo et tes couleurs. Configure-les dans{" "}
          <Link href={`/admin/${restaurantId}/settings`} className="text-brand-red hover:underline">Mon établissement</Link>.
        </p>
      </div>

      {/* Aperçu + QR brut */}
      <div className="bg-white rounded-2xl border border-gray-100 p-6 flex flex-col items-center">
        <div
          className="w-56 h-56 [&>svg]:w-full [&>svg]:h-full"
          dangerouslySetInnerHTML={{ __html: svg }}
        />
        <p className="mt-4 text-xs text-gray-400 font-mono break-all text-center">{targetUrl}</p>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <a
          href={pngDataUrl}
          download={`qr-${restaurantId}.png`}
          className="bg-brand-dark text-white text-center py-3 rounded-xl font-semibold hover:opacity-90 transition-opacity"
        >
          ⬇️ PNG (2048 px)
        </a>
        <a
          href={svgDataUrl}
          download={`qr-${restaurantId}.svg`}
          className="bg-brand-dark text-white text-center py-3 rounded-xl font-semibold hover:opacity-90 transition-opacity"
        >
          ⬇️ SVG (imprimeur)
        </a>
      </div>

      <div className="bg-gray-50 rounded-xl p-4 text-xs text-gray-500 space-y-1">
        <p>💡 Pour les supports, imprime avec les marges « Aucune » et les couleurs d&apos;arrière-plan activées.</p>
        <p>💡 Le SVG est vectoriel : c&apos;est le format à donner à un imprimeur professionnel.</p>
        <p>💡 Teste toujours le QR imprimé avec ton téléphone avant de le distribuer.</p>
      </div>
    </div>
  );
}
