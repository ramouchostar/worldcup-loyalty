"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { readJsonSafe } from "@/lib/fetch-json";
import type { Issue } from "@/lib/restaurant-posts/check";
import { ghostBtn, linkBtn, primaryBtn } from "./ui";

// L'écran « approuver » (ADR 0111 §3, §5, §7, maquette) : l'aperçu, ce qui bloque, la case des droits sur les photos,
// « Oui, publier ». Le bouton reste éteint tant qu'un point est à corriger ; le serveur recontrôle de toute façon.

type Check = { state: "loading" } | { state: "failed"; error: string } | { state: "done"; issues: Issue[]; revision: number };

export type ReviewProps = {
  restaurantId: string;
  postId: string;
  /** La version du brouillon montrée sur cet écran. */
  revision: number;
  hasPhotos: boolean;
  maskReason: string | null;
};

export function PublishReview({ restaurantId, postId, revision, hasPhotos, maskReason, summary, full }: ReviewProps & { summary: React.ReactNode; full: React.ReactNode }) {
  const router = useRouter();
  const [check, setCheck] = useState<Check>({ state: "loading" });
  const [showFull, setShowFull] = useState(false);
  const [rights, setRights] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const base = `/admin/${restaurantId}/articles`;
  const asked = useRef(false);

  const runCheck = useCallback(async () => {
    setCheck({ state: "loading" });
    try {
      const res = await fetch(`/api/admin/restaurant-posts/${postId}/check`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ restaurantId }) });
      const { data } = await readJsonSafe<{ issues?: Issue[]; revision?: number; error?: string }>(res);
      if (!res.ok || !data?.issues || typeof data.revision !== "number") {
        setCheck({ state: "failed", error: data?.error ?? "Le contrôle n'a pas pu se faire." });
        return;
      }
      setCheck({ state: "done", issues: data.issues, revision: data.revision });
    } catch {
      setCheck({ state: "failed", error: "Le contrôle n'a pas pu se faire. Vérifie ta connexion." });
    }
  }, [restaurantId, postId]);

  useEffect(() => {
    if (asked.current || maskReason !== null) return;
    asked.current = true;
    void runCheck();
  }, [runCheck, maskReason]);

  // Le brouillon a changé depuis que cet écran a été montré : on ne publie pas ce qu'on n'a pas relu.
  const stale = check.state === "done" && check.revision !== revision;
  const issues = check.state === "done" ? check.issues : [];
  const ready = maskReason === null && check.state === "done" && !stale && issues.length === 0 && (!hasPhotos || rights) && !sending;

  async function publish() {
    if (!ready) return;
    setSending(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/restaurant-posts/${postId}/publish`, {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ restaurantId, revision, rightsConfirmed: rights }),
      });
      const { data } = await readJsonSafe<{ error?: string; issues?: Issue[] }>(res);
      if (!res.ok) {
        if (data?.issues) setCheck({ state: "done", issues: data.issues, revision });
        else setError(data?.error ?? "La publication n'a pas marché. Réessaie.");
        setSending(false);
        return;
      }
      router.push(base);
      router.refresh();
    } catch {
      setError("La publication n'a pas marché. Vérifie ta connexion et réessaie.");
      setSending(false);
    }
  }

  return (
    <div className="space-y-4">
      {showFull ? (
        <div className="space-y-4 rounded-lg border border-paper-border bg-white p-3">
          {full}
          <button type="button" onClick={() => setShowFull(false)} className={linkBtn}>Fermer l&apos;aperçu complet</button>
        </div>
      ) : (
        <div className="space-y-2 rounded-lg border border-paper-border bg-white p-3">
          {summary}
          <button type="button" onClick={() => setShowFull(true)} className={linkBtn}>Voir l&apos;aperçu complet</button>
        </div>
      )}

      {maskReason !== null && (
        <p role="status" className="rounded-lg bg-danger/10 px-3 py-2 text-[15px] text-danger">
          <strong className="font-semibold">Boosteats a masqué cet article :</strong> {maskReason}
        </p>
      )}
      {maskReason === null && check.state === "loading" && <p role="status" className="text-[15px] text-ink-muted">Relecture du texte...</p>}
      {check.state === "failed" && (
        <div role="alert" className="rounded-lg bg-warn/10 p-3 text-[15px] text-ink">
          <p>{check.error}</p>
          <button type="button" onClick={() => void runCheck()} className={linkBtn}>Réessayer</button>
        </div>
      )}
      {stale && (
        <div role="alert" className="rounded-lg bg-warn/10 p-3 text-[15px] text-ink">
          <p>Cet article a changé entre-temps.</p>
          <button type="button" onClick={() => window.location.reload()} className={linkBtn}>Recharger l&apos;aperçu</button>
        </div>
      )}
      {issues.length > 0 && !stale && (
        <div role="alert" className="space-y-1 rounded-lg border border-warn/40 bg-warn/10 p-3 text-[15px] text-ink">
          <p className="font-semibold">À corriger avant de publier</p>
          {issues.map((i) => <p key={i.message} className="break-words">{i.message}</p>)}
          <Link href={`${base}/${postId}`} className={linkBtn}>Corriger le texte</Link>
        </div>
      )}

      {hasPhotos && maskReason === null && (
        <label className="flex min-h-[44px] cursor-pointer items-start gap-3 py-1 text-[15px] text-ink">
          <input type="checkbox" checked={rights} onChange={(e) => setRights(e.target.checked)} className="mt-0.5 h-6 w-6 shrink-0 accent-boost-olive" />
          <span>J&apos;ai le droit d&apos;utiliser ces photos et les personnes reconnaissables sont d&apos;accord.</span>
        </label>
      )}

      {error && <p role="alert" className="rounded-lg bg-danger/10 px-3 py-2 text-[15px] text-danger">{error}</p>}

      <button type="button" onClick={() => void publish()} disabled={!ready} className={primaryBtn}>{sending ? "Publication..." : "Oui, publier"}</button>
      <Link href={base} className={ghostBtn}>Pas maintenant</Link>
      <p className="text-[13px] text-ink-muted">Ton restaurant est responsable de ce qu&apos;il publie. Publier n&apos;envoie aucun message à tes clients.</p>
    </div>
  );
}
