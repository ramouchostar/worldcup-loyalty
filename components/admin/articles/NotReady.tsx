import { Card } from "@/components/admin/ui";

// ADR 0111 — « Tables absentes : le bloc client est caché et la console le dit. »

export function NotReady() {
  return (
    <Card padding="p-4">
      <p className="text-[15px] font-semibold text-ink">Les articles ne sont pas encore activés.</p>
      <p className="mt-1 text-[13px] text-ink-muted">L&apos;installation n&apos;est pas terminée de notre côté : rien ne peut être écrit ni publié pour l&apos;instant, et tes clients ne voient rien.</p>
      <p className="mt-2 text-[13px] text-ink-muted">Détail pour l&apos;équipe : migration 20261126-1300-restaurant-posts à appliquer.</p>
    </Card>
  );
}
