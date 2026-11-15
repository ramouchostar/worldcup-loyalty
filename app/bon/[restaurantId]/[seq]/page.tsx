import type { Metadata } from "next";
import { cookies } from "next/headers";
import { notFound } from "next/navigation";
import { todayInBrussels } from "@/lib/qr-funnel";
import { offerWindow, viewSource, voucherCookieName } from "@/lib/ads/vouchers";
import { getVoucherForDevice, loadVoucherPage, recordVoucherView, vouchersReady } from "@/lib/ads/vouchers-data";
import { Location } from "@/components/icons";
import { VoucherClaim } from "./VoucherClaim";

// ADR 0104 §2 — la page du bon : là où mène le bouton « Obtenir l'offre » d'une pub avec offre.
// PUBLIQUE, sans compte, sans donnée personnelle. Le passant y obtient un bon (code + QR) que
// la caisse valide depuis la console. Chaque affichage est compté (ad_voucher_views) : c'est
// l'étage entre les clics de Meta et les bons obtenus. Pas d'indexation : la page vit par la pub.

export const dynamic = "force-dynamic";

type Params = { restaurantId: string; seq: string };

export async function generateMetadata({ params }: { params: Promise<Params> }): Promise<Metadata> {
  const { restaurantId, seq } = await params;
  const page = await loadVoucherPage(restaurantId, Number(seq));
  return {
    title: page ? `${page.offer.text} chez ${page.restaurantName}` : "Offre",
    robots: { index: false, follow: false },
  };
}

const dayFr = (d: string) => new Date(`${d}T12:00:00Z`).toLocaleDateString("fr-BE", { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" });

export default async function VoucherPage({
  params,
  searchParams,
}: {
  params: Promise<Params>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { restaurantId, seq } = await params;
  const sp = await searchParams;
  const page = await loadVoucherPage(restaurantId, Number(seq));
  if (!page) notFound();

  const one = (k: string) => (typeof sp[k] === "string" ? (sp[k] as string) : null);
  await recordVoucherView(page.requestId, viewSource({ utm_source: one("utm_source"), fbclid: one("fbclid") }));

  const win = offerWindow(page.offer, todayInBrussels());
  const ready = await vouchersReady();
  const kept = (await cookies()).get(voucherCookieName(page.requestId))?.value;
  const existing = kept && ready ? await getVoucherForDevice(kept, page.requestId) : null;

  return (
    <main className="min-h-screen bg-boost-cream px-4 py-8 text-ink">
      <div className="mx-auto max-w-md space-y-5">
        <header className="flex items-center gap-3">
          {page.logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={page.logoUrl} alt="" width={44} height={44} className="h-11 w-11 rounded-full border border-paper-border bg-white object-contain p-1" />
          ) : null}
          <p className="text-[17px] font-semibold tracking-[-0.02em]">{page.restaurantName}</p>
        </header>

        <section className="space-y-4 rounded-lg bg-white p-5 shadow-[0_8px_24px_rgba(12,21,9,0.10)]">
          {page.thumbnail && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={page.thumbnail} alt="" className="aspect-[4/3] w-full max-w-full rounded-lg object-cover" />
          )}
          <div className="space-y-1.5">
            <p className="text-[13px] font-medium text-boost-olive-dark">Offre à retirer au comptoir</p>
            <h1 className="text-[24px] font-semibold leading-tight tracking-[-0.02em] text-balance">{page.offer.text}</h1>
            <p className="text-[15px] text-ink-muted">
              {win === "finie" ? `Cette offre s'est terminée le ${dayFr(page.offer.to)}.` : `Du ${dayFr(page.offer.from)} au ${dayFr(page.offer.to)}.`}
            </p>
          </div>

          {win !== "finie" &&
            (ready ? (
              <VoucherClaim
                restaurantId={page.restaurantId}
                seq={Number(seq)}
                keyword={page.offer.keyword}
                startsLater={win === "avant" ? dayFr(page.offer.from) : null}
                initial={existing ? { code: existing.code, token: existing.token, redeemedAt: existing.redeemed_at } : null}
              />
            ) : (
              <p className="rounded-lg bg-paper-subtle px-3.5 py-3 text-[15px]">
                Montre cette page à la caisse et dis le mot clé <strong className="font-semibold">{page.offer.keyword}</strong>.
              </p>
            ))}
        </section>

        {(page.address || page.mapsUrl) && (
          <section className="flex items-start gap-3 rounded-lg border border-paper-border bg-white p-4">
            <Location size={20} aria-hidden="true" className="mt-0.5 shrink-0 text-boost-olive-dark" />
            <div className="min-w-0 space-y-1">
              {page.address && <p className="text-[15px]">{page.address}</p>}
              {page.mapsUrl && (
                <a href={page.mapsUrl} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-[44px] items-center text-[15px] font-semibold text-boost-olive-dark underline-offset-2 hover:underline">
                  Itinéraire
                </a>
              )}
            </div>
          </section>
        )}

        <p className="text-center text-[13px] text-ink-muted">
          Tu viens souvent ?{" "}
          <a href={`/r/${page.restaurantId}`} className="font-semibold text-boost-olive-dark underline-offset-2 hover:underline">
            Rejoins le programme de fidélité de {page.restaurantName}
          </a>
        </p>
        <p className="text-center text-[13px] text-ink-faint">Bon proposé avec Boosteats. Aucune donnée personnelle n&apos;est demandée.</p>
      </div>
    </main>
  );
}
