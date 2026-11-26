import { field, ghost, primary } from "./ui";

// ADR 0107 §10 — le secours : le restaurant ne peut pas recevoir la commande, le client l'envoie lui-même par WhatsApp.
// L'état (message, copie, nouvel essai) appartient à `OrderApp`.

type Props = {
  rescueLink: string | null;
  chatLink: string | null;
  rescueText: string;
  copied: "idle" | "ok" | "fail";
  canSend: boolean;
  sending: boolean;
  onOpenWhatsApp: () => void;
  onCopy: () => void;
  onRetry: () => void;
};

export function RescuePanel({ rescueLink, chatLink, rescueText, copied, canSend, sending, onOpenWhatsApp, onCopy, onRetry }: Props) {
  return (
    <div className="space-y-3">
      <div role="alert" className="rounded-lg border border-danger px-3 py-3">
        <p className="text-[15px] font-semibold text-danger">Le restaurant ne peut pas recevoir ta commande pour le moment.</p>
        <p className="mt-1 text-[13px] text-ink">Ton panier est gardé. Envoie-le au restaurant par WhatsApp : tu paies au comptoir, comme d&apos;habitude.</p>
      </div>
      {rescueLink ? (
        <a href={rescueLink} target="_blank" rel="noopener noreferrer" onClick={onOpenWhatsApp} className={`${primary} flex w-full items-center justify-center`}>Envoyer ma commande via WhatsApp</a>
      ) : (
        <>
          <p className="text-[13px] text-ink-muted">Ta commande est longue : copie le message, puis colle-le dans WhatsApp.</p>
          <button type="button" onClick={onCopy} className={`${primary} w-full`}>Copier le message</button>
          {chatLink && <a href={chatLink} target="_blank" rel="noopener noreferrer" onClick={onOpenWhatsApp} className={`${ghost} flex w-full items-center justify-center`}>Ouvrir WhatsApp</a>}
        </>
      )}
      <div className="flex gap-2">
        {rescueLink && <button type="button" onClick={onCopy} className={`${ghost} flex-1`}>Copier le message</button>}
        <button type="button" disabled={!canSend} onClick={onRetry} className={`${ghost} flex-1 disabled:cursor-not-allowed disabled:opacity-50`}>{sending ? "Envoi…" : "Réessayer"}</button>
      </div>
      {copied === "ok" && <p role="status" className="text-[13px] text-ink">Message copié.</p>}
      {copied === "fail" && (
        <div>
          <label htmlFor="co-msg" className="mb-1 block text-[15px] font-semibold text-ink">Copie ce message à la main</label>
          <textarea id="co-msg" readOnly rows={8} value={rescueText} onFocus={(e) => e.currentTarget.select()} className={field} />
        </div>
      )}
      <p className="text-[13px] text-ink-muted">Rien n&apos;a été enregistré sur le site. En général, WhatsApp affiche deux coches bleues quand le restaurant a ouvert ton message.</p>
    </div>
  );
}
