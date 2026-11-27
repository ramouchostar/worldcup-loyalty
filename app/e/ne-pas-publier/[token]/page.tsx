import Link from "next/link";
import { redirect } from "next/navigation";
import type { Metadata } from "next";
import { refuseOccasion } from "@/lib/restaurant-posts/auto/actions";
import { dayWord } from "@/lib/restaurant-posts/auto/overview";
import { reasonText } from "@/lib/restaurant-posts/auto/reasons";
import { autoDeps } from "@/lib/restaurant-posts/auto/server";
import { readRefusalToken } from "@/lib/restaurant-posts/auto/token";
import { brusselsDay } from "@/lib/restaurant-posts/auto/time";
import { PENDING_STATUSES, type Occasion } from "@/lib/restaurant-posts/auto/types";
import { getRestaurantDisplayName } from "@/lib/restaurant";

// ADR 0112 — « Ne pas publier », depuis l'e-mail de la veille. Le jeton signé du lien n'autorise QUE ce refus, jusqu'à
// l'heure de publication : pas de connexion demandée pour dire non. La page AFFICHE ; seul le bouton refuse (un
// antivirus ou un aperçu de lien ouvre les adresses : cela ne doit rien décider). Lire ou modifier demandent la
// connexion.

export const metadata: Metadata = { title: "Ne pas publier", robots: { index: false, follow: false }, referrer: "no-referrer" };
export const dynamic = "force-dynamic";

type Found = { occasion: Occasion; expired: boolean } | "invalid" | "failed";

async function find(token: string): Promise<Found> {
  try {
    const read = readRefusalToken(token, new Date());
    if (!read) return "invalid";
    const occasion = await autoDeps().db.occasion(read.occasionId);
    return occasion ? { occasion, expired: read.expired } : "invalid";
  } catch (e) {
    console.error("[articles auto] page de refus :", (e as Error).message);
    return "failed";
  }
}

async function refuse(formData: FormData) {
  "use server";
  const token = String(formData.get("jeton") ?? "");
  const found = await find(token);
  const back = `/e/ne-pas-publier/${encodeURIComponent(token)}`;
  if (found === "invalid" || found === "failed" || found.expired) redirect(`${back}?essai=1`);
  let ok = false;
  try {
    ok = (await refuseOccasion(autoDeps(), found.occasion, { via: "lien", userId: null })).ok;
  } catch (e) {
    console.error("[articles auto] refus par le lien :", (e as Error).message);
  }
  redirect(ok ? back : `${back}?essai=1`);
}

const title = "text-[20px] font-semibold leading-tight tracking-[-0.02em] text-ink";
const text = "break-words text-[15px] text-ink";

export default async function RefusePage({ params, searchParams }: {
  params: Promise<{ token: string }>;
  searchParams: Promise<{ essai?: string }>;
}) {
  const { token } = await params;
  const { essai } = await searchParams;
  const found = await find(token);
  const known = found !== "invalid" && found !== "failed" ? found : null;
  const o = known?.occasion ?? null;
  const pending = !!o && PENDING_STATUSES.includes(o.status);
  const restaurant = o ? await getRestaurantDisplayName(o.restaurant_id).catch(() => null) : null;
  const when = o ? dayWord(o.publish_day, brusselsDay(new Date())) : "";
  const consoleLink = o && (
    <Link href={`/admin/${o.restaurant_id}/articles`} className="inline-flex min-h-[44px] items-center text-[15px] font-semibold text-boost-olive-dark underline">
      Ouvrir « Mes articles »
    </Link>
  );

  return (
    <main className="flex min-h-screen items-center justify-center bg-paper px-4 py-12">
      <div className="w-full max-w-md space-y-4 rounded-lg border border-paper-border bg-white p-6">
        {found === "invalid" && (
          <>
            <h1 className={title}>Ce lien n&apos;est pas valable</h1>
            <p className={text}>Ouvre « Mes articles » dans ta console pour voir ce qui est prévu.</p>
          </>
        )}
        {found === "failed" && (
          <>
            <h1 className={title}>Un souci de notre côté</h1>
            <p className={text}>Rien n&apos;a changé. Recharge la page, ou ouvre « Mes articles » dans ta console.</p>
          </>
        )}
        {o && o.status === "refuse" && (
          <>
            <h1 className={title}>C&apos;est noté</h1>
            <p className={text}>« {o.title} » ne sera pas publié.</p>
            <p className={text}>La publication automatique reste activée. Tu peux la régler ou l&apos;arrêter dans « Mes articles ».</p>
            {consoleLink}
          </>
        )}
        {o && o.status === "publie" && (
          <>
            <h1 className={title}>Cet article est déjà publié</h1>
            <p className={text}>Tu peux le retirer de ta page dans « Mes articles ».</p>
            {consoleLink}
          </>
        )}
        {o && o.status === "ecarte" && (
          <>
            <h1 className={title}>Cet article ne sera pas publié</h1>
            <p className={text}>{reasonText(o.reason, o.reason_detail)}</p>
            {consoleLink}
          </>
        )}
        {o && pending && known?.expired && (
          <>
            <h1 className={title}>L&apos;heure de publication est passée</h1>
            <p className={text}>Ce lien ne peut plus l&apos;arrêter. Regarde « Mes articles » : tu peux y retirer un article publié.</p>
            {consoleLink}
          </>
        )}
        {o && pending && !known?.expired && (
          <form action={refuse} className="space-y-4">
            <input type="hidden" name="jeton" value={token} />
            <h1 className={title}>Ne pas publier cet article ?</h1>
            <p className={text}>« {o.title} »</p>
            <p className={text}>Il doit paraître : {when.charAt(0).toLowerCase() + when.slice(1)} à 10:00{restaurant ? `, sur la page de commande de ${restaurant}` : ""}.</p>
            {essai === "1" && <p role="alert" className="rounded-lg bg-danger/10 px-3 py-2 text-[15px] text-danger">Ça n&apos;a pas marché. Réessaie.</p>}
            <button type="submit" className="flex min-h-[48px] w-full items-center justify-center rounded-lg bg-boost-olive px-4 text-[15px] font-semibold text-white hover:bg-boost-olive-dark focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink">
              Oui, ne pas publier
            </button>
          </form>
        )}
      </div>
    </main>
  );
}
