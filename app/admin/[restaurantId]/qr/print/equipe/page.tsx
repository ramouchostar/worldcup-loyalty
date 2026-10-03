import { redirect, notFound } from "next/navigation";
import QRCode from "qrcode";
import { createServerSupabaseClient } from "@/lib/supabase";
import { getRestaurant, getRestaurantBranding, logoPublicUrl } from "@/lib/restaurant";
import { listActiveStaffCodes, staffQrTargetUrl } from "@/lib/staff-codes";
import { SITE_ORIGIN } from "@/lib/site";
import { PrintButton } from "../PrintButton";

const APP_URL = process.env.NEXT_PUBLIC_APP_URL || SITE_ORIGIN;

// ADR 0053 — planche A4 de l'équipe en salle : tous les QR ACTIFS d'un coup,
// une case par prénom (QR au-dessus, prénom dessous), à découper le long des
// pointillés. 6 cases par feuille (2 × 3), autant de feuilles que nécessaire.
// Même adresse que le badge (staffQrTargetUrl) : un scan du papier compte
// par prénom dans « Équipe en salle », comme un scan du téléphone.
const PER_PAGE = 6;

const printStyles = `
  @page { size: 210mm 297mm; margin: 0; }
  html, body { background: #f3f4f6; }
  .print-area, .print-area * {
    -webkit-print-color-adjust: exact !important;
    print-color-adjust: exact !important;
  }
  .print-page { break-after: page; page-break-after: always; }
  .print-page:last-child { break-after: auto; page-break-after: auto; }
  @media print {
    html, body { margin: 0 !important; background: #fff !important; }
    .no-print { display: none !important; }
    /* N'imprimer QUE les feuilles — masque le chrome admin (header, nav). */
    body { visibility: hidden !important; }
    .print-area { visibility: visible !important; position: absolute !important;
      top: 0 !important; left: 0 !important; margin: 0 !important; padding: 0 !important; }
    .print-area * { visibility: visible !important; }
    .print-page { box-shadow: none !important; margin: 0 !important; }
  }
`;

export default async function StaffQrSheetPage({
  params,
}: {
  params: Promise<{ restaurantId: string }>;
}) {
  const { restaurantId } = await params;

  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const restaurant = await getRestaurant(restaurantId);
  if (!restaurant) notFound();
  const [branding, codes] = await Promise.all([
    getRestaurantBranding(restaurantId),
    listActiveStaffCodes(restaurantId),
  ]);
  const logo = logoPublicUrl(branding.logo_url);

  // QR noir pur sur blanc, comme le badge : lisible quelle que soit l'imprimante.
  const cards = await Promise.all(
    (codes ?? []).map(async (c) => ({
      id: c.id,
      label: c.label,
      qrSvg: await QRCode.toString(staffQrTargetUrl(APP_URL, restaurantId, c.code), {
        type: "svg",
        errorCorrectionLevel: "M",
        margin: 0,
        color: { dark: "#0A0A0A", light: "#FFFFFF" },
      }),
    }))
  );

  const pages: (typeof cards)[] = [];
  for (let i = 0; i < cards.length; i += PER_PAGE) pages.push(cards.slice(i, i + PER_PAGE));

  const backHref = `/admin/${restaurantId}/qr#equipe`;

  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: printStyles }} />
      <div className="no-print sticky top-0 z-10 bg-white border-b border-gray-200 px-4 pb-3 pt-[max(0.75rem,env(safe-area-inset-top,0px))] flex items-center justify-between gap-3">
        <a href={backHref} className="text-sm text-gray-500 hover:text-gray-800">← Retour</a>
        <span className="text-sm font-medium text-gray-700">
          QR de l&apos;équipe (A4) · {cards.length} {cards.length > 1 ? "personnes" : "personne"}
        </span>
        {cards.length > 0 ? <PrintButton /> : <span />}
      </div>

      {codes === null ? (
        <p className="no-print text-center text-sm text-gray-600 mt-10 px-4">
          La mesure « Équipe en salle » attend la migration 20260910-1430-codes-personnel-salle.sql.
        </p>
      ) : cards.length === 0 ? (
        <div className="no-print text-center text-sm text-gray-600 mt-10 px-4 space-y-2">
          <p>Aucun QR actif dans ton équipe pour l&apos;instant.</p>
          <a href={`/admin/${restaurantId}/qr?creer=1#equipe`} className="font-semibold text-gray-900 underline">
            Créer le QR d&apos;une personne
          </a>
        </div>
      ) : (
        <>
          <div className="no-print text-center text-xs text-gray-400 mt-3 px-4">
            Astuce : dans la fenêtre d&apos;impression, choisis « Enregistrer au format PDF » pour le télécharger,
            marges « Aucune ». Découpe ensuite le long des pointillés : une case par personne.
          </div>
          <div className="overflow-x-auto">
            <div className="print-area flex flex-col items-center gap-8 py-8 px-4 w-max mx-auto">
              {pages.map((page, pi) => (
                <div
                  key={pi}
                  className="print-page bg-white shadow-xl"
                  style={{
                    width: "210mm",
                    height: "297mm",
                    padding: "8mm",
                    boxSizing: "border-box",
                    display: "grid",
                    gridTemplateColumns: "1fr 1fr",
                    gridTemplateRows: "1fr 1fr 1fr",
                  }}
                >
                  {page.map((card) => (
                    <div
                      key={card.id}
                      style={{
                        border: "0.3mm dashed #9CA3AF",
                        margin: "-0.15mm",
                        padding: "4mm",
                        boxSizing: "border-box",
                        display: "flex",
                        flexDirection: "column",
                        alignItems: "center",
                        justifyContent: "center",
                        textAlign: "center",
                        color: "#0A0A0A",
                        overflow: "hidden",
                      }}
                    >
                      {logo ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={logo} alt="" style={{ height: "8mm", maxWidth: "60mm", objectFit: "contain" }} />
                      ) : (
                        <p style={{ fontSize: "11px", fontWeight: 800, lineHeight: 1.1 }}>{restaurant.name}</p>
                      )}
                      <p style={{ fontSize: "13px", fontWeight: 800, marginTop: "2mm", lineHeight: 1.1 }}>
                        Scanne et gagne des cadeaux
                      </p>
                      <div
                        style={{ width: "52mm", height: "52mm", marginTop: "2.5mm" }}
                        className="[&>svg]:w-full [&>svg]:h-full [&>svg]:block"
                        dangerouslySetInnerHTML={{ __html: card.qrSvg }}
                      />
                      <p style={{ fontSize: "22px", fontWeight: 900, marginTop: "2.5mm", lineHeight: 1.05, maxWidth: "85mm", overflowWrap: "anywhere" }}>
                        {card.label}
                      </p>
                      <p style={{ fontSize: "9px", color: "#6B7280", marginTop: "1mm" }}>
                        {restaurant.name} · gratuit, sans carte
                      </p>
                    </div>
                  ))}
                </div>
              ))}
            </div>
          </div>
        </>
      )}
    </>
  );
}
