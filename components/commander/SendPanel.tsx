import type { OpeningRefusal } from "@/lib/site-orders/hours";
import { ghost, primary, telHref } from "./ui";

// Le bas du panier en temps normal : l'erreur éventuelle, le bouton d'envoi et le rappel du paiement au comptoir. Quand le
// restaurant est fermé (ou ses horaires inconnus), le bouton le dit et n'envoie rien ; le serveur le refuse aussi.

type Props = {
  canSend: boolean;
  sending: boolean;
  error: string | null;
  /** Pourquoi l'envoi est fermé maintenant, selon la fiche ; `null` s'il est ouvert (ou si on ne sait pas : le serveur jugera). */
  blocked: OpeningRefusal | null;
  phone: string | null;
  signedIn: boolean | null; // null = on ne sait pas encore
  onSend: () => void;
};

const note = "text-center text-[13px] leading-snug text-ink-muted";

export function SendPanel({ canSend, sending, error, blocked, phone, signedIn, onSend }: Props) {
  if (blocked) {
    return (
      <>
        <button type="button" disabled className={`${primary} w-full`}>{blocked.code === "ferme" ? "Envoi possible à l'ouverture" : "Envoi en ligne fermé"}</button>
        <p role="status" className={note}>
          {blocked.message}
        </p>
        {blocked.code === "horaires_inconnus" && phone && <a href={telHref(phone)} className={`${ghost} w-full`}>Appeler le {phone}</a>}
      </>
    );
  }
  return (
    <>
      {error && <p role="alert" className="rounded-lg border border-danger px-3 py-2 text-[15px] text-danger">{error}</p>}
      <button type="button" disabled={!canSend} onClick={onSend} className={`${primary} w-full`}>{sending ? "Envoi…" : "Envoyer ma commande"}</button>
      <p className={note}>
        Tu paies au comptoir, en retirant ta commande.
        {signedIn === false && " Un compte te sera demandé à l'envoi. Ton panier est gardé."}
      </p>
    </>
  );
}
