import { redirect } from "next/navigation";
import { isSendId } from "@/lib/message-links";
import { getSendForStop, isOptedOut, recordOptOut } from "@/lib/message-log";
import { isSequenceKey, messageLabel } from "@/lib/message-catalog";
import { getRestaurantDisplayName } from "@/lib/restaurant";

export const metadata = { title: "Ne plus recevoir ces e-mails" };
export const dynamic = "force-dynamic";

// « Ne plus recevoir ces rappels » (pied des e-mails de séquence, ADR 0063 §2).
// L'identifiant d'envoi prouve que la personne a reçu l'e-mail : pas de
// connexion demandée pour dire stop. La page AFFICHE ; seul le bouton arrête
// (un aperçu de lien par la messagerie ne doit rien couper — ADR 0032 §3).

const DONE_TEXT: Record<string, string> = {
  install_app: "C'est noté : on ne te proposera plus d'installer l'app.",
};

async function stop(formData: FormData) {
  "use server";
  const id = String(formData.get("id") ?? "");
  if (!isSendId(id)) return;
  const send = await getSendForStop(id);
  if (send && isSequenceKey(send.messageKey)) await recordOptOut(send.userId, send.messageKey, "lien");
  redirect(`/e/stop/${id}?fait=1`);
}

export default async function StopPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ fait?: string }>;
}) {
  const { id } = await params;
  const { fait } = await searchParams;
  const send = isSendId(id) ? await getSendForStop(id) : null;
  const valid = !!send && isSequenceKey(send.messageKey);
  const label = valid ? messageLabel(send!.messageKey) : null;
  const restaurant = valid && send!.restaurantId ? await getRestaurantDisplayName(send!.restaurantId).catch(() => null) : null;
  const already = valid && (fait === "1" || (await isOptedOut(send!.userId, send!.messageKey)));

  return (
    <main className="min-h-screen bg-gray-50 flex items-center justify-center px-4 py-12">
      <div className="w-full max-w-md bg-white rounded-2xl border border-gray-100 shadow-sm p-6 space-y-4">
        {!valid && (
          <>
            <h1 className="text-xl font-bold text-gray-900">Ce lien n&apos;est plus valable</h1>
            <p className="text-sm text-gray-600">
              Pour choisir les e-mails que tu reçois, ouvre ton compte dans l&apos;app.
            </p>
          </>
        )}
        {valid && already && (
          <>
            <h1 className="text-xl font-bold text-gray-900">C&apos;est noté</h1>
            <p className="text-sm text-gray-600">
              {DONE_TEXT[send!.messageKey] ?? `Tu ne recevras plus « ${label} »${restaurant ? ` de ${restaurant}` : ""}.`}
            </p>
            <p className="text-sm text-gray-600">
              Tes points et tes cadeaux ne changent pas, et on te préviendra toujours quand un cadeau t&apos;attend.
            </p>
          </>
        )}
        {valid && !already && (
          <form action={stop} className="space-y-4">
            <input type="hidden" name="id" value={id} />
            <h1 className="text-xl font-bold text-gray-900">Ne plus recevoir « {label} » ?</h1>
            <p className="text-sm text-gray-600">
              {restaurant ? `Tu restes membre du programme de ${restaurant}. ` : "Tu restes membre du programme. "}
              Seuls ces rappels s&apos;arrêtent : on te préviendra toujours quand un cadeau t&apos;attend.
            </p>
            <button type="submit" className="w-full rounded-xl bg-gray-900 px-4 py-3 text-sm font-semibold text-white">
              Ne plus les recevoir
            </button>
          </form>
        )}
      </div>
    </main>
  );
}
