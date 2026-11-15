import { formatVoucherCode } from "@/lib/ads/vouchers";
import { recentRedemptions, vouchersReady } from "@/lib/ads/vouchers-data";
import { Card, CardRow, PageHeader } from "@/components/admin/ui";
import { findVoucherAction } from "../../bon/actions";

export const metadata = { title: "Bons de pub" };
export const dynamic = "force-dynamic";

// ADR 0104 §2 — la caisse sans QR : le code du bon se tape ici. Le layout de la console a déjà
// vérifié l'accès à l'établissement ; l'action le revérifie.

const ERRORS: Record<string, string> = {
  forme: "Un code a 6 caractères, lettres et chiffres (jamais de 0, O, 1 ni I).",
  inconnu: "Aucun bon de ton établissement n'a ce code. Vérifie-le avec le client.",
};

const timeFr = (iso: string) =>
  new Date(iso).toLocaleString("fr-BE", { timeZone: "Europe/Brussels", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });

export default async function VoucherDeskPage({
  params,
  searchParams,
}: {
  params: Promise<{ restaurantId: string }>;
  searchParams: Promise<{ erreur?: string; code?: string }>;
}) {
  const { restaurantId } = await params;
  const { erreur, code } = await searchParams;
  const ready = await vouchersReady();
  const recent = ready ? await recentRedemptions(restaurantId) : [];

  return (
    <div className="space-y-6 max-w-2xl">
      <PageHeader title="Bons de pub" subtitle="Le client vient avec le bon de ta pub : scanne son QR avec ton téléphone, ou tape son code ici." />
      {!ready ? (
        <p className="text-[15px] text-ink-muted">Les bons de pub ne sont pas encore ouverts.</p>
      ) : (
        <Card className="space-y-3">
          <form action={findVoucherAction} className="space-y-3">
            <input type="hidden" name="restaurantId" value={restaurantId} />
            <label htmlFor="voucher-code" className="block text-[15px] font-semibold text-ink">
              Code du bon
            </label>
            <input
              id="voucher-code"
              name="code"
              defaultValue={code ?? ""}
              autoComplete="off"
              autoCapitalize="characters"
              inputMode="text"
              maxLength={9}
              placeholder="K7P 4QX"
              className="block min-h-[48px] w-full rounded-lg border border-ink-faint bg-white px-3.5 text-[20px] font-semibold uppercase tracking-[0.08em] text-ink placeholder:text-ink-faint focus-visible:outline focus-visible:outline-2 focus-visible:outline-boost-olive"
            />
            {erreur && ERRORS[erreur] && (
              <p role="alert" className="text-[15px] text-danger">
                {ERRORS[erreur]}
              </p>
            )}
            <button
              type="submit"
              className="flex min-h-[48px] w-full items-center justify-center rounded-lg bg-boost-olive px-4 text-[15px] font-semibold text-white hover:bg-boost-olive-dark active:translate-y-px focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-boost-olive"
            >
              Ouvrir le bon
            </button>
          </form>
        </Card>
      )}

      {recent.length > 0 && (
        <section className="space-y-3">
          <h2 className="text-[17px] font-semibold tracking-[-0.02em] text-ink">Derniers bons utilisés</h2>
          <Card padding="p-0">
            {recent.map((r, i) => (
              <CardRow key={`${r.code}-${r.redeemedAt}`} first={i === 0} className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-[15px] font-semibold tabular-nums text-ink">{formatVoucherCode(r.code)}</p>
                  {r.offer && <p className="truncate text-[13px] text-ink-muted">{r.offer}</p>}
                </div>
                <span className="shrink-0 text-[13px] text-ink-muted">{timeFr(r.redeemedAt)}</span>
              </CardRow>
            ))}
          </Card>
        </section>
      )}
    </div>
  );
}
