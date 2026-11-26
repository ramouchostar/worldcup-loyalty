"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Card, StatusBadge } from "@/components/admin/ui";
import { readJsonSafe } from "@/lib/fetch-json";
import { STATUS_LABEL } from "@/lib/restaurant-posts/states";
import type { PostStatus } from "@/lib/restaurant-posts/types";
import { ghostBtn, linkBtn } from "./ui";

// « Mes articles » (ADR 0111, maquette) : suivre, copier le lien, modifier, retirer, supprimer. Les compteurs ne disent
// rien des lecteurs. Un article masqué montre le motif écrit par Boosteats.

export type PostListItem = {
  id: string;
  status: PostStatus;
  title: string;
  slug: string;
  publishedLabel: string | null;
  updatedLabel: string;
  withdrawnLabel: string | null;
  /** `null` : les compteurs ne se lisent pas. */
  totals: { reads: number; menuTaps: number } | null;
  pending: boolean;
  maskReason: string | null;
};

const n = (v: number, one: string, many: string) => `${v.toLocaleString("fr-BE")} ${v > 1 ? many : one}`;

export function PostsList({ restaurantId, posts, canWrite }: { restaurantId: string; posts: PostListItem[]; canWrite: boolean }) {
  return (
    <ul className="space-y-3">
      {posts.map((p) => (
        <li key={p.id}><PostCardAdmin restaurantId={restaurantId} post={p} canWrite={canWrite} /></li>
      ))}
    </ul>
  );
}

function PostCardAdmin({ restaurantId, post, canWrite }: { restaurantId: string; post: PostListItem; canWrite: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState<"idle" | "ok" | "fail">("idle");
  const [confirmDelete, setConfirmDelete] = useState(false);
  const edit = `/admin/${restaurantId}/articles/${post.id}`;
  const title = post.title || "Sans titre";
  const publicPath = `/commander/${restaurantId}/articles/${post.slug}`;

  async function act(url: string, init: RequestInit) {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(url, init);
      if (!res.ok) {
        const { data } = await readJsonSafe<{ error?: string }>(res);
        setError(data?.error ?? "Ça n'a pas marché. Réessaie.");
      } else router.refresh();
    } catch {
      setError("Ça n'a pas marché. Vérifie ta connexion et réessaie.");
    } finally {
      setBusy(false);
    }
  }

  const withdraw = () =>
    act(`/api/admin/restaurant-posts/${post.id}/withdraw`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ restaurantId }) });
  const remove = () => act(`/api/admin/restaurant-posts/${post.id}?restaurantId=${encodeURIComponent(restaurantId)}`, { method: "DELETE" });

  async function copy() {
    try {
      await navigator.clipboard.writeText(`${window.location.origin}${publicPath}`);
      setCopied("ok");
    } catch {
      setCopied("fail"); // l'adresse s'affiche alors, à copier à la main : jamais un échec muet
    }
  }

  const line =
    post.status === "en_ligne"
      ? `Publié le ${post.publishedLabel}. ${post.totals ? `${n(post.totals.reads, "lecture", "lectures")}, ${n(post.totals.menuTaps, "retour vers la carte", "retours vers la carte")}.` : "Les lectures n'ont pas pu être lues."}`
      : post.status === "retire"
        ? `Retiré${post.withdrawnLabel ? ` le ${post.withdrawnLabel}` : ""}. Tes clients ne le voient plus.`
        : post.status === "masque"
          ? "Tes clients ne le voient plus."
          : `Brouillon, modifié le ${post.updatedLabel}.`;

  return (
    <Card padding="p-4" className="space-y-3">
      {post.status !== "brouillon" && (
        <StatusBadge tone={post.status === "en_ligne" ? "good" : post.status === "masque" ? "danger" : "neutral"}>{STATUS_LABEL[post.status]}</StatusBadge>
      )}
      <div>
        <h2 className="break-words text-[15px] font-semibold text-ink">{title}</h2>
        <p className="text-[13px] text-ink-muted">{line}</p>
        {post.pending && <p className="mt-1 text-[13px] text-warn">Des changements attendent ton « Oui, publier ». Tes clients lisent encore l&apos;ancienne version.</p>}
      </div>
      {post.status === "masque" && (
        <p className="rounded-lg bg-danger/10 px-3 py-2 text-[13px] text-danger">
          <strong className="font-semibold">Motif de Boosteats :</strong> {post.maskReason ?? "non précisé"}
        </p>
      )}
      {post.status === "en_ligne" && (
        <>
          <button type="button" onClick={() => void copy()} className={ghostBtn}>{copied === "ok" ? "Lien copié" : "Copier le lien"}</button>
          {copied === "fail" && (
            <label className="block text-[13px] text-ink-muted">
              La copie n&apos;a pas marché. Voici l&apos;adresse à copier :
              <input readOnly value={publicPath} onFocus={(e) => e.currentTarget.select()} className="mt-1 block min-h-[44px] w-full rounded-lg border border-ink-faint bg-white px-3 text-[13px] text-ink" />
            </label>
          )}
        </>
      )}
      {canWrite && (
        <>
          <Link href={edit} className={ghostBtn}>{post.status === "en_ligne" || post.status === "masque" ? "Modifier" : "Reprendre"}</Link>
          {post.status === "en_ligne" && (
            <button type="button" onClick={() => void withdraw()} disabled={busy} className={ghostBtn}>Retirer de la page</button>
          )}
          {confirmDelete ? (
            <div className="space-y-2 rounded-lg border border-paper-border p-3">
              <p className="text-[15px] text-ink">Supprimer cet article et ses photos ? On ne pourra pas les retrouver.</p>
              <button type="button" onClick={() => void remove()} disabled={busy} className={`${ghostBtn} !border-danger !text-danger`}>Oui, supprimer</button>
              <button type="button" onClick={() => setConfirmDelete(false)} disabled={busy} className={ghostBtn}>Garder l&apos;article</button>
            </div>
          ) : (
            <button type="button" onClick={() => setConfirmDelete(true)} className={linkBtn}>Supprimer</button>
          )}
        </>
      )}
      {error && <p role="alert" className="text-[13px] text-danger">{error}</p>}
    </Card>
  );
}
