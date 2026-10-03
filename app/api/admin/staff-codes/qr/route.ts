import { NextResponse, type NextRequest } from "next/server";
import QRCode from "qrcode";
import { requireAdmin } from "@/lib/admin-guard";
import { listActiveStaffCodes, staffQrTargetUrl } from "@/lib/staff-codes";
import { SITE_ORIGIN } from "@/lib/site";

const APP_URL = process.env.NEXT_PUBLIC_APP_URL || SITE_ORIGIN;

// ADR 0053 — télécharger le QR d'une personne en PNG (1024 px, noir sur
// blanc), même adresse que son badge. Code ACTIF de CET établissement
// seulement : un code désactivé ne se télécharge plus, comme son badge.
export async function GET(request: NextRequest) {
  const restaurantId = request.nextUrl.searchParams.get("restaurantId") ?? "";
  const codeId = request.nextUrl.searchParams.get("codeId") ?? "";
  if (!restaurantId || !codeId) {
    return NextResponse.json({ error: "Paramètres invalides." }, { status: 400 });
  }

  const guard = await requireAdmin(restaurantId);
  if (!guard.ok) return guard.response;

  const codes = await listActiveStaffCodes(restaurantId);
  const staff = codes?.find((c) => c.id === codeId);
  if (!staff) return NextResponse.json({ error: "QR introuvable ou désactivé." }, { status: 404 });

  const png = await QRCode.toBuffer(staffQrTargetUrl(APP_URL, restaurantId, staff.code), {
    errorCorrectionLevel: "M",
    width: 1024,
    margin: 2,
    color: { dark: "#0A0A0A", light: "#FFFFFF" },
  });

  // Nom de fichier lisible (« qr-sofia.png ») ; le prénom brut part encodé
  // en filename* pour les accents.
  const ascii = staff.label.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^\w-]+/g, "-").replace(/^-+|-+$/g, "").toLowerCase() || staff.code;
  return new NextResponse(new Uint8Array(png), {
    headers: {
      "Content-Type": "image/png",
      "Content-Disposition": `attachment; filename="qr-${ascii}.png"; filename*=UTF-8''qr-${encodeURIComponent(staff.label)}.png`,
      "Cache-Control": "private, no-store",
    },
  });
}
