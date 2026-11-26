import { euro } from "@/lib/site-orders/cart";
import { primary } from "./ui";

// Le bas du panier en temps normal : l'erreur éventuelle, le bouton d'envoi et le rappel du paiement au comptoir.

type Props = {
  totalCents: number;
  canSend: boolean;
  sending: boolean;
  error: string | null;
  signedIn: boolean | null; // null = on ne sait pas encore
  onSend: () => void;
};

export function SendPanel({ totalCents, canSend, sending, error, signedIn, onSend }: Props) {
  return (
    <>
      {error && <p role="alert" className="rounded-lg border border-danger px-3 py-2 text-[15px] text-danger">{error}</p>}
      <button type="button" disabled={!canSend} onClick={onSend} className={`${primary} w-full`}>{sending ? "Envoi…" : `Envoyer ma commande · ${euro(totalCents)}`}</button>
      <p className="text-[13px] text-ink-muted">
        Tu ne paies rien en ligne : tu règles au comptoir en venant la retirer.
        {signedIn === false && " Un compte te sera demandé à l'envoi, ton panier est gardé."}
      </p>
    </>
  );
}
