import type { Openness } from "@/lib/site-orders/hours";
import { primary, telHref } from "./ui";

// La barre fixée en bas de la carte sur téléphone et tablette : elle ouvre le panier, et dit pourquoi l'envoi est fermé.
// (Sur ordinateur, le panier est toujours à droite : pas de barre.)

type Props = {
  count: number;
  openness: Openness | null;
  signedIn: boolean | null;
  phone: string | null;
  onOpen: () => void;
};

export function CartBar({ count, openness, signedIn, phone, onOpen }: Props) {
  const state = openness?.state;
  const note =
    state === "ferme" ? "Horaires lus sur la fiche Google du restaurant."
      : state === "inconnu" ? "L'envoi en ligne est fermé pour le moment."
        : signedIn === true ? null : "Pas besoin de compte pour regarder. Il te faudra un compte pour envoyer.";
  const open = count > 0 && (
    <button type="button" onClick={onOpen} className={`${primary} w-full`}>Voir mon panier ({count} {count > 1 ? "plats" : "plat"})</button>
  );
  const action = open || (
    state === "ferme" ? <button type="button" disabled className={`${primary} w-full`}>Envoi possible à l&apos;ouverture</button>
      : state === "inconnu" && phone ? <a href={telHref(phone)} className={`${primary} w-full`}>Appeler le restaurant</a>
        : null
  );
  if (!note && !action) return null;
  return (
    <div className="fixed inset-x-0 bottom-0 z-30 border-t border-paper-border bg-white pt-3 lg:hidden" style={{ paddingBottom: "max(20px, env(safe-area-inset-bottom, 0px))" }}>
      <div className="mx-auto flex max-w-2xl flex-col gap-2 px-4">
        {note && <p className="text-center text-[13px] text-ink-muted">{note}</p>}
        {action}
      </div>
    </div>
  );
}
