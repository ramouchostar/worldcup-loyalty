import { redirect } from "next/navigation";
import { notFound } from "next/navigation";
import QRCode from "qrcode";
import { createServerSupabaseClient } from "@/lib/supabase";
import { getRestaurant } from "@/lib/restaurant";

const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? "https://worldcup-loyalty.vercel.app";

// QR code de l'établissement — pointe vers sa landing publique /r/[slug]
// (le flux « arrivée via QR code » y ramène le client après inscription).
// Généré côté serveur : PNG haute résolution pour l'impression, SVG pour
// les supports vectoriels (imprimeur, vitrophanie).
export default async function AdminQrPage({ params }: { params: Promise<{ restaurantId: string }> }) {
  const { restaurantId } = await params;
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const restaurant = await getRestaurant(restaurantId);
  if (!restaurant) notFound();

  const targetUrl = `${APP_URL}/r/${restaurantId}`;

  const [svg, pngDataUrl] = await Promise.all([
    QRCode.toString(targetUrl, {
      type: "svg",
      errorCorrectionLevel: "M",
      margin: 2,
      color: { dark: "#1A1A2E", light: "#FFFFFF" },
    }),
    QRCode.toDataURL(targetUrl, {
      errorCorrectionLevel: "M",
      width: 2048, // impression nette jusqu'au format affiche
      margin: 2,
      color: { dark: "#1A1A2E", light: "#FFFFFF" },
    }),
  ]);

  const svgDataUrl = `data:image/svg+xml;base64,${Buffer.from(svg).toString("base64")}`;

  return (
    <div className="space-y-6 max-w-lg">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">QR code de {restaurant.name}</h1>
        <p className="text-gray-500 text-sm mt-1">
          À imprimer sur les tables, le comptoir ou la vitrine. Un client qui le
          scanne arrive sur ta page, s&apos;inscrit et rejoint ta communauté.
        </p>
      </div>

      {restaurant.status !== "active" && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 text-sm text-amber-900">
          ⚠️ Ton établissement n&apos;est pas encore validé : la page de destination
          restera invisible aux clients jusqu&apos;à l&apos;approbation. Tu peux préparer
          l&apos;impression, mais attends la validation avant d&apos;afficher le QR.
        </div>
      )}

      {/* Aperçu */}
      <div className="bg-white rounded-2xl border border-gray-100 p-6 flex flex-col items-center">
        <div
          className="w-64 h-64 [&>svg]:w-full [&>svg]:h-full"
          // SVG généré serveur par la lib qrcode à partir de notre URL — contenu maîtrisé
          dangerouslySetInnerHTML={{ __html: svg }}
        />
        <p className="mt-4 text-xs text-gray-400 font-mono break-all text-center">{targetUrl}</p>
      </div>

      {/* Téléchargements */}
      <div className="grid grid-cols-2 gap-3">
        <a
          href={pngDataUrl}
          download={`qr-${restaurantId}.png`}
          className="bg-brand-red text-white text-center py-3 rounded-xl font-semibold hover:bg-red-700 transition-colors"
        >
          ⬇️ PNG (impression)
        </a>
        <a
          href={svgDataUrl}
          download={`qr-${restaurantId}.svg`}
          className="bg-brand-dark text-white text-center py-3 rounded-xl font-semibold hover:bg-gray-800 transition-colors"
        >
          ⬇️ SVG (imprimeur)
        </a>
      </div>

      <div className="bg-gray-50 rounded-xl p-4 text-xs text-gray-500 space-y-1">
        <p>💡 Le PNG fait 2048 px de côté — net jusqu&apos;au format A3.</p>
        <p>
          💡 Le SVG est vectoriel : c&apos;est le format à donner à un imprimeur ou
          pour une vitrophanie, il s&apos;agrandit sans perte.
        </p>
        <p>
          💡 Teste toujours le QR imprimé avec ton téléphone avant de le
          distribuer.
        </p>
      </div>
    </div>
  );
}
