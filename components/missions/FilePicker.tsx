"use client";

import { useId, useRef, useState } from "react";
import { FileText, Image as ImageIcon, Loader2, Paperclip, X } from "lucide-react";
import { ACCEPTED_TEXT, ACCEPT_ATTR, FILE_ISSUE_TEXT, humanSize, judgeUploadRequest, type AttachmentView, type FileIssue, type FileScope } from "@/lib/mission-files";

// ADR 0084 §3 règle 7 — joindre des fichiers. Le fichier ne passe pas par nos fonctions : on demande un lien d'envoi
// signé, on envoie directement dans l'espace privé, puis le serveur juge le CONTENU réel avant de l'accepter.
// Les formats et la taille sont aussi vérifiés ICI (avant d'envoyer un seul octet) avec les mêmes règles que le serveur.

type Item = AttachmentView & { state: "uploading" | "ready" | "error"; message?: string; key: string };

export function FilePicker({
  endpoint,
  extra,
  scope,
  initial,
  max,
  onChange,
  label = "Joindre des fichiers",
  disabled = false,
}: {
  /** Ex. `/api/admin/missions/<id>/files` : le même chemin sert à demander, confirmer (`/<fichier>/confirm`) et retirer. */
  endpoint: string;
  /** Champs ajoutés aux requêtes (le restaurateur y met son établissement). */
  extra?: Record<string, unknown>;
  scope: FileScope;
  initial?: AttachmentView[];
  max: number;
  /** Les fichiers PRÊTS (vérifiés par le serveur), à chaque changement. */
  onChange?: (ready: AttachmentView[]) => void;
  label?: string;
  disabled?: boolean;
}) {
  const input = useRef<HTMLInputElement>(null);
  const uid = useId();
  const [items, setItems] = useState<Item[]>((initial ?? []).map((f) => ({ ...f, state: "ready" as const, key: f.id })));
  const [error, setError] = useState<string | null>(null);

  function publish(next: Item[]) {
    setItems(next);
    onChange?.(next.filter((i) => i.state === "ready").map(({ id, name, size, family }) => ({ id, name, size, family })));
  }

  async function post(url: string, body: unknown) {
    const res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...extra, ...(body as object) }) });
    return { ok: res.ok, data: (await res.json().catch(() => ({}))) as Record<string, unknown> };
  }

  async function addOne(file: File, current: Item[]): Promise<Item[]> {
    const key = `${file.name}-${file.size}-${Math.random()}`;
    const local = judgeUploadRequest({ name: file.name, size: file.size, type: file.type });
    if (!local.ok) {
      setError(`${file.name} : ${FILE_ISSUE_TEXT[local.issue]}`);
      return current;
    }
    const start: Item = { id: key, name: local.name, size: file.size, family: "document", state: "uploading", key };
    let list = [...current, start];
    publish(list);
    const fail = (message: string) => {
      list = list.map((i) => (i.key === key ? { ...i, state: "error" as const, message } : i));
      publish(list);
      return list;
    };
    try {
      const asked = await post(endpoint, { scope, name: file.name, size: file.size, type: file.type });
      if (!asked.ok) return fail((asked.data.error as string) ?? "Envoi impossible pour le moment.");
      const id = String(asked.data.id);
      // Même forme que le client officiel de Supabase pour un envoi signé : un champ de cache puis le fichier.
      const form = new FormData();
      form.append("cacheControl", "3600");
      form.append("", file);
      const sent = await fetch(String(asked.data.uploadUrl), { method: "PUT", body: form });
      if (!sent.ok) return fail("L'envoi n'est pas arrivé jusqu'au bout. Réessaie.");
      const done = await post(`${endpoint}/${id}/confirm`, {});
      if (!done.ok) return fail((done.data.error as string) ?? "Ce fichier n'a pas pu être vérifié.");
      const f = done.data.file as AttachmentView;
      list = list.map((i) => (i.key === key ? { ...f, state: "ready" as const, key: f.id } : i));
      publish(list);
      return list;
    } catch {
      return fail("Pas de connexion. Réessaie dans un instant.");
    }
  }

  async function onPick(files: FileList | null) {
    if (!files || files.length === 0) return;
    setError(null);
    let list = items;
    const room = max - list.filter((i) => i.state !== "error").length;
    const chosen = Array.from(files).slice(0, Math.max(0, room));
    if (files.length > chosen.length) setError(`${max} fichiers au plus ici.`);
    for (const f of chosen) list = await addOne(f, list);
    if (input.current) input.current.value = "";
  }

  async function remove(item: Item) {
    if (item.state === "error") return publish(items.filter((i) => i.key !== item.key));
    try {
      const res = await fetch(`${endpoint}/${item.id}`, { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...extra }) });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        return setError((data as { error?: string }).error ?? "Impossible de retirer ce fichier.");
      }
      publish(items.filter((i) => i.key !== item.key));
    } catch {
      setError("Pas de connexion. Réessaie dans un instant.");
    }
  }

  const count = items.filter((i) => i.state !== "error").length;
  return (
    <div className="space-y-3">
      {items.length > 0 && (
        <ul className="space-y-2">
          {items.map((i) => (
            <li key={i.key} className={`flex items-center gap-2 rounded-xl border pl-3 pr-1 min-h-[44px] ${i.state === "error" ? "border-danger/40 bg-white" : "border-boost-olive/30 bg-boost-cream"}`}>
              {i.state === "uploading" ? <Loader2 className="w-4 h-4 animate-spin shrink-0" aria-hidden /> : i.family === "image" ? <ImageIcon className="w-4 h-4 shrink-0" aria-hidden /> : <FileText className="w-4 h-4 shrink-0" aria-hidden />}
              <span className="flex-1 min-w-0">
                <span className="block truncate text-[13.5px] text-ink">{i.name}</span>
                <span className={`block text-[12px] ${i.state === "error" ? "text-danger font-semibold" : "text-ink-muted"}`}>{i.state === "uploading" ? "Envoi en cours…" : i.state === "error" ? i.message : humanSize(i.size)}</span>
              </span>
              {i.state !== "uploading" && (
                <button type="button" onClick={() => remove(i)} aria-label={`Retirer ${i.name}`} disabled={disabled} className="w-10 h-10 rounded-full flex items-center justify-center hover:bg-boost-olive/10 disabled:opacity-50">
                  <X className="w-4 h-4" aria-hidden />
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
      <input ref={input} type="file" multiple accept={ACCEPT_ATTR} className="sr-only" id={uid} onChange={(e) => onPick(e.target.files)} disabled={disabled || count >= max} />
      <label
        htmlFor={uid}
        className={`inline-flex items-center gap-1.5 min-h-[44px] px-4 rounded-xl border border-paper-border bg-white text-ink text-[14px] font-semibold cursor-pointer ${disabled || count >= max ? "opacity-50 pointer-events-none" : ""}`}
      >
        <Paperclip className="w-4 h-4" aria-hidden /> {label}
      </label>
      <p className="text-[12px] text-ink-muted">{ACCEPTED_TEXT}</p>
      {error && (
        <p role="alert" className="text-danger text-[13px] font-semibold">
          {error}
        </p>
      )}
    </div>
  );
}

export type { FileIssue };
