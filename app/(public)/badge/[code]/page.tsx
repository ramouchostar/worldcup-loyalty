import { notFound } from "next/navigation";
import QRCode from "qrcode";
import { resolveStaffCode, STAFF_PITCH, STAFF_FAQ } from "@/lib/staff-codes";
import { getRestaurant, getRestaurantBranding, logoPublicUrl } from "@/lib/restaurant";

// ADR 0053 §5 — le badge d'un membre du personnel : QR en grand, prénom, la
// phrase à dire et trois réponses. Page PUBLIQUE (le gérant envoie le lien
// par WhatsApp, zéro compte) : la personne l'affiche depuis son téléphone ou
// l'imprime au format carte. Un code désactivé → 404, le badge meurt avec le
// départ de la personne. Aucune donnée sensible : le QR mène à la vitrine
// publique, le code est fait pour être scanné.

const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? "https://worldcup-loyalty.vercel.app";

export const metadata = { title: "Mon badge — Boosteats" };

export default async function StaffBadgePage({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  const staff = await resolveStaffCode(code.toUpperCase());
  if (!staff) notFound();

  const [restaurant, branding] = await Promise.all([
    getRestaurant(staff.restaurant_id),
    getRestaurantBranding(staff.restaurant_id),
  ]);
  if (!restaurant) notFound();
  const logo = logoPublicUrl(branding.logo_url);

  // Compte comme un scan de QR dans l'entonnoir général (c'en est un) ET par
  // prénom (`p=`), le cookie d'attribution étant posé par le middleware.
  const targetUrl = `${APP_URL}/r/${staff.restaurant_id}?utm_source=qr_code&utm_medium=staff&p=${staff.code}`;
  const qrDataUrl = await QRCode.toDataURL(targetUrl, {
    errorCorrectionLevel: "M",
    width: 1024,
    margin: 2,
    color: { dark: "#0A0A0A", light: "#FFFFFF" },
  });

  return (
    <div className="min-h-screen bg-gray-100 flex items-center justify-center p-4 print:bg-white print:p-0">
      <div className="w-full max-w-sm space-y-4">
        {/* Recto — ce que le client voit quand on lui tend le téléphone.
            Format carte à l'impression (~85×55 proportions au ratio près). */}
        <div className="bg-white rounded-3xl shadow-xl p-6 text-center print:shadow-none print:border print:border-gray-300 print:rounded-xl">
          {logo ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={logo} alt={restaurant.name} className="h-10 mx-auto mb-3 object-contain" />
          ) : (
            <p className="font-black text-gray-900 mb-3">{restaurant.name}</p>
          )}
          <p className="text-xl font-black text-gray-900 leading-tight mb-3">
            Scanne et gagne<br />des cadeaux
          </p>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={qrDataUrl} alt="QR code du programme" className="w-56 h-56 mx-auto" />
          <p className="text-sm font-bold text-gray-700 mt-3">{staff.label}</p>
          <p className="text-[11px] text-gray-400">{restaurant.name} · gratuit, sans carte</p>
        </div>

        {/* Verso — la phrase à dire et les réponses aux questions courantes.
            Pour la personne, pas pour le client. */}
        <div className="bg-brand-dark text-white rounded-3xl p-6 print:rounded-xl print:break-before-page">
          <p className="font-mono text-[11px] tracking-[0.12em] uppercase text-brand-gold mb-2">La phrase à dire</p>
          <p className="text-sm leading-relaxed">« {STAFF_PITCH} »</p>
          <p className="font-mono text-[11px] tracking-[0.12em] uppercase text-brand-gold mt-5 mb-2">Si on te demande</p>
          <div className="space-y-2.5">
            {STAFF_FAQ.map((f) => (
              <div key={f.q}>
                <p className="text-xs font-bold">{f.q}</p>
                <p className="text-xs text-white/75">{f.a}</p>
              </div>
            ))}
          </div>
        </div>

        <p className="text-center text-xs text-gray-400 print:hidden">
          Ajoute cette page à ton écran d&apos;accueil, ou imprime-la (Ctrl/Cmd+P).
        </p>
      </div>
    </div>
  );
}
