"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import type { Issue } from "@/lib/restaurant-posts/check";
import { readJsonSafe } from "@/lib/fetch-json";
import { ghostBtn, linkBtn, primaryBtn } from "./ui";

// « Avant la publication » (ADR 0112, maquette) : ce qui partira tout seul et quand, l'article tel que les clients le
// liront, d'où viennent les informations, puis « Ne pas publier », « Modifier », « Autre version », « Publier
// maintenant ». Le serveur revérifie tout à chaque geste.

type Action = "refuse" | "variant" | "publish";

export function AutoReview({ restaurantId, postId, revision, when, issues, hasPhotos, modified, sources, preview }: {
  restaurantId: string;
  postId: string;
  revision: number;
  /** « demain à 10:00 » */
  when: string;
  issues: Issue[];
  hasPhotos: boolean;
  modified: boolean;
  sources: string[];
  preview: React.ReactNode;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState<Action | null>(null);
  const [confirm, setConfirm] = useState<"refuse" | "variant" | null>(null);
  const [rights, setRights] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const base = `/admin/${restaurantId}/articles`;
  const canPublishNow = issues.length === 0 && (!hasPhotos || rights) && busy === null;

  async function act(action: Action) {
    setBusy(action);
    setError(null);
    try {
      const res = await fetch(`/api/admin/restaurant-posts/${postId}/${action}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ restaurantId, revision, rightsConfirmed: rights }),
      });
      if (!res.ok) {
        const { data } = await readJsonSafe<{ error?: string; issues?: Issue[] }>(res);
        setError([data?.error ?? "Ça n'a pas marché. Réessaie.", ...(data?.issues ?? []).map((i) => i.message)].join(" "));
        setBusy(null);
        setConfirm(null);
        return; // pas de rechargement : l'article a pu être écarté, le message doit rester lisible

      }
      if (action === "variant") {
        setBusy(null);
        setConfirm(null);
      } else router.push(base);
      router.refresh();
    } catch {
      setError("Ça n'a pas marché. Vérifie ta connexion et réessaie.");
      setBusy(null);
    }
  }

  return (
    <div className="space-y-4">
      {issues.length > 0 ? (
        <div role="alert" className="space-y-1 rounded-lg border border-warn/40 bg-warn/10 px-4 py-3 text-[15px] text-ink">
          <p className="font-semibold">Il ne sera pas publié tant que ceci n&apos;est pas corrigé</p>
          {issues.map((i) => <p key={i.message} className="break-words">{i.message}</p>)}
        </div>
      ) : hasPhotos ? (
        <p role="status" className="rounded-lg bg-warn/10 px-4 py-3 text-[15px] font-semibold text-ink">
          Avec une photo, il ne partira pas tout seul : publie-le toi-même.
        </p>
      ) : (
        <p role="status" className="rounded-lg bg-boost-olive/10 px-4 py-3 text-[15px] font-semibold text-ink">Publié {when} si tu ne dis rien</p>
      )}

      {preview}

      <div className="space-y-1.5 rounded-lg bg-paper-subtle px-4 py-3 text-[13px] text-ink">
        <p className="text-[15px] font-semibold">D&apos;où viennent les informations</p>
        {sources.map((s) => <p key={s}>{s}</p>)}
      </div>

      {hasPhotos && (
        <label className="flex min-h-[44px] cursor-pointer items-start gap-3 py-1 text-[15px] text-ink">
          <input type="checkbox" checked={rights} onChange={(e) => setRights(e.target.checked)} className="h-6 w-6 shrink-0 accent-boost-olive" />
          <span>J&apos;ai le droit d&apos;utiliser ces photos et les personnes reconnaissables sont d&apos;accord.</span>
        </label>
      )}

      {error && (
        <div role="alert" className="rounded-lg bg-danger/10 px-3 py-2 text-[15px] text-danger">
          <p className="break-words">{error}</p>
          <Link href={base} className={linkBtn}>Revenir à Mes articles</Link>
        </div>
      )}

      {confirm === "refuse" ? (
        <div className="space-y-2 rounded-lg border border-paper-border bg-white p-3">
          <p className="text-[15px] text-ink">Ne pas publier cet article ? Il ne partira pas.</p>
          <button type="button" onClick={() => void act("refuse")} disabled={busy !== null} className={`${ghostBtn} !border-danger !text-danger`}>
            {busy === "refuse" ? "Un instant..." : "Oui, ne pas publier"}
          </button>
          <button type="button" onClick={() => setConfirm(null)} disabled={busy !== null} className={ghostBtn}>Garder l&apos;article</button>
        </div>
      ) : (
        <button type="button" onClick={() => setConfirm("refuse")} disabled={busy !== null} className={ghostBtn}>Ne pas publier</button>
      )}

      {confirm === "variant" ? (
        <div className="space-y-2 rounded-lg border border-paper-border bg-white p-3">
          <p className="text-[15px] text-ink">Une autre version remplace tes changements.</p>
          <button type="button" onClick={() => void act("variant")} disabled={busy !== null} className={ghostBtn}>
            {busy === "variant" ? "Un instant..." : "Remplacer mon texte"}
          </button>
          <button type="button" onClick={() => setConfirm(null)} disabled={busy !== null} className={ghostBtn}>Garder mon texte</button>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-2">
          <Link href={`${base}/${postId}`} className={ghostBtn}>Modifier</Link>
          <button type="button" onClick={() => (modified ? setConfirm("variant") : void act("variant"))} disabled={busy !== null} className={ghostBtn}>
            {busy === "variant" ? "Un instant..." : "Autre version"}
          </button>
        </div>
      )}

      <button type="button" onClick={() => void act("publish")} disabled={!canPublishNow} className={primaryBtn}>
        {busy === "publish" ? "Publication..." : "Publier maintenant"}
      </button>
      <p className="text-[13px] text-ink-muted">Ton restaurant est responsable de ce qu&apos;il publie. Publier n&apos;envoie aucun message à tes clients.</p>
    </div>
  );
}
