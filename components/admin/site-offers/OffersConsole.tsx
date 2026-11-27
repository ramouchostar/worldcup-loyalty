"use client";

import { useCallback, useEffect, useState } from "react";
import { Card, PageHeader } from "@/components/admin/ui";
import { readJsonSafe } from "@/lib/fetch-json";
import type { ConsoleOffer } from "@/lib/site-offers/console";
import { MAX_AT_ONCE } from "@/lib/site-offers/offers";
import { ghostButton, primaryButton } from "../site-orders/info-ui";
import { OfferForm, emptyDraft, draftFrom, type OfferDraft } from "./OfferForm";
import { OfferPreview } from "./OfferPreview";
import { OfferCard } from "./OfferCard";

// ADR 0110 — « Offres de ta page » : suivre et arrêter, écrire, voir l'aperçu et dire « Oui ». Maquette validée le 2026-11-26.

export type OffersData = { activated: boolean; canWrite: boolean; today: string; offers: ConsoleOffer[]; dishes: { id: string; name: string }[] };

type View = { screen: "liste" } | { screen: "saisie"; draft: OfferDraft } | { screen: "apercu"; id: string };

export function OffersConsole({ restaurantId }: { restaurantId: string }) {
  const [data, setData] = useState<OffersData | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [view, setView] = useState<View>({ screen: "liste" });
  const [notice, setNotice] = useState<string | null>(null);

  const load = useCallback(async (): Promise<OffersData | null> => {
    try {
      const res = await fetch(`/api/admin/site-orders/offers?restaurantId=${encodeURIComponent(restaurantId)}`, { cache: "no-store" });
      const { data } = await readJsonSafe<OffersData & { error?: string }>(res);
      if (!res.ok || !data?.offers) { setLoadError(data?.error ?? "Tes offres n'ont pas pu être lues."); return null; }
      setData(data);
      setLoadError(null);
      return data;
    } catch {
      setLoadError("Tes offres n'ont pas pu être lues. Vérifie ta connexion.");
      return null;
    }
  }, [restaurantId]);

  useEffect(() => { void load(); }, [load]);

  /** Un geste : `null` s'il a réussi (avec l'offre concernée), sinon la phrase à montrer. */
  const send = useCallback(async (body: Record<string, unknown>): Promise<{ error: string } | { id: string | null }> => {
    try {
      const res = await fetch("/api/admin/site-orders/offers", {
        method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ restaurantId, ...body }),
      });
      const { data } = await readJsonSafe<{ id?: string; error?: string }>(res);
      return res.ok ? { id: data?.id ?? null } : { error: data?.error ?? "Rien n'a été enregistré. Réessaie." };
    } catch {
      return { error: "Rien n'a été enregistré. Vérifie ta connexion et réessaie." };
    }
  }, [restaurantId]);

  const show = (next: View) => { setNotice(null); setView(next); window.scrollTo(0, 0); };

  if (!data) {
    return loadError ? (
      <Card>
        <p role="alert" className="text-[15px] text-ink">{loadError}</p>
        <button type="button" onClick={() => void load()} className={`${ghostButton} mt-3`}>Réessayer</button>
      </Card>
    ) : <p className="text-[15px] text-ink-muted">Lecture de tes offres…</p>;
  }

  if (view.screen === "saisie") {
    return (
      <OfferForm
        initial={view.draft}
        dishes={data.dishes}
        today={data.today}
        onBack={() => show({ screen: "liste" })}
        onSave={async (draft, then) => {
          const r = await send({ action: "save", id: draft.id, copiedFrom: draft.copiedFrom, offer: draft.fields });
          if ("error" in r) return r.error;
          await load();
          if (then === "apercu" && r.id) show({ screen: "apercu", id: r.id });
          else { show({ screen: "liste" }); setNotice("Gardée en brouillon : tes clients ne la voient pas."); }
          return null;
        }}
      />
    );
  }

  const previewed = view.screen === "apercu" ? data.offers.find((o) => o.id === view.id) : undefined;
  if (previewed) {
    return (
      <OfferPreview
        offer={previewed}
        onEdit={() => show({ screen: "saisie", draft: draftFrom(previewed, "modifier") })}
        onLater={() => show({ screen: "liste" })}
        onPublish={async () => {
          const r = await send({ action: "publish", id: previewed.id, teamConfirmed: true });
          if ("error" in r) return r.error;
          await load();
          show({ screen: "liste" });
          setNotice("Offre publiée : tes clients la voient les jours choisis.");
          return null;
        }}
      />
    );
  }

  return (
    <div className="space-y-4">
      <PageHeader title="Offres de ta page" subtitle={`${MAX_AT_ONCE} en même temps au plus.`} />
      {!data.activated ? (
        <p role="status" className="rounded-xl border border-paper-border bg-paper-subtle p-4 text-[15px] text-ink">Les offres ne sont pas encore activées. Ta page de commande reste comme avant.</p>
      ) : (
        <>
          {loadError && <p role="alert" className="rounded-xl border border-danger bg-white p-4 text-[15px] text-danger">{loadError}</p>}
          {notice && <p role="status" className="rounded-xl border border-paper-border bg-white p-4 text-[15px] font-semibold text-good">{notice}</p>}
          {data.canWrite ? (
            <button type="button" onClick={() => show({ screen: "saisie", draft: emptyDraft() })} className={`${primaryButton} w-full`}>Écrire une offre</button>
          ) : (
            <p className="text-[15px] text-ink-muted">Le gérant ou le manager écrit les offres. Tu peux en arrêter une tout de suite.</p>
          )}
          {data.offers.length === 0 && <p className="text-[15px] text-ink-muted">Aucune offre pour le moment.</p>}
          <ul className="space-y-4">
            {data.offers.map((o) => (
              <li key={o.id}>
                <OfferCard
                  offer={o}
                  canWrite={data.canWrite}
                  menuHref={`/admin/${restaurantId}/menu`}
                  onEdit={() => show({ screen: "saisie", draft: draftFrom(o, "modifier") })}
                  onPreview={() => show({ screen: "apercu", id: o.id })}
                  onCopy={() => show({ screen: "saisie", draft: draftFrom(o, "reprendre") })}
                  onStop={async (reason) => {
                    const r = await send({ action: "stop", id: o.id, reason });
                    if ("error" in r) return r.error;
                    await load();
                    setNotice("Offre arrêtée : tes clients ne la voient plus.");
                    return null;
                  }}
                />
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}
