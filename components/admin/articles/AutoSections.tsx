import Link from "next/link";
import { Card } from "@/components/admin/ui";
import type { MissedItem, UpcomingItem } from "@/lib/restaurant-posts/auto/overview";
import { ghostBtn, linkBtn, sectionTitle } from "./ui";

// La publication automatique dans « Mes articles » (ADR 0112, maquette) : le bandeau qui dit si elle est allumée, ce
// qui sera bientôt publié, et ce qui n'est pas paru avec sa raison.

export function AutoBanner({ restaurantId, active }: { restaurantId: string; active: boolean }) {
  return (
    <div className={`flex items-center justify-between gap-3 rounded-lg px-4 py-2 ${active ? "bg-boost-olive/10" : "border border-paper-border bg-white"}`}>
      <b className="text-[15px] font-semibold text-ink">{active ? "Publication automatique activée" : "Publication automatique éteinte"}</b>
      <Link href={`/admin/${restaurantId}/articles/automatique`} className={`${linkBtn} shrink-0`}>{active ? "Régler" : "Activer"}</Link>
    </div>
  );
}

export function UpcomingList({ restaurantId, items, canWrite }: { restaurantId: string; items: UpcomingItem[]; canWrite: boolean }) {
  return (
    <section className="space-y-3">
      <h2 className={sectionTitle}>Bientôt publiés</h2>
      {items.length === 0 ? (
        <p className="text-[15px] text-ink-muted">Rien pour l&apos;instant. On regarde les occasions chaque jour à 17:00.</p>
      ) : (
        <ul className="space-y-3">
          {items.map((it) => (
            <li key={it.occasionId}>
              <Card padding="p-4" className={`space-y-2 ${it.postId ? "!border-2 !border-boost-olive" : ""}`}>
                <p className={`text-[13px] font-semibold ${it.postId ? "text-boost-olive-dark" : "text-ink-body"}`}>{it.when}</p>
                <h3 className="break-words text-[15px] font-semibold text-ink">{it.title}</h3>
                <p className="break-words text-[13px] text-ink-muted">{it.line}</p>
                {it.postId && canWrite && (
                  <Link href={`/admin/${restaurantId}/articles/${it.postId}/apercu`} className={ghostBtn}>Lire ou ne pas publier</Link>
                )}
              </Card>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

export function MissedList({ items }: { items: MissedItem[] }) {
  if (items.length === 0) return null;
  return (
    <section className="space-y-3">
      <h2 className={sectionTitle}>Pas publiés</h2>
      <Card padding="p-0">
        <ul>
          {items.map((it, i) => (
            <li key={it.id} className={`px-4 py-3 ${i > 0 ? "border-t border-paper-border" : ""}`}>
              <p className="break-words text-[15px] font-semibold text-ink">{it.label}</p>
              <p className="break-words text-[13px] text-ink-muted">{it.reason}</p>
            </li>
          ))}
        </ul>
      </Card>
    </section>
  );
}
