import { redirect } from "next/navigation";
import { Download, FileText, Lightbulb, Palette, ShoppingBag, TriangleAlert, Utensils, type LucideIcon } from "lucide-react";
import { notFound } from "next/navigation";
import Link from "next/link";
import QRCode from "qrcode";
import { createServerSupabaseClient } from "@/lib/supabase";
import { getRestaurant, getRestaurantBranding } from "@/lib/restaurant";
import { BRAND_DEFAULTS } from "@/lib/branding";
import { getStaffStats } from "@/lib/staff-codes";
import { StaffCodesSection } from "@/components/admin/StaffCodesSection";
import { PageHeader } from "@/components/admin/ui";

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
  // ADR 0053 — null = migration pas encore appliquée (la section l'explique).
  const staffStats = await getStaffStats(restaurantId);
  const isKraainem = restaurantId === "kraainem";
  const dark = branding.brand_dark ?? BRAND_DEFAULTS.dark;
  const targetUrl = `${APP_URL}/r/${restaurantId}`;
  // UTM sur le QR encodé uniquement — jamais sur l'URL affichée en clair
  // sous l'aperçu, pour ne pas exposer une chaîne illisible à l'écran.
  const qrTargetUrl = `${targetUrl}?utm_source=qr_code&utm_medium=print&utm_campaign=loyalty_signup`;

  // Belchicken Kraainem : QR toujours noir pur sur blanc pur (règle dure du
  // design "Templates QR Belchicken"), même sur l'export brut destiné à un
  // imprimeur pro — jamais teinté à la couleur de marque.
  const qrColor = isKraainem ? "#0A0A0A" : dark;

  const [svg, pngDataUrl] = await Promise.all([
    QRCode.toString(qrTargetUrl, {
      type: "svg",
      errorCorrectionLevel: "M",
      margin: 2,
      color: { dark: qrColor, light: "#FFFFFF" },
    }),
    QRCode.toDataURL(qrTargetUrl, {
      errorCorrectionLevel: "M",
      width: 2048, // impression nette jusqu'au format affiche
      margin: 2,
      color: { dark: qrColor, light: "#FFFFFF" },
    }),
  ]);

  const svgDataUrl = `data:image/svg+xml;base64,${Buffer.from(svg).toString("base64")}`;

  const formats: { key: string; icon: LucideIcon; label: string; desc: string }[] = isKraainem
    ? [
        { key: "sticker", icon: Utensils, label: "Sticker vitrine", desc: "80 × 80 mm — vitrine & caisse" },
        { key: "flyer", icon: ShoppingBag, label: "Flyer à emporter", desc: "A5 · 148 × 210 mm — à glisser dans les sacs" },
        { key: "affiche", icon: FileText, label: "Affiche murale", desc: "A3 · 297 × 420 mm — mur & entrée" },
      ]
    : [
        { key: "a6", icon: Utensils, label: "Sticker de table", desc: "A6 · 105 × 148 mm — à coller sur les tables" },
        { key: "flyer", icon: ShoppingBag, label: "Flyer à emporter", desc: "A5 · 148 × 210 mm — à glisser dans les sacs" },
        { key: "a4", icon: FileText, label: "Affiche caisse", desc: "A4 · 210 × 297 mm — à afficher au comptoir" },
      ];

  return (
    <div className="space-y-6 max-w-lg">
      <PageHeader
        title={<>QR code de {restaurant.name}</>}
        subtitle={<>Un client qui le scanne arrive sur ta page, s&apos;inscrit et rejoint ta
          communauté. Choisis un support prêt-à-imprimer, ou télécharge le QR brut.</>}
      />

      {restaurant.status !== "active" && (
        <div className="bg-warn/10 border border-warn/30 rounded-xl p-4 text-sm text-warn">
          <TriangleAlert size={14} strokeWidth={1.8} className="inline-block mr-1.5 -mt-0.5" aria-hidden="true" />
          Ton établissement n&apos;est pas encore validé : la page de destination
          restera invisible aux clients jusqu&apos;à l&apos;approbation. Tu peux préparer
          l&apos;impression, mais attends la validation avant d&apos;afficher le QR.
        </div>
      )}

      {/* ADR 0053 — Équipe en salle : un QR par prénom, la mesure de qui
          apporte des clients. Aucune distinction de poste. Ancre `#equipe` :
          la vue simple (ADR 0064) y envoie directement. */}
      <div id="equipe" className="space-y-3 scroll-mt-20">
        <p className="text-xs font-semibold text-ink-muted uppercase tracking-wide">Équipe en salle</p>
        <p className="text-xs text-ink-muted -mt-1">
          Un QR personnel par prénom : tu vois qui amène des clients, et chacun
          montre son badge depuis son téléphone.
        </p>
        <StaffCodesSection
          restaurantId={restaurantId}
          initialStats={staffStats ?? []}
          migrationMissing={staffStats === null}
        />
      </div>

      {/* Supports imprimables */}
      <div className="space-y-3">
        <p className="text-xs font-semibold text-ink-muted uppercase tracking-wide">Supports prêts à imprimer</p>
        <div className="grid gap-3">
          {formats.map((f) => (
            <Link
              key={f.key}
              href={`/admin/${restaurantId}/qr/print?format=${f.key}`}
              className="flex items-center gap-4 bg-white rounded-xl border border-paper-border p-4 hover:border-ink-faint hover:shadow-sm transition-all"
            >
              <span className="w-10 h-10 rounded-xl bg-paper-subtle text-ink-muted flex items-center justify-center shrink-0">
                <f.icon size={20} strokeWidth={1.6} aria-hidden="true" />
              </span>
              <div className="flex-1 min-w-0">
                <p className="font-semibold text-ink">{f.label}</p>
                <p className="text-xs text-ink-faint">{f.desc}</p>
              </div>
              <span className="text-ink font-semibold text-sm shrink-0">Imprimer →</span>
            </Link>
          ))}
        </div>
        <p className="text-xs text-ink-faint">
          <Palette size={13} strokeWidth={1.8} className="inline-block mr-1 -mt-0.5" aria-hidden="true" />
          Les supports reprennent ton logo et tes couleurs. Configure-les dans{" "}
          <Link href={`/admin/${restaurantId}/settings`} className="text-ink hover:underline">Mon établissement</Link>.
        </p>
      </div>

      {/* Aperçu + QR brut */}
      <div className="bg-white rounded-xl border border-paper-border p-6 flex flex-col items-center">
        <div
          className="w-56 h-56 [&>svg]:w-full [&>svg]:h-full"
          dangerouslySetInnerHTML={{ __html: svg }}
        />
        <p className="mt-4 text-xs text-ink-faint font-mono break-all text-center">{targetUrl}</p>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <a
          href={pngDataUrl}
          download={`qr-${restaurantId}.png`}
          className="bg-ink text-white text-center py-3 rounded-xl font-semibold hover:opacity-90 transition-opacity"
        >
          <Download size={15} strokeWidth={1.8} className="inline-block mr-1.5 -mt-0.5" aria-hidden="true" />
          PNG (2048 px)
        </a>
        <a
          href={svgDataUrl}
          download={`qr-${restaurantId}.svg`}
          className="bg-ink text-white text-center py-3 rounded-xl font-semibold hover:opacity-90 transition-opacity"
        >
          <Download size={15} strokeWidth={1.8} className="inline-block mr-1.5 -mt-0.5" aria-hidden="true" />
          SVG (imprimeur)
        </a>
      </div>

      <div className="bg-paper rounded-xl p-4 text-xs text-ink-muted space-y-1">
        <p><Lightbulb size={13} strokeWidth={1.8} className="inline-block mr-1 -mt-0.5" aria-hidden="true" />Pour les supports, imprime avec les marges « Aucune » et les couleurs d&apos;arrière-plan activées.</p>
        <p><Lightbulb size={13} strokeWidth={1.8} className="inline-block mr-1 -mt-0.5" aria-hidden="true" />Le SVG est vectoriel : c&apos;est le format à donner à un imprimeur professionnel.</p>
        <p><Lightbulb size={13} strokeWidth={1.8} className="inline-block mr-1 -mt-0.5" aria-hidden="true" />Teste toujours le QR imprimé avec ton téléphone avant de le distribuer.</p>
      </div>
    </div>
  );
}
