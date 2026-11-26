"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { Card } from "@/components/admin/ui";
import { readJsonSafe } from "@/lib/fetch-json";
import type { HoursEditorData } from "@/lib/site-orders/console-info";
import { DAY_NAMES, checkWeekly, draftOf, draftServices, groupDays, isBlank, type DayDraft } from "@/lib/site-orders/weekly-hours";
import { checkBox, ghostButton, primaryButton, textField, textLink } from "./info-ui";

// ADR 0109 §3 — « Mes horaires » : quels horaires montrer, la semaine (un jour ouvert à la fois), les jours spéciaux.
// Rien n'est repris de Google : le restaurateur saisit ses heures. Maquettes validées le 2026-11-26.

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

export function HoursEditor({ restaurantId }: { restaurantId: string }) {
  const [data, setData] = useState<HoursEditorData | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [source, setSource] = useState<"google" | "manual">("google");
  const [days, setDays] = useState<DayDraft[]>(() => draftOf(null));
  const [open, setOpen] = useState(0);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ tone: "good" | "danger"; text: string } | null>(null);
  const [adding, setAdding] = useState(false);
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [closureError, setClosureError] = useState<string | null>(null);
  const back = `/admin/${restaurantId}/commandes-du-site/infos`;

  /** `form` : recharge aussi la semaine (au premier affichage) ; sinon les seuls jours spéciaux, sans toucher à la saisie en cours. */
  const load = useCallback(async (form: boolean) => {
    try {
      const res = await fetch(`/api/admin/site-orders/info?restaurantId=${encodeURIComponent(restaurantId)}&vue=horaires`, { cache: "no-store" });
      const { data } = await readJsonSafe<HoursEditorData & { error?: string }>(res);
      if (!res.ok || !data?.closures) { setLoadError(data?.error ?? "Tes horaires n'ont pas pu être lus."); return; }
      setData(data);
      setLoadError(null);
      if (form) { setSource(data.source); setDays(draftOf(data.weekly)); }
    } catch {
      setLoadError("Tes horaires n'ont pas pu être lus. Vérifie ta connexion.");
    }
  }, [restaurantId]);

  useEffect(() => { void load(true); }, [load]);

  // Arrivé par « Fermer plusieurs jours » : l'ancre n'existe qu'une fois les données affichées.
  const ready = data !== null;
  useEffect(() => {
    if (ready && window.location.hash === "#jours-speciaux") document.getElementById("jours-speciaux")?.scrollIntoView();
  }, [ready]);

  async function put(body: Record<string, unknown>): Promise<string | null> {
    try {
      const res = await fetch("/api/admin/site-orders/info", {
        method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify({ restaurantId, ...body }),
      });
      const { data } = await readJsonSafe<{ error?: string }>(res);
      return res.ok ? null : (data?.error ?? "Rien n'a été enregistré. Réessaie.");
    } catch {
      return "Rien n'a été enregistré. Vérifie ta connexion et réessaie.";
    }
  }

  function change(index: number, patch: Partial<DayDraft>) {
    setDays((all) => all.map((d, i) => (i === index ? { ...d, ...patch } : d)));
    setMessage(null);
  }

  async function save() {
    setMessage(null);
    const missing = days.findIndex(isBlank);
    const empty = days.every(isBlank);
    if (!empty && missing >= 0) {
      setOpen(missing);
      setMessage({ tone: "danger", text: `Il manque ${DAY_NAMES[missing]} : indique ses heures ou coche « Fermé ».` });
      return;
    }
    let weekly = null;
    if (!empty) {
      const checked = checkWeekly(days.map(draftServices));
      if (!checked.ok) { setMessage({ tone: "danger", text: checked.message }); return; }
      weekly = checked.weekly;
    }
    setBusy(true);
    const error = await put({ action: "hours", source, weekly });
    setBusy(false);
    if (error) { setMessage({ tone: "danger", text: error }); return; }
    setMessage({ tone: "good", text: source === "manual" ? "Enregistré : ta page montre tes horaires." : weekly || data?.weekly ? "Enregistré : ta page montre les horaires de Google. Les tiens sont gardés." : "Enregistré : ta page montre les horaires de Google." });
    await load(true);
  }

  async function closure(body: Record<string, unknown>) {
    setBusy(true);
    setClosureError(null);
    const error = await put(body);
    setBusy(false);
    if (error) { setClosureError(error); return; }
    setAdding(false);
    setFrom("");
    setTo("");
    await load(false);
  }

  if (!data) {
    return loadError ? (
      <Card>
        <p role="alert" className="text-[15px] text-ink">{loadError}</p>
        <button type="button" onClick={() => void load(true)} className={`${ghostButton} mt-3`}>Réessayer</button>
      </Card>
    ) : <p className="text-[15px] text-ink-muted">Lecture de tes horaires…</p>;
  }

  if (!data.activated) {
    return <p role="status" className="rounded-xl border border-paper-border bg-paper-subtle p-4 text-[15px] text-ink">La saisie de tes horaires n&apos;est pas encore activée. Ta page lit les horaires de ta fiche Google.</p>;
  }

  const day = days[open];
  const timeField = (key: "open1" | "close1" | "open2" | "close2", label: string, aria: string) => (
    <label className="flex min-w-0 flex-col gap-1 text-[13px] text-ink">
      {label}
      <input type="time" aria-label={`${cap(DAY_NAMES[open])}, ${aria}`} value={day[key]} onChange={(e) => change(open, { [key]: e.target.value })} className={textField} />
    </label>
  );

  return (
    <div className="space-y-4">
      {loadError && <p role="alert" className="rounded-xl border border-danger bg-white p-4 text-[15px] text-danger">{loadError}</p>}

      <Card padding="p-4">
        <fieldset>
          <legend className="text-[15px] font-semibold text-ink">Quels horaires montrer ?</legend>
          {([["google", "Ceux de Google"], ["manual", "Les miens"]] as const).map(([value, label]) => (
            <label key={value} className="flex min-h-[44px] items-center gap-3 text-[15px] text-ink">
              <input type="radio" name="source" className={checkBox} checked={source === value} onChange={() => { setSource(value); setMessage(null); }} />
              {label}
            </label>
          ))}
        </fieldset>
        <p className="mt-1 text-[13px] text-ink-muted">
          Les tiens remplacent ceux de Google jusqu&apos;à ce que tu reviennes à Google. Ta fiche Google n&apos;est pas modifiée.
          {source === "google" && " Avec « Ceux de Google », les tiens servent quand Google ne donne rien."}
        </p>
      </Card>

      <Card padding="p-4">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-[15px] font-semibold text-ink">{cap(DAY_NAMES[open])}</h2>
          <label className="flex min-h-[44px] items-center gap-2 text-[15px] text-ink">
            <input type="checkbox" className={checkBox} checked={day.closed} onChange={(e) => change(open, { closed: e.target.checked })} />
            Fermé
          </label>
        </div>
        {!day.closed && (
          <>
            <div className="mt-2 grid grid-cols-2 gap-2">
              {timeField("open1", "Ouvre", "ouvre")}
              {timeField("close1", "Ferme", "ferme")}
              {timeField("open2", "Rouvre", "rouvre")}
              {timeField("close2", "Ferme", "ferme après la réouverture")}
            </div>
            <p className="mt-2 text-[13px] text-ink-muted">Sans coupure, laisse « Rouvre » vide. Après minuit, écris l&apos;heure telle quelle (18:00 à 02:00). Toute la journée : 00:00 à 00:00.</p>
          </>
        )}
        <button type="button" disabled={isBlank(day)} onClick={() => { setDays((all) => all.map(() => ({ ...day }))); setMessage(null); }} className={`${ghostButton} mt-3 w-full`}>
          Copier {DAY_NAMES[open]} sur les autres jours
        </button>
      </Card>

      <Card padding="p-0">
        <ul>
          {groupDays(days, open).map((g, i) => (
            <li key={g.first} className={`flex min-h-[52px] items-center justify-between gap-3 px-4 py-1 ${i > 0 ? "border-t border-paper-border" : ""}`}>
              <span className="min-w-0 text-[15px] text-ink-body">
                {g.sameAs ? <>{g.label} : comme {g.sameAs}</> : <><b className="font-semibold text-ink">{g.label}</b> {g.text}</>}
              </span>
              <button type="button" aria-label={`${g.sameAs ? "Voir" : "Changer"} : ${g.label.toLowerCase()}`} onClick={() => setOpen(g.first)} className={`${textLink} shrink-0`}>{g.sameAs ? "Voir" : "Changer"}</button>
            </li>
          ))}
        </ul>
      </Card>

      <div id="jours-speciaux" className="scroll-mt-20">
        <Card padding="p-4">
          <h2 className="text-[15px] font-semibold text-ink">Jours spéciaux</h2>
          <p className="mt-1 text-[13px] text-ink-muted">Ces jours-là, ta page ne prend aucune commande. Ils sont enregistrés tout de suite.</p>
          <ul className="mt-1">
            {data.closures.map((c) => (
              <li key={`${c.from}/${c.to}`} className="flex min-h-[44px] items-center justify-between gap-3 text-[15px] text-ink">
                <span className="min-w-0">{c.label}</span>
                <button type="button" disabled={busy} aria-label={`Retirer : ${c.label}`} onClick={() => void closure({ action: "remove_closure", from: c.from, to: c.to })} className={`${textLink} shrink-0`}>Retirer</button>
              </li>
            ))}
          </ul>
          {adding ? (
            <form className="mt-2 space-y-2" onSubmit={(e) => { e.preventDefault(); void closure({ action: "add_closure", from, to }); }}>
              <div className="grid grid-cols-2 gap-2">
                <label className="flex min-w-0 flex-col gap-1 text-[13px] text-ink">Du<input type="date" required min={data.today} value={from} onChange={(e) => setFrom(e.target.value)} className={textField} /></label>
                <label className="flex min-w-0 flex-col gap-1 text-[13px] text-ink">Au (facultatif)<input type="date" min={from || data.today} value={to} onChange={(e) => setTo(e.target.value)} className={textField} /></label>
              </div>
              <div className="flex flex-wrap gap-2">
                <button type="submit" disabled={busy} className={ghostButton}>Fermer ces jours-là</button>
                <button type="button" disabled={busy} onClick={() => { setAdding(false); setClosureError(null); }} className={textLink}>Annuler</button>
              </div>
            </form>
          ) : (
            <button type="button" onClick={() => setAdding(true)} className={`${ghostButton} mt-2 w-full`}>Ajouter un jour spécial</button>
          )}
          {closureError && <p role="alert" className="mt-2 text-[15px] text-danger">{closureError}</p>}
        </Card>
      </div>

      {message && (
        <p role={message.tone === "danger" ? "alert" : "status"} className={`text-[15px] font-semibold ${message.tone === "danger" ? "text-danger" : "text-good"}`}>
          {message.text}{message.tone === "good" && <> <Link href={back} className="underline">Voir mes infos</Link></>}
        </p>
      )}
      <button type="button" disabled={busy} onClick={() => void save()} className={`${primaryButton} w-full`}>{busy ? "Enregistrement…" : "Enregistrer mes horaires"}</button>
    </div>
  );
}
