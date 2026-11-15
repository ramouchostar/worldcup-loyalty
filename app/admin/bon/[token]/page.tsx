import Link from "next/link";
import { redirect } from "next/navigation";
import { createServerSupabaseClient } from "@/lib/supabase";
import { isEstablishmentAdmin } from "@/lib/admin-guard";
import { todayInBrussels } from "@/lib/qr-funnel";
import { REDEEM_REFUSAL, formatVoucherCode, judgeRedeem } from "@/lib/ads/vouchers";
import { getVoucherByToken } from "@/lib/ads/vouchers-data";
import { Check } from "@/components/icons";
import { redeemVoucherAction } from "../actions";

export const metadata = { title: "Bon de pub", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

// ADR 0104 §2 — ce que voit la caisse quand elle scanne le QR d'un bon de pub : l'offre, le
// code, et « Bon utilisé ». Un bon déjà utilisé le dit avec l'heure ; hors des dates de
// l'offre, la raison s'affiche et le bouton n'existe pas.

const timeFr = (iso: string) =>
  new Date(iso).toLocaleString("fr-BE", { timeZone: "Europe/Brussels", weekday: "long", day: "numeric", month: "long", hour: "2-digit", minute: "2-digit" });

export default async function CashierVoucherPage({
  params,
  searchParams,
}: {
  params: Promise<{ token: string }>;
  searchParams: Promise<{ erreur?: string }>;
}) {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login?reason=login-required");
  const { token } = await params;
  const { erreur } = await searchParams;
  const v = await getVoucherByToken(token);

  if (!v) {
    return (
      <Shell>
        <h1 className="text-[24px] font-semibold tracking-[-0.02em] text-ink">Bon introuvable</h1>
        <p className="text-[15px] text-ink-muted">Ce QR ne correspond à aucun bon. Demande au client de rouvrir la page de l&apos;offre, ou tape son code dans la console.</p>
      </Shell>
    );
  }
  if (!(await isEstablishmentAdmin(user.id, v.restaurant_id))) redirect("/join?reason=admin-required");

  const verdict = judgeRedeem({ redeemedAt: v.redeemed_at }, v.offer, todayInBrussels());

  return (
    <Shell back={`/admin/${v.restaurant_id}/bon`}>
      <p className="text-[13px] font-medium text-boost-olive-dark">Bon de pub, {v.restaurantName}</p>
      <h1 className="text-[24px] font-semibold leading-tight tracking-[-0.02em] text-ink text-balance">{v.offer.text}</h1>
      <div className="flex flex-wrap items-center gap-3 text-[15px] text-ink">
        <span className="rounded-lg bg-paper-subtle px-3 py-1.5 text-[20px] font-semibold tracking-[0.08em] tabular-nums">{formatVoucherCode(v.code)}</span>
        <span>
          Mot clé <strong className="font-semibold">{v.offer.keyword}</strong>
        </span>
      </div>

      {verdict.ok && verdict.already && (
        <div className="flex items-start gap-3 rounded-lg bg-good/12 p-4 text-good">
          <Check size={22} aria-hidden="true" className="mt-0.5 shrink-0" />
          <p className="text-[15px] font-semibold">Bon utilisé {timeFr(verdict.at)}. Il ne peut plus servir.</p>
        </div>
      )}
      {!verdict.ok && <p className="rounded-lg bg-danger/12 p-4 text-[15px] font-semibold text-danger">{REDEEM_REFUSAL[verdict.reason]}</p>}
      {erreur === "ecriture" && <p className="rounded-lg bg-danger/12 p-4 text-[15px] text-danger">Le bon n&apos;a pas pu être marqué utilisé. Réessaie ; si ça recommence, note le code et préviens Boosteats.</p>}

      {verdict.ok && !verdict.already && (
        <form action={redeemVoucherAction}>
          <input type="hidden" name="token" value={token} />
          <button
            type="submit"
            className="flex min-h-[52px] w-full items-center justify-center rounded-lg bg-boost-olive px-4 text-[17px] font-semibold text-white hover:bg-boost-olive-dark active:translate-y-px focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-boost-olive"
          >
            Bon utilisé
          </button>
          <p className="pt-2 text-center text-[13px] text-ink-muted">Appuie quand l&apos;offre est donnée au client. Un bon ne sert qu&apos;une fois.</p>
        </form>
      )}
    </Shell>
  );
}

function Shell({ children, back }: { children: React.ReactNode; back?: string }) {
  return (
    <main className="min-h-screen bg-paper px-4 py-8">
      <div className="mx-auto max-w-md space-y-4 rounded-lg border border-paper-border bg-white p-5">{children}</div>
      {back && (
        <p className="mx-auto mt-4 max-w-md text-center">
          <Link href={back} className="inline-flex min-h-[44px] items-center text-[15px] font-semibold text-boost-olive-dark hover:text-ink">
            Valider un autre bon
          </Link>
        </p>
      )}
    </main>
  );
}
