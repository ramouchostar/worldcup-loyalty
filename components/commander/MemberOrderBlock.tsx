import Link from "next/link";
import { commanderColorVars } from "@/lib/site-orders/theme";
import { primary } from "./ui";

// ADR 0108 §3 — l'entrée « Commander » de l'accueil membre, montrée seulement quand l'espace est ouvert pour ce
// restaurant (drapeau ET forfait : l'appelant le vérifie avec `siteOrdersAvailable`). AUCUN euro ici (ADR 0007, 0028).
// La police reste celle de l'app membre ; seule la couleur du restaurant est rendue lisible sur le bouton.
// `?depuis=app` compte les arrivées venues de ce bloc (lib/site-orders/fiche.ts).

export function MemberOrderBlock({ restaurantId, primaryColor }: { restaurantId: string; primaryColor: string | null }) {
  return (
    <section style={commanderColorVars(primaryColor)} className="flex flex-col gap-2.5 rounded-lg border border-paper-border bg-paper-subtle p-3.5" aria-labelledby="commander-a-emporter">
      <div className="flex flex-col gap-1">
        <h2 id="commander-a-emporter" className="text-[17px] font-semibold text-ink">Commander à emporter</h2>
        <p className="text-[15px] leading-snug text-ink-muted">Chaque commande retirée te rapporte des points. Tu paies au comptoir.</p>
      </div>
      <Link href={`/commander/${restaurantId}?depuis=app`} className={`${primary} w-full`}>Commander</Link>
    </section>
  );
}
