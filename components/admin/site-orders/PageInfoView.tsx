"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { Card, StatusBadge } from "@/components/admin/ui";
import { readJsonSafe } from "@/lib/fetch-json";
import type { InfoSource, PageInfo } from "@/lib/site-orders/console-info";
import { OPENNESS_TITLE, opennessDetail, type Openness } from "@/lib/site-orders/hours";
import type { HoursCause, HoursOrigin } from "@/lib/site-orders/hours-source";
import type { ContactField, Offers } from "@/lib/site-orders/page-settings";
import { checkBox, ghostButton, primaryButton, textField, textLink } from "./info-ui";

// ADR 0109 §3 — « Infos de ma page » : ce que les clients voient quand ils commandent, d'où vient chaque information, et les
// gestes qui la changent. Maquettes validées le 2026-11-26.

const DOT: Record<Openness["state"], string> = { ouvert: "bg-good", ferme: "bg-danger", inconnu: "bg-ink-faint" };

const SOURCE_SENTENCE: Record<HoursOrigin, string | null> = {
  google: "D'après les horaires de Google.",
  saisi: "D'après tes horaires.",
  repli: "D'après tes horaires : Google ne les donne pas pour le moment.",
  fermeture: "Fermeture que tu as annoncée.",
  aucune: null,
};

const UNKNOWN_CAUSE: Record<HoursCause, string> = {
  sans_horaires: "Google ne donne pas d'horaires pour ton restaurant.",
  pas_de_fiche: "Aucune fiche Google n'est reliée à ton restaurant.",
  lecture_impossible: "Google ne répond pas pour le moment.",
  places_absent: "La lecture de Google n'est pas branchée de notre côté.",
};

type Result = { ok: true } | { ok: false; error: string };

function Source({ source }: { source: InfoSource }) {
  if (source === null) return null;
  return source === "google" ? <StatusBadge>Google</StatusBadge> : <StatusBadge tone="good">Toi</StatusBadge>;
}

function ContactEditor({ field, label, row, shown, empty, help, input, onSave }: {
  field: ContactField;
  label: string;
  row: { value: string | null; source: InfoSource };
  /** Ce qui s'affiche quand rien n'est saisi mais que la page montre quand même une phrase. */
  shown?: string;
  empty: string;
  help?: string;
  input: "tel" | "text";
  onSave: (body: Record<string, unknown>) => Promise<Result>;
}) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    setBusy(true);
    setError(null);
    const r = await onSave({ action: "contact", field, value });
    setBusy(false);
    if (r.ok) setEditing(false);
    else setError(r.error);
  }

  return (
    <div className="border-t border-paper-border px-4 py-3.5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 space-y-1">
          <p className="flex flex-wrap items-center gap-2"><b className="text-[15px] font-semibold text-ink">{label}</b><Source source={row.source} /></p>
          {!editing && <p className="break-words text-[15px] text-ink-body">{row.value ?? shown ?? empty}</p>}
        </div>
        {!editing && (
          <button type="button" aria-label={`Modifier : ${label}`} onClick={() => { setValue(row.value ?? ""); setError(null); setEditing(true); }} className={`${textLink} shrink-0`}>Modifier</button>
        )}
      </div>
      {editing && (
        <form className="mt-2 space-y-2" onSubmit={(e) => { e.preventDefault(); void save(); }}>
          <label htmlFor={`info-${field}`} className="sr-only">{label}</label>
          <input id={`info-${field}`} type={input} value={value} autoFocus maxLength={field === "address" ? 200 : field === "phone" ? 30 : 80} placeholder={shown ?? ""} onChange={(e) => { setValue(e.target.value); setError(null); }} className={textField} />
          {help && <p className="text-[13px] text-ink-muted">{help}</p>}
          {error && <p role="alert" className="text-[15px] text-danger">{error}</p>}
          <div className="flex flex-wrap gap-2">
            <button type="submit" disabled={busy} className={primaryButton}>{busy ? "Enregistrement…" : "Enregistrer"}</button>
            <button type="button" disabled={busy} onClick={() => setEditing(false)} className={ghostButton}>Annuler</button>
          </div>
        </form>
      )}
    </div>
  );
}

export function PageInfoView({ restaurantId }: { restaurantId: string }) {
  const [info, setInfo] = useState<PageInfo | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const hoursPage = `/admin/${restaurantId}/commandes-du-site/infos/horaires`;

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/admin/site-orders/info?restaurantId=${encodeURIComponent(restaurantId)}`, { cache: "no-store" });
      const { data } = await readJsonSafe<PageInfo & { error?: string }>(res);
      if (!res.ok || !data?.state) { setLoadError(data?.error ?? "Tes infos n'ont pas pu être lues."); return; }
      setInfo(data);
      setLoadError(null);
    } catch {
      setLoadError("Tes infos n'ont pas pu être lues. Vérifie ta connexion.");
    }
  }, [restaurantId]);

  useEffect(() => { void load(); }, [load]);

  /** `reload` : faux pour un geste déjà affiché (chaque lecture de la page coûte un appel à la fiche Google). */
  const send = useCallback(async (body: Record<string, unknown>, reload = true): Promise<Result> => {
    try {
      const res = await fetch("/api/admin/site-orders/info", {
        method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify({ restaurantId, ...body }),
      });
      const { data } = await readJsonSafe<{ error?: string }>(res);
      if (!res.ok) return { ok: false, error: data?.error ?? "Rien n'a été enregistré. Réessaie." };
      if (reload) await load();
      return { ok: true };
    } catch {
      return { ok: false, error: "Rien n'a été enregistré. Vérifie ta connexion et réessaie." };
    }
  }, [restaurantId, load]);

  /** Un geste direct (fermer, rouvrir, cocher) : son échec s'affiche en haut de la page. */
  async function act(body: Record<string, unknown>) {
    setBusy(true);
    setError(null);
    const r = await send(body);
    setBusy(false);
    if (!r.ok) setError(r.error);
  }

  /** La case change sous le doigt ; un refus la remet comme avant et le dit. */
  async function offer(before: Offers, next: Offers) {
    const show = (offers: Offers) => setInfo((i) => (i ? { ...i, offers } : i));
    show(next);
    setError(null);
    const r = await send({ action: "offers", offers: next }, false);
    if (!r.ok) { show(before); setError(r.error); }
  }

  if (!info) {
    return loadError ? (
      <Card>
        <p role="alert" className="text-[15px] text-ink">{loadError}</p>
        <button type="button" onClick={() => void load()} className={`${ghostButton} mt-3`}>Réessayer</button>
      </Card>
    ) : <p className="text-[15px] text-ink-muted">Lecture de tes infos…</p>;
  }

  const { state } = info;
  const unknown = state.openness.state === "inconnu";
  const detail = opennessDetail(state.openness, new Date(info.readAt));
  const sentence = SOURCE_SENTENCE[state.origin];
  const offers: [keyof Offers, string][] = [["terrace", "Une terrasse"], ["dineIn", "Manger sur place"], ["matchScreen", "Un écran pour les matchs"]];
  const fromGoogle = state.origin === "google" || [info.hours.source, info.phone.source, info.address.source].includes("google");

  return (
    <div className="space-y-4">
      {!info.activated && (
        <p role="status" className="rounded-xl border border-paper-border bg-paper-subtle p-4 text-[15px] text-ink">
          La saisie de tes horaires, de tes fermetures et de ta présentation n&apos;est pas encore activée. Ta page lit les horaires de ta fiche Google. Le téléphone et l&apos;adresse se modifient déjà.
        </p>
      )}
      {(error || loadError) && <p role="alert" className="rounded-xl border border-danger bg-white p-4 text-[15px] text-danger">{error ?? loadError}</p>}

      {unknown ? (
        <>
          <div role="alert" className="space-y-3 rounded-xl border border-warn bg-warn/10 p-4">
            <h2 className="text-[17px] font-semibold text-ink">Tes clients ne peuvent pas encore commander</h2>
            <p className="text-[15px] text-ink">
              {UNKNOWN_CAUSE[state.cause ?? "sans_horaires"]}{" "}
              {!info.activated ? "La saisie de tes horaires n'est pas encore activée."
                : `${(state.cause ?? "sans_horaires") === "sans_horaires" ? "Saisis-les ici" : "Saisis tes horaires ici"} et les commandes s'ouvrent à tes heures.`}
            </p>
            {info.activated && <Link href={hoursPage} className={`${primaryButton} w-full`}>Saisir mes horaires</Link>}
          </div>
          <div className="space-y-2">
            <h2 className="text-[15px] font-semibold text-ink">Aujourd&apos;hui, ton client voit :</h2>
            <Card padding="p-4">
              <p className="break-words text-[20px] font-semibold text-ink">{info.name}</p>
              <p className="mt-2 flex items-center gap-2 text-[15px] font-semibold text-ink"><span aria-hidden="true" className="h-2.5 w-2.5 rounded-full bg-ink-faint" />{OPENNESS_TITLE.inconnu}</p>
              <p className="mt-2 rounded-lg bg-paper-subtle p-3 text-[15px] text-ink">Appelle le restaurant pour commander. Ton panier est gardé.</p>
              {info.phone.value && <p className="mt-2 text-[15px] text-ink">{info.phone.value}</p>}
            </Card>
          </div>
        </>
      ) : (
        <Card padding="p-4">
          <p role="status" className="flex items-center gap-2 text-[15px] font-semibold text-ink">
            <span aria-hidden="true" className={`h-2.5 w-2.5 shrink-0 rounded-full ${DOT[state.openness.state]}`} />
            <span>{OPENNESS_TITLE[state.openness.state]}{detail ? `, ${detail}` : ""}</span>
          </p>
          {sentence && <p className="mt-1 text-[13px] text-ink-muted">{sentence}</p>}
          {info.activated && (
            <div className="mt-3 flex flex-col gap-1">
              {info.closedToday ? (
                <>
                  <p className="mb-1 text-[15px] text-ink">Tu as fermé pour aujourd&apos;hui.</p>
                  <button type="button" disabled={busy} onClick={() => void act({ action: "reopen_today" })} className={ghostButton}>Rouvrir</button>
                </>
              ) : info.plannedClosure ? (
                <p className="text-[15px] text-ink">Fermeture prévue : {info.plannedClosure}.</p>
              ) : (
                <button type="button" disabled={busy} onClick={() => void act({ action: "close_today" })} className={ghostButton}>Fermer pour aujourd&apos;hui</button>
              )}
              <Link href={`${hoursPage}#jours-speciaux`} className={`${textLink} justify-center`}>{info.plannedClosure && !info.closedToday ? "Voir les jours spéciaux" : "Fermer plusieurs jours"}</Link>
            </div>
          )}
        </Card>
      )}

      <Card padding="p-0">
        <div className="flex items-start justify-between gap-3 px-4 py-3.5">
          <div className="min-w-0 space-y-1">
            <p className="flex flex-wrap items-center gap-2"><b className="text-[15px] font-semibold text-ink">Horaires</b><Source source={info.hours.source} /></p>
            {info.hours.lines.map((line) => <p key={line} className="text-[15px] text-ink-body">{line}</p>)}
          </div>
          {info.activated && <Link href={hoursPage} aria-label="Modifier : Horaires" className={`${textLink} shrink-0`}>Modifier</Link>}
        </div>
        <ContactEditor field="phone" label="Téléphone" row={info.phone} empty="Pas de téléphone : la ligne ne s'affiche pas." input="tel" onSave={send} />
        <ContactEditor field="address" label="Adresse" row={info.address} empty="Pas d'adresse : la ligne ne s'affiche pas." input="text" onSave={send}
          help="L'adresse sert aussi à reconnaître tes tickets et s'affiche sur tes bons de pub. Elle ne déplace pas ta position sur la carte." />
        {info.activated ? (
          <ContactEditor field="presentation" label="Présentation" row={{ value: info.presentation.value, source: info.presentation.value ? "toi" : null }} shown={info.presentation.shown} empty="" input="text" onSave={send}
            help="Une phrase courte sous le nom de ton restaurant. Vide : la page la compose avec ton type de cuisine." />
        ) : (
          <div className="border-t border-paper-border px-4 py-3.5">
            <p className="text-[15px] font-semibold text-ink">Présentation</p>
            <p className="mt-1 break-words text-[15px] text-ink-body">{info.presentation.shown}</p>
          </div>
        )}
      </Card>
      {fromGoogle && (
        <p className="text-[13px] text-ink-muted">
          Ce qui est marqué « Google » vient de{" "}
          <span translate="no" className="whitespace-nowrap">Google Maps</span>
          {info.attributions.map((a) => (
            <span key={a.provider}>, {a.url ? <a href={a.url} target="_blank" rel="noopener noreferrer" className="underline">{a.provider}</a> : a.provider}</span>
          ))}
          . Ta fiche Google n&apos;est jamais modifiée d&apos;ici.
        </p>
      )}

      <Card padding="p-4">
        <fieldset disabled={!info.activated}>
          <legend className="text-[15px] font-semibold text-ink">Ce que tu proposes</legend>
          <div className="mt-1">
            {offers.map(([key, label]) => (
              <label key={key} className="flex min-h-[44px] items-center gap-3 text-[15px] text-ink">
                <input type="checkbox" className={checkBox} checked={info.offers[key]} onChange={(e) => void offer(info.offers, { ...info.offers, [key]: e.target.checked })} />
                {label}
              </label>
            ))}
          </div>
        </fieldset>
        <p className="mt-1 text-[13px] text-ink-muted">Tes clients ne le voient pas pour l&apos;instant. Un article ne parlera jamais de ce que tu n&apos;as pas coché.</p>
      </Card>
    </div>
  );
}
