"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { readJsonSafe } from "@/lib/fetch-json";
import { euro } from "@/lib/site-orders/cart";
import { LIMITS, type PostBlock, type PostBlockType } from "@/lib/restaurant-posts/types";
import { resizePhoto } from "./resize-photo";
import { ghostBtn, inputCls, labelCls, linkBtn, primaryBtn } from "./ui";

// « Écrire un article » (ADR 0111 §4, maquette) : un titre, des blocs (paragraphe, intertitre, liste, photo, plat de la
// carte), « Voir avant de publier » ou « Garder en brouillon ». Rien n'est public ici : seul l'aperçu porte « Oui, publier ».

export type DishOption = { id: string; name: string; priceCents: number; category: string };

type Draft = { key: number } & (
  | { type: "p" | "h2"; text: string }
  | { type: "ul"; text: string }
  | { type: "photo"; path: string; alt: string }
  | { type: "dish"; itemId: string }
);

const toDraft = (b: PostBlock, key: number): Draft => (b.type === "ul" ? { key, type: "ul", text: b.items.join("\n") } : { key, ...b });
const toBlock = (d: Draft): PostBlock =>
  d.type === "ul" ? { type: "ul", items: d.text.split("\n").map((x) => x.trim()).filter(Boolean) }
  : d.type === "photo" ? { type: "photo", path: d.path, alt: d.alt }
  : d.type === "dish" ? { type: "dish", itemId: d.itemId }
  : { type: d.type, text: d.text };

const BLOCK_LABEL: Record<PostBlockType, string> = { p: "Paragraphe", h2: "Intertitre", ul: "Liste", photo: "Photo", dish: "Plat de la carte" };

export type EditorProps = {
  restaurantId: string;
  postId: string | null;
  revision: number;
  initialTitle: string;
  initialBlocks: PostBlock[];
  photoUrls: Record<string, string>;
  dishes: DishOption[];
  /** L'article est en ligne : on rappelle que la version publiée ne bouge pas. */
  online: boolean;
  maskReason: string | null;
};

export function PostEditor(props: EditorProps) {
  const { restaurantId, dishes } = props;
  const router = useRouter();
  const nextKey = useRef(props.initialBlocks.length);
  const saved = useRef<{ id: string | null; revision: number }>({ id: props.postId, revision: props.revision });
  const [title, setTitle] = useState(props.initialTitle);
  const [blocks, setBlocks] = useState<Draft[]>(() => props.initialBlocks.map(toDraft));
  const [urls, setUrls] = useState(props.photoUrls);
  const [busy, setBusy] = useState<null | "save" | "photo">(null);
  const [error, setError] = useState<string | null>(null);
  const [dirty, setDirty] = useState(false);
  const file = useRef<HTMLInputElement>(null);
  const base = `/admin/${restaurantId}`;

  // Quitter la page avec un texte non gardé : le navigateur prévient.
  useEffect(() => {
    if (!dirty) return;
    const warn = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  const change = (key: number, patch: Partial<{ text: string; alt: string; itemId: string }>) => {
    setBlocks((all) => all.map((b) => (b.key === key ? ({ ...b, ...patch } as Draft) : b)));
    setDirty(true);
  };
  const remove = (key: number) => {
    setBlocks((all) => all.filter((b) => b.key !== key));
    setDirty(true);
  };
  const add = (type: Exclude<PostBlockType, "photo">) => {
    const key = nextKey.current++;
    setBlocks((all) => [...all, type === "dish" ? { key, type, itemId: "" } : { key, type, text: "" }]);
    setDirty(true);
  };

  /** Garde le brouillon sur le serveur (le crée la première fois). `null` : le message d'erreur est à l'écran. */
  async function save(current: Draft[] = blocks): Promise<string | null> {
    const { id, revision } = saved.current;
    const content = { title, blocks: current.map(toBlock) };
    try {
      const res = await fetch(id ? `/api/admin/restaurant-posts/${id}` : "/api/admin/restaurant-posts", {
        method: id ? "PUT" : "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ restaurantId, revision, content }),
      });
      const { data } = await readJsonSafe<{ post?: { id: string; revision: number }; error?: string }>(res);
      if (!res.ok || !data?.post) {
        setError(data?.error ?? "Ton brouillon n'a pas pu être gardé. Réessaie.");
        return null;
      }
      saved.current = data.post;
      // Un rechargement de la page rouvre CE brouillon, sans démonter l'écran.
      if (!id) window.history.replaceState(null, "", `${base}/articles/${data.post.id}`);
      setDirty(false);
      return data.post.id;
    } catch {
      setError("Ton brouillon n'a pas pu être gardé. Vérifie ta connexion et réessaie.");
      return null;
    }
  }

  async function saveAnd(then: "apercu" | "liste") {
    setBusy("save");
    setError(null);
    const id = await save();
    if (!id) { setBusy(null); return; }
    router.push(then === "apercu" ? `${base}/articles/${id}/apercu` : `${base}/articles`);
    router.refresh();
  }

  async function addPhoto(picked: File) {
    setBusy("photo");
    setError(null);
    try {
      const resized = await resizePhoto(picked);
      if (!resized.ok) { setError(resized.error); return; }
      // La photo a besoin d'un article où se ranger : le brouillon est gardé d'abord.
      const id = saved.current.id ?? (await save());
      if (!id) return;
      const form = new FormData();
      form.set("restaurantId", restaurantId);
      form.set("file", resized.file);
      const res = await fetch(`/api/admin/restaurant-posts/${id}/photos`, { method: "POST", body: form });
      const { data } = await readJsonSafe<{ path?: string; url?: string | null; error?: string }>(res);
      if (!res.ok || !data?.path) { setError(data?.error ?? "La photo n'est pas partie. Réessaie."); return; }
      const path = data.path;
      if (data.url) setUrls((u) => ({ ...u, [path]: data.url as string }));
      setBlocks((all) => [...all, { key: nextKey.current++, type: "photo", path, alt: "" }]);
      setDirty(true);
    } catch {
      setError("La photo n'est pas partie. Vérifie ta connexion et réessaie.");
    } finally {
      setBusy(null);
    }
  }

  const full = blocks.length >= LIMITS.blocks;
  const photosFull = blocks.filter((b) => b.type === "photo").length >= LIMITS.photos;
  const categories = [...new Set(dishes.map((d) => d.category))];

  return (
    <div className="space-y-4">
      {props.maskReason !== null && (
        <p role="status" className="rounded-lg bg-danger/10 px-3 py-2 text-[13px] text-danger">
          <strong className="font-semibold">Boosteats a masqué cet article :</strong> {props.maskReason}
        </p>
      )}
      {props.online && <p className="text-[13px] text-ink-muted">Cet article est en ligne. Tes clients lisent l&apos;ancienne version tant que tu n&apos;as pas dit « Oui, publier ».</p>}

      <div>
        <label className={labelCls} htmlFor="titre">Titre</label>
        <input id="titre" className={inputCls} maxLength={LIMITS.title} value={title} onChange={(e) => { setTitle(e.target.value); setDirty(true); }} />
        <p className="mt-1 text-[13px] text-ink-muted">{LIMITS.title} caractères au plus.</p>
      </div>

      {blocks.map((b, i) => {
        const id = `bloc-${b.key}`;
        const label = BLOCK_LABEL[b.type];
        return (
          <fieldset key={b.key} className="space-y-2 rounded-lg border border-paper-border bg-white p-3">
            <legend className="sr-only">Bloc {i + 1} : {label}</legend>
            <div className="flex items-center justify-between gap-2">
              {b.type === "photo" ? <span className="text-[15px] font-semibold text-ink">{label}</span> : <label htmlFor={id} className="text-[15px] font-semibold text-ink">{label}</label>}
              <button type="button" onClick={() => remove(b.key)} className={linkBtn} aria-label={`Retirer le bloc ${i + 1} (${label})`}>Retirer</button>
            </div>
            {b.type === "p" && <textarea id={id} rows={4} maxLength={LIMITS.paragraph} className={`${inputCls} resize-y`} value={b.text} onChange={(e) => change(b.key, { text: e.target.value })} />}
            {b.type === "h2" && <input id={id} maxLength={LIMITS.heading} className={inputCls} value={b.text} onChange={(e) => change(b.key, { text: e.target.value })} />}
            {b.type === "ul" && (
              <>
                <textarea id={id} rows={4} className={`${inputCls} resize-y`} value={b.text} onChange={(e) => change(b.key, { text: e.target.value })} aria-describedby={`${id}-aide`} />
                <p id={`${id}-aide`} className="text-[13px] text-ink-muted">Un point par ligne, {LIMITS.listItems} au plus.</p>
              </>
            )}
            {b.type === "photo" && (
              <>
                {urls[b.path] ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={urls[b.path]} alt={b.alt} className="max-h-80 w-full rounded-lg bg-paper-subtle object-contain" />
                ) : (
                  <p className="rounded-lg bg-paper-subtle p-4 text-center text-[13px] text-ink-muted">La photo ne s&apos;affiche pas pour le moment.</p>
                )}
                <div>
                  <label className={labelCls} htmlFor={id}>Ce qu&apos;on voit sur la photo</label>
                  <input id={id} maxLength={LIMITS.alt} className={inputCls} value={b.alt} onChange={(e) => change(b.key, { alt: e.target.value })} />
                </div>
              </>
            )}
            {b.type === "dish" && (
              <>
                <select id={id} className={inputCls} value={b.itemId} onChange={(e) => change(b.key, { itemId: e.target.value })}>
                  <option value="">Choisis un plat</option>
                  {b.itemId !== "" && !dishes.some((d) => d.id === b.itemId) && <option value={b.itemId}>Plat qui n&apos;est plus proposé</option>}
                  {categories.map((c) => (
                    <optgroup key={c} label={c}>
                      {dishes.filter((d) => d.category === c).map((d) => <option key={d.id} value={d.id}>{d.name} ({euro(d.priceCents)})</option>)}
                    </optgroup>
                  ))}
                </select>
                <p className="text-[13px] text-ink-muted">
                  {dishes.length === 0 ? "Aucun plat proposé à la commande n'a pu être lu." : "Le nom et le prix viennent de ta carte. Un plat retiré de la carte disparaît de l'article."}
                </p>
              </>
            )}
          </fieldset>
        );
      })}

      <div>
        <p className="mb-2 text-[15px] font-semibold text-ink">Ajouter</p>
        <div className="flex flex-wrap gap-2">
          {(["p", "h2", "ul", "photo", "dish"] as const).map((type) => (
            <button
              key={type}
              type="button"
              disabled={full || busy !== null || (type === "photo" && photosFull)}
              onClick={() => (type === "photo" ? file.current?.click() : add(type))}
              className="min-h-[44px] rounded-full border border-ink-faint bg-white px-4 text-[15px] text-ink hover:bg-paper-subtle focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink disabled:cursor-not-allowed disabled:opacity-50"
            >
              {type === "photo" && busy === "photo" ? "Envoi de la photo..." : BLOCK_LABEL[type]}
            </button>
          ))}
        </div>
        <p className="mt-2 text-[13px] text-ink-muted">
          {full ? `Ton article a ${LIMITS.blocks} blocs, c'est le maximum.` : photosFull ? `${LIMITS.photos} photos au plus par article.` : `${LIMITS.blocks} blocs et ${LIMITS.photos} photos au plus.`}
        </p>
        <input
          ref={file}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          className="sr-only"
          tabIndex={-1}
          aria-label="Choisir une photo"
          onChange={(e) => {
            const picked = e.target.files?.[0];
            e.target.value = "";
            if (picked) void addPhoto(picked);
          }}
        />
      </div>

      {error && <p role="alert" className="rounded-lg bg-danger/10 px-3 py-2 text-[15px] text-danger">{error}</p>}

      <button type="button" onClick={() => void saveAnd("apercu")} disabled={busy !== null} className={primaryBtn}>Voir avant de publier</button>
      <button type="button" onClick={() => void saveAnd("liste")} disabled={busy !== null} className={ghostBtn}>{busy === "save" ? "Un instant..." : "Garder en brouillon"}</button>
    </div>
  );
}
