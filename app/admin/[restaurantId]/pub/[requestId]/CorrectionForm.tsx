"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { askUpload, correct } from "../actions";

type Post = { id: string; mediaType: "IMAGE" | "VIDEO" | "CAROUSEL_ALBUM"; likes: number; thumbnail: string | null; permalink: string | null };

// Après « Renvoyer » : nouveau texte et/ou nouvelle publication, puis la pub repart en vérification.
export function CorrectionForm({ restaurantId, requestId, needsVideo, initialText, posts }: { restaurantId: string; requestId: string; needsVideo: boolean; initialText: string; posts: Post[] }) {
  const router = useRouter();
  const [adText, setAdText] = useState(initialText);
  const [postId, setPostId] = useState<string | null>(null);
  const [upload, setUpload] = useState<{ path: string; mime: string; name: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const shown = needsVideo ? posts.filter((x) => x.mediaType === "VIDEO") : posts;

  async function onFile(f: File | null) {
    if (!f) return;
    const asked = await askUpload(restaurantId, f.type, f.size);
    if (!asked.ok) return setError(asked.error);
    const form = new FormData();
    form.append("cacheControl", "3600");
    form.append("", f);
    const sent = await fetch(asked.uploadUrl, { method: "PUT", body: form }).catch(() => null);
    if (!sent?.ok) return setError("L'envoi a été coupé, réessaie.");
    setUpload({ path: asked.path, mime: f.type, name: f.name });
    setPostId(null);
  }

  return (
    <div className="space-y-3">
      <label className="block text-[13px] text-ink-body">
        Texte de la pub
        <textarea value={adText} onChange={(e) => setAdText(e.target.value)} maxLength={500} rows={3} className="mt-1 block w-full rounded-lg border border-paper-border bg-white px-3 py-2.5 text-[15px] text-ink" />
      </label>
      <p className="text-[13px] text-ink-muted">Changer de publication (facultatif)</p>
      <div className="grid grid-cols-4 gap-1.5">
        {shown.map((x) => (
          <button key={x.id} type="button" aria-pressed={postId === x.id} onClick={() => { setPostId(x.id); setUpload(null); }} className={`relative aspect-[4/5] overflow-hidden rounded-lg bg-paper-subtle ${postId === x.id ? "ring-4 ring-boost-olive" : ""}`}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            {x.thumbnail && <img src={x.thumbnail} alt="" className="absolute inset-0 h-full w-full object-cover" />}
            <span className="sr-only">{x.mediaType === "VIDEO" ? "Vidéo" : "Photo"}, {x.likes} J&apos;aime</span>
          </button>
        ))}
        <label className={`flex aspect-[4/5] cursor-pointer items-center justify-center rounded-lg border border-dashed border-ink-faint bg-white p-1 text-center text-[11px] font-semibold text-ink ${upload ? "ring-4 ring-boost-olive" : ""}`}>
          <input type="file" className="sr-only" accept={needsVideo ? "video/mp4,video/quicktime" : "image/jpeg,image/png,image/webp,video/mp4,video/quicktime"} onChange={(e) => onFile(e.target.files?.[0] ?? null)} />
          {upload ? `✓ ${upload.name}` : "Envoyer un fichier"}
        </label>
      </div>
      {error && <p className="text-[13px] font-semibold text-danger" role="alert">{error}</p>}
      <button
        type="button"
        disabled={pending}
        className="w-full rounded-lg bg-boost-olive px-4 py-3 text-[14px] font-semibold text-white hover:bg-boost-olive-dark disabled:opacity-50"
        onClick={() =>
          start(async () => {
            setError(null);
            const post = posts.find((x) => x.id === postId);
            const creative = upload ? { kind: "upload", path: upload.path, mime: upload.mime } : post ? { kind: "instagram_post", mediaId: post.id, mediaType: post.mediaType, permalink: post.permalink, thumbnail: post.thumbnail } : undefined;
            const r = await correct(restaurantId, requestId, { adText, creative });
            if (!r.ok) return setError(r.error ?? "Réessaie.");
            router.refresh();
          })
        }
      >
        {pending ? "Envoi…" : "Envoyer ma retouche"}
      </button>
    </div>
  );
}
