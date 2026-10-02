"use client";

import { useEffect, useRef, useState } from "react";
import { registerDraftEstablishments } from "./actions";
import { TrackOnMount } from "@/components/analytics/TrackOnMount";
import { CuisineTags } from "./CuisineTags";
import { queueEvent } from "@/lib/analytics-pending";
import {
  DRAFT_MAX_ESTABLISHMENTS,
  DRAFT_READY_KEY,
  DRAFT_STORAGE_KEY,
  emptyEstablishment,
  fromPrefill,
  missingFields,
  type DraftEstablishment,
  type PlacePrefill,
} from "@/lib/partner-draft";

// ADR 0075 §1 — étape Établissements, SANS compte : le restaurateur cherche
// son établissement sur Google, corrige la fiche pré-remplie, en ajoute
// d'autres. Le brouillon reste dans le navigateur (localStorage) jusqu'au
// compte ; rien n'est écrit en base avant.
//
// `DRAFT_READY_KEY` : posé quand il a cliqué « Continuer ». Au retour d'une
// connexion Google, la page enregistre alors le brouillon d'elle-même —
// jamais un brouillon encore en cours de saisie.

type Suggestion = { placeId: string; name: string; address: string };

function newSession(): string {
  try {
    return crypto.randomUUID().replace(/-/g, "");
  } catch {
    return `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 12)}`;
  }
}

function readDraft(): DraftEstablishment[] {
  try {
    const raw = localStorage.getItem(DRAFT_STORAGE_KEY);
    const parsed = raw ? (JSON.parse(raw) as { establishments?: DraftEstablishment[] }) : null;
    return Array.isArray(parsed?.establishments) ? parsed.establishments : [];
  } catch {
    return [];
  }
}

function writeDraft(list: DraftEstablishment[]) {
  try {
    localStorage.setItem(DRAFT_STORAGE_KEY, JSON.stringify({ establishments: list }));
  } catch {}
}

function clearDraft() {
  try {
    localStorage.removeItem(DRAFT_STORAGE_KEY);
    localStorage.removeItem(DRAFT_READY_KEY);
  } catch {}
}

const input =
  "w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-red text-gray-900 text-sm";

export function PartnerSignup({ signedIn }: { signedIn: boolean }) {
  const [list, setList] = useState<DraftEstablishment[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [searching, setSearching] = useState(true);
  const [q, setQ] = useState("");
  const [items, setItems] = useState<Suggestion[]>([]);
  const [busyPlace, setBusyPlace] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const session = useRef<string>("");
  if (!session.current) session.current = newSession();

  async function register(draft: DraftEstablishment[]) {
    setSaving(true);
    setError(null);
    const res = await registerDraftEstablishments(JSON.stringify({ establishments: draft }));
    if ("error" in res) {
      setError(res.error);
      setSaving(false);
      return;
    }
    const taken = res.result.takenByOthers;
    if (!res.next) {
      setError(
        `${taken.join(", ")} ${taken.length > 1 ? "sont déjà inscrits" : "est déjà inscrit"} sur Boosteats par un autre compte. Si c'est le vôtre, écrivez-nous : contact@boosteats.be.`,
      );
      setSaving(false);
      return;
    }
    queueEvent("partner_step_completed", { step_name: "compte", step_number: 1 });
    clearDraft();
    window.location.href = res.next;
  }

  // Brouillon repris (retour arrière, rechargement, retour de Google).
  useEffect(() => {
    const draft = readDraft();
    setList(draft);
    if (new URLSearchParams(window.location.search).get("refus") === "deja_inscrit") {
      setNotice("Ces établissements sont déjà inscrits sur Boosteats par un autre compte. Si ce sont les vôtres, écrivez-nous : contact@boosteats.be.");
    }
    setSearching(draft.length === 0);
    setLoaded(true);
    let ready = false;
    try {
      ready = localStorage.getItem(DRAFT_READY_KEY) === "1";
    } catch {}
    if (signedIn && ready && draft.length) void register(draft);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (loaded) writeDraft(list);
  }, [list, loaded]);

  useEffect(() => {
    if (!searching || q.trim().length < 2) {
      setItems([]);
      return;
    }
    const ctrl = new AbortController();
    const t = setTimeout(async () => {
      try {
        const res = await fetch(`/api/partner/places/suggest?q=${encodeURIComponent(q.trim())}&s=${session.current}`, { signal: ctrl.signal });
        const j = (await res.json()) as { suggestions?: Suggestion[]; error?: string };
        if (!res.ok) {
          setNotice(j.error === "trop_de_recherches" ? "Trop de recherches depuis cette connexion : patientez quelques minutes, ou saisissez à la main." : "La recherche Google est momentanément indisponible : saisissez votre établissement à la main.");
          setItems([]);
          return;
        }
        setNotice(null);
        const known = new Set(list.map((e) => e.placeId));
        setItems((j.suggestions ?? []).filter((s) => !known.has(s.placeId)));
      } catch {
        /* frappe suivante : requête annulée */
      }
    }, 250);
    return () => {
      clearTimeout(t);
      ctrl.abort();
    };
  }, [q, searching, list]);

  async function pick(s: Suggestion) {
    setBusyPlace(true);
    setNotice(null);
    try {
      const res = await fetch(`/api/partner/places/details?id=${encodeURIComponent(s.placeId)}&s=${session.current}`);
      const j = (await res.json()) as { prefill?: PlacePrefill; alreadyRegistered?: boolean; error?: string };
      if (!res.ok || !j.prefill) {
        setNotice("Impossible de lire cette fiche Google. Réessayez, ou saisissez à la main.");
        return;
      }
      if (j.alreadyRegistered) {
        setNotice(`${j.prefill.name} est déjà inscrit sur Boosteats. Si c'est votre établissement, écrivez-nous : contact@boosteats.be.`);
        return;
      }
      setList((l) => [...l, fromPrefill(j.prefill!)]);
      setQ("");
      setItems([]);
      setSearching(false);
      // Une session Google = une recherche terminée par une fiche.
      session.current = newSession();
    } catch {
      setNotice("Impossible de lire cette fiche Google. Réessayez, ou saisissez à la main.");
    } finally {
      setBusyPlace(false);
    }
  }

  function addManual() {
    setList((l) => [...l, emptyEstablishment()]);
    setSearching(false);
    setQ("");
  }

  function update(i: number, patch: Partial<DraftEstablishment>) {
    setList((l) => l.map((e, k) => (k === i ? { ...e, ...patch } : e)));
  }

  function remove(i: number) {
    setList((l) => {
      const next = l.filter((_, k) => k !== i);
      if (next.length === 0) setSearching(true);
      return next;
    });
  }

  function onContinue() {
    const incomplete = list.findIndex((e) => missingFields(e).length > 0);
    if (incomplete >= 0) {
      setError(`Indiquez le nom et la commune de l'établissement n° ${incomplete + 1}.`);
      return;
    }
    setError(null);
    writeDraft(list);
    try {
      localStorage.setItem(DRAFT_READY_KEY, "1");
    } catch {}
    if (signedIn) void register(list);
    else window.location.href = "/signup?as=resto";
  }

  const full = list.length >= DRAFT_MAX_ESTABLISHMENTS;

  return (
    <div className="min-h-screen bg-gray-50 flex items-start sm:items-center justify-center p-4 py-10">
      <TrackOnMount event="partner_signup_started" params={{ source: "recherche_google" }} />
      <div className="w-full max-w-md">
        <div className="text-center mb-6">
          <h1 className="text-2xl font-bold text-gray-900">Inscrivez votre restaurant</h1>
          <p className="text-gray-500 text-sm mt-1">
            Cherchez-le sur Google : on remplit le reste, vous corrigez si besoin. Gratuit jusqu&apos;à 500
            tickets par mois.
          </p>
        </div>

        <div className="bg-white rounded-2xl shadow-xl p-6 sm:p-8 space-y-5">
          <Stepper current={1} />

          {list.map((e, i) => (
            <div key={`${e.placeId ?? "manuel"}-${i}`} className="border border-gray-200 rounded-xl p-4 space-y-3">
              <div className="flex items-start gap-3">
                <div className="min-w-0 flex-1">
                  <p className="font-semibold text-gray-900 truncate">{e.name || "Nouvel établissement"}</p>
                  {e.address && <p className="text-xs text-gray-500">{e.address}</p>}
                  {e.placeId ? (
                    <span className="inline-block mt-1 text-[11px] font-semibold text-brand-red bg-brand-red/10 rounded-full px-2 py-0.5">
                      ✓ Rempli depuis Google
                    </span>
                  ) : (
                    <span className="inline-block mt-1 text-[11px] font-semibold text-gray-600 bg-gray-100 rounded-full px-2 py-0.5">
                      Saisi à la main
                    </span>
                  )}
                </div>
                <button type="button" onClick={() => remove(i)} className="text-xs text-gray-400 hover:text-gray-700">
                  Retirer
                </button>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <label className="sm:col-span-2 text-xs text-gray-500 space-y-1">
                  <span>Nom affiché aux clients</span>
                  <input className={input} value={e.name} maxLength={120} onChange={(ev) => update(i, { name: ev.target.value })} />
                </label>
                <label className="text-xs text-gray-500 space-y-1">
                  <span>Commune</span>
                  <input className={input} value={e.sector} maxLength={80} placeholder="Ex : Ixelles" onChange={(ev) => update(i, { sector: ev.target.value })} />
                </label>
                <label className="text-xs text-gray-500 space-y-1">
                  <span>Téléphone</span>
                  <input className={input} value={e.phone} maxLength={40} inputMode="tel" onChange={(ev) => update(i, { phone: ev.target.value })} />
                </label>
                {!e.placeId && (
                  <label className="sm:col-span-2 text-xs text-gray-500 space-y-1">
                    <span>Adresse</span>
                    <input className={input} value={e.address} maxLength={200} onChange={(ev) => update(i, { address: ev.target.value })} />
                  </label>
                )}
                <label className="sm:col-span-2 text-xs text-gray-500 space-y-1">
                  <span>Site web</span>
                  <input className={input} value={e.website} maxLength={300} placeholder="Facultatif" onChange={(ev) => update(i, { website: ev.target.value })} />
                </label>
                <div className="sm:col-span-2 text-xs text-gray-500 space-y-1">
                  <span>Type de cuisine</span>
                  <CuisineTags value={e.cuisine} onChange={(cuisine) => update(i, { cuisine })} name={e.name} hints={e.hints} />
                </div>
              </div>
            </div>
          ))}

          {searching && !full ? (
            <div className="space-y-2">
              <label htmlFor="partner-q" className="block text-sm font-medium text-gray-700">
                {list.length ? "Un autre établissement" : "Votre établissement"}
              </label>
              <div className="relative">
                <input
                  id="partner-q"
                  type="text"
                  autoComplete="off"
                  autoFocus={list.length > 0}
                  value={q}
                  onChange={(ev) => setQ(ev.target.value)}
                  placeholder="Nom du restaurant, ville…"
                  disabled={busyPlace}
                  className="w-full px-4 py-3 border-[1.5px] border-brand-red/60 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-red text-gray-900"
                />
                {items.length > 0 && (
                  <ul role="listbox" className="absolute z-10 left-0 right-0 top-[calc(100%+4px)] bg-white border border-gray-200 rounded-xl shadow-lg overflow-hidden">
                    {items.map((s) => (
                      <li key={s.placeId}>
                        <button type="button" onClick={() => pick(s)} className="w-full text-left px-4 py-3 border-b border-gray-100 hover:bg-brand-red/5">
                          <span className="block text-sm font-semibold text-gray-900">{s.name}</span>
                          <span className="block text-xs text-gray-500">{s.address}</span>
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
              {busyPlace && <p className="text-xs text-gray-500">Lecture de la fiche Google…</p>}
              <p className="text-xs text-gray-500 text-center">
                Pas sur Google ?{" "}
                <button type="button" onClick={addManual} className="font-semibold text-brand-red hover:underline">
                  Saisir à la main
                </button>
                {list.length > 0 && (
                  <>
                    {" · "}
                    <button type="button" onClick={() => { setSearching(false); setQ(""); }} className="font-semibold text-gray-600 hover:underline">
                      Annuler
                    </button>
                  </>
                )}
              </p>
            </div>
          ) : (
            !full && (
              <button
                type="button"
                onClick={() => setSearching(true)}
                className="w-full border-[1.5px] border-dashed border-gray-300 text-brand-red font-semibold rounded-xl py-3 hover:border-brand-red"
              >
                + Ajouter un autre établissement
              </button>
            )
          )}

          {notice && <p className="text-sm text-gray-700 bg-amber-50 border border-amber-200 px-4 py-3 rounded-lg">{notice}</p>}
          {error && <p className="text-red-600 text-sm bg-red-50 px-4 py-3 rounded-lg">{error}</p>}

          {list.length > 0 && (
            <button
              type="button"
              onClick={onContinue}
              disabled={saving}
              className="w-full bg-brand-red text-white py-3 px-4 rounded-lg font-semibold hover:bg-brand-red/85 disabled:opacity-50 transition-colors"
            >
              {saving
                ? "Enregistrement…"
                : signedIn
                  ? `Enregistrer ${list.length > 1 ? `mes ${list.length} établissements` : "mon établissement"}`
                  : list.length > 1
                    ? `Continuer avec ${list.length} établissements`
                    : "Continuer"}
            </button>
          )}
          <p className="text-xs text-gray-400 text-center">Rien n&apos;est visible des clients avant validation par notre équipe.</p>
        </div>
      </div>
    </div>
  );
}

const STEPS = ["Établissements", "Compte", "Carte", "Ticket"] as const;

export function Stepper({ current }: { current: number }) {
  return (
    <div className="flex items-center gap-1.5 flex-wrap text-xs" aria-hidden="true">
      {STEPS.map((label, i) => {
        const n = i + 1;
        const done = n < current;
        const on = n === current;
        return (
          <div key={label} className="contents">
            <span className={`inline-flex items-center gap-1.5 whitespace-nowrap ${on ? "text-brand-red font-semibold" : "text-gray-400"}`}>
              <span
                className={`w-[22px] h-[22px] rounded-full inline-flex items-center justify-center text-[11px] font-bold ${
                  on ? "bg-brand-red text-white" : done ? "bg-brand-red/10 text-brand-red" : "bg-gray-100 text-gray-400"
                }`}
              >
                {done ? "✓" : n}
              </span>
              {label}
            </span>
            {n < STEPS.length && <span className="flex-1 min-w-2 h-px bg-gray-200" />}
          </div>
        );
      })}
    </div>
  );
}
