"use client";

import { useState, useTransition } from "react";
import { announcementAction } from "./actions";
import type { AnnouncementOutcome } from "@/lib/pro-announcements";
import type { AnnouncementDraft } from "@/lib/pro-announcement-draft";

// Écrire aux restaurateurs : établissements, objet, titre, texte, bouton. D'abord un
// aperçu dans sa propre boîte, puis l'envoi (confirmé) — un e-mail par établissement.

const INPUT = "w-full rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900";

const OUTCOME_LABELS: Record<AnnouncementOutcome["status"], string> = {
  sent: "parti",
  failed: "pas parti (voir le journal)",
  no_contact: "aucune adresse e-mail",
  already_sent: "déjà parti dans les 24 h, pas renvoyé",
};

export function AnnouncementForm({ restaurants, draft, to }: { restaurants: { id: string; name: string }[]; draft: AnnouncementDraft; to: string | null }) {
  const [ids, setIds] = useState<string[]>(draft.restaurantIds.filter((id) => restaurants.some((r) => r.id === id)));
  const [subject, setSubject] = useState(draft.subject);
  const [title, setTitle] = useState(draft.title);
  const [body, setBody] = useState(draft.body);
  const [buttonLabel, setButtonLabel] = useState(draft.buttonLabel);
  const [path, setPath] = useState(draft.path);
  const [result, setResult] = useState<{ ok: boolean; message: string; outcomes?: AnnouncementOutcome[] } | null>(null);
  const [pending, startTransition] = useTransition();

  const run = (mode: "preview" | "send") => {
    if (mode === "send" && !window.confirm(`Envoyer « ${subject} » à ${ids.length} restaurateur${ids.length > 1 ? "s" : ""} ?`)) return;
    setResult(null);
    startTransition(async () => setResult(await announcementAction({ restaurantIds: ids, subject, title, body, buttonLabel, path }, mode)));
  };

  return (
    <div className="space-y-3">
      <fieldset>
        <legend className="text-sm font-medium text-gray-900 mb-1">Établissements</legend>
        <div className="flex flex-wrap gap-2">
          {restaurants.map((r) => (
            <label key={r.id} className="flex items-center gap-1.5 rounded-xl border border-gray-200 px-3 py-1.5 text-sm text-gray-800">
              <input type="checkbox" checked={ids.includes(r.id)} onChange={(e) => setIds((cur) => (e.target.checked ? [...cur, r.id] : cur.filter((x) => x !== r.id)))} />
              {r.name}
            </label>
          ))}
        </div>
      </fieldset>
      <label className="block text-sm text-gray-700">
        Objet
        <input className={INPUT} value={subject} onChange={(e) => setSubject(e.target.value)} />
      </label>
      <label className="block text-sm text-gray-700">
        Titre dans l&apos;e-mail
        <input className={INPUT} value={title} onChange={(e) => setTitle(e.target.value)} />
      </label>
      <label className="block text-sm text-gray-700">
        Texte <span className="text-xs text-gray-500">— « ## » intertitre, « - » puce, **gras**</span>
        <textarea className={`${INPUT} font-mono`} rows={14} value={body} onChange={(e) => setBody(e.target.value)} />
      </label>
      <div className="flex flex-col sm:flex-row gap-2">
        <label className="flex-1 text-sm text-gray-700">
          Bouton
          <input className={INPUT} value={buttonLabel} onChange={(e) => setButtonLabel(e.target.value)} />
        </label>
        <label className="flex-1 text-sm text-gray-700">
          Page de la console <span className="text-xs text-gray-500">(après /admin/&lt;établissement&gt;/)</span>
          <input className={INPUT} value={path} onChange={(e) => setPath(e.target.value)} placeholder="pub/nouvelle" />
        </label>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" disabled={pending || !ids.length} onClick={() => run("preview")} className="rounded-xl border border-gray-300 bg-white px-4 py-2 text-sm font-semibold text-gray-900 disabled:opacity-50">
          {pending ? "…" : "M'envoyer un aperçu"}
        </button>
        <button type="button" disabled={pending || !ids.length} onClick={() => run("send")} className="rounded-xl bg-gray-900 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">
          {pending ? "Envoi…" : `Envoyer à ${ids.length} restaurateur${ids.length > 1 ? "s" : ""}`}
        </button>
        {!result && to && <p className="text-xs text-gray-500">Aperçu vers {to}</p>}
      </div>
      {result && (
        <div role="status" className={`text-sm ${result.ok ? "text-green-700" : "text-amber-700"}`}>
          <p>{result.message}</p>
          {result.outcomes?.map((o) => (
            <p key={o.restaurantId} className="text-xs">
              {o.name} : {OUTCOME_LABELS[o.status]}
              {o.to ? ` (${o.to})` : ""}
            </p>
          ))}
        </div>
      )}
    </div>
  );
}
