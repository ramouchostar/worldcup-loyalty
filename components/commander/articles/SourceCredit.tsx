import { creditParts } from "@/lib/restaurant-posts/credit";

// La mention de source sous un article d'occasion (ADR 0112 §9), avec les liens que la licence demande. Ils s'ouvrent
// à côté : le client ne perd pas la page de commande.

export function SourceCredit({ credit }: { credit: string }) {
  return (
    <p className="break-words text-[13px] text-ink-muted">
      {creditParts(credit).map((part, i) =>
        part.href ? (
          <a key={i} href={part.href} target="_blank" rel="noopener noreferrer" className="underline hover:text-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-ink">
            {part.text}
          </a>
        ) : (
          <span key={i}>{part.text}</span>
        ),
      )}
    </p>
  );
}
