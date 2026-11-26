import type { Openness } from "@/lib/site-orders/hours";
import { notice, telHref } from "./ui";

// L'encadré entre l'en-tête et la carte : comment ça marche quand c'est ouvert, ce qu'on peut faire quand ce ne l'est pas.

export function InfoBanner({ openness, phone, signedIn }: { openness: Openness | null; phone: string | null; signedIn: boolean | null }) {
  if (openness?.state === "ferme") {
    return <p className={notice}><b className="font-semibold">Tu peux préparer ton panier.</b> L&apos;envoi s&apos;ouvre quand le restaurant ouvre, pour que ta commande soit vue.</p>;
  }
  if (openness?.state === "inconnu") {
    return (
      <p className={notice}>
        <b className="font-semibold">Appelle le restaurant pour commander{phone ? <> : <a href={telHref(phone)} className="underline">{phone}</a></> : null}.</b>{" "}
        Ses horaires ne peuvent pas être vérifiés pour le moment, l&apos;envoi en ligne est donc fermé.
      </p>
    );
  }
  return (
    <p className={notice}>
      <b className="font-semibold">Commande à emporter.</b> Tu paies au comptoir en la retirant. Chaque commande retirée te rapporte des points.
      {signedIn !== true && <span className="hidden lg:inline"> Pas besoin de compte pour regarder, il en faut un pour envoyer.</span>}
    </p>
  );
}
