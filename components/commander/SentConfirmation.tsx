import { euro } from "@/lib/site-orders/cart";
import { primary } from "./ui";

// La confirmation : la commande est enregistrée, son numéro et le montant à payer au comptoir.

export type Sent = { number: string; totalCents: number; phone: string; points: boolean };

export function SentConfirmation({ sent, onAgain }: { sent: Sent; onAgain: () => void }) {
  return (
    <main className="mx-auto max-w-2xl space-y-4 p-4">
      <h1 className="text-[24px] font-semibold text-ink">Commande envoyée</h1>
      <p className="text-[32px] font-semibold leading-tight text-ink">N° {sent.number}</p>
      <p className="text-[17px] text-ink">À payer au comptoir en venant la chercher : <b className="tabular-nums">{euro(sent.totalCents)}</b>.</p>
      <p className="text-[15px] text-ink">
        {sent.phone !== "" ? `Le restaurant t'appelle au ${sent.phone} quand elle est prête. ` : "Le restaurant prépare ta commande. "}
        Si tu n&apos;as pas de nouvelles au bout de dix minutes, appelle le restaurant en donnant ce numéro.
      </p>
      {/* ADR 0108 §5 — dit seulement quand la commande est liée à ton compte, sans aucun nombre : jamais un gain à côté d'un prix (ADR 0028). */}
      {sent.points && <p className="text-[15px] text-ink">Tes points arrivent quand tu as retiré et payé ta commande. Pas besoin de photographier ton ticket de caisse.</p>}        <button type="button" className={primary} onClick={onAgain}>Faire une autre commande</button>
    </main>
  );
}
