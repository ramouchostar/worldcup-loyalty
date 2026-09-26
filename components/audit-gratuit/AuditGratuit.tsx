"use client";

// ADR 0071 — l'audit gratuit : l'établissement → l'analyse en direct → la
// note → le numéro WhatsApp qui débloque le rapport complet.
//
// Règle de l'écran d'analyse (§2) : une étape ne se coche jamais avant que sa
// donnée soit arrivée. Un minimum d'affichage par étape laisse le temps de
// lire ce qu'on montre, mais ne fabrique rien.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { track } from "@/lib/analytics";
import { STEP_ORDER, type QuickScan, type StepKey } from "@/lib/audit/quick-scan-types";
import { scoreBand, VERDICT_LABEL, type QuickVolet } from "@/lib/audit/quick-score";
import styles from "./scan.module.css";

type Phase = "search" | "scan" | "result" | "done";
type Status = "en_cours" | "ok" | "echec" | "hors_zone";

interface LeadView {
  status: Status;
  name: string;
  address: string | null;
  inBrussels: boolean | null;
  scan: QuickScan;
  score: number | null;
  phoneLeft: boolean;
}

interface Suggestion {
  placeId: string;
  name: string;
  address: string;
}

const MIN_STEP_MS = 4200;
const POLL_MS = 1200;

const START_ERRORS: Record<string, string> = {
  plafond_ip: "Trois analyses ont déjà été lancées depuis cette connexion aujourd'hui. Réessayez demain, ou écrivez à contact@boosteats.tech.",
  plafond_jour: "L'analyse gratuite est très demandée aujourd'hui. Réessayez demain, ou écrivez à contact@boosteats.tech.",
  indisponible: "L'analyse est momentanément indisponible. Écrivez à contact@boosteats.tech pour recevoir l'audit.",
  echec: "Cette fiche n'a pas pu être lue. Vérifiez l'établissement choisi et réessayez.",
};

function newSession(): string {
  try {
    return crypto.randomUUID().replace(/-/g, "");
  } catch {
    return `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 12)}`;
  }
}

export function AuditGratuit() {
  const [phase, setPhase] = useState<Phase>("search");
  const [leadId, setLeadId] = useState<string | null>(null);
  const [lead, setLead] = useState<LeadView | null>(null);
  // Le numéro saisi, gardé pour l'écran de confirmation (le serveur ne le renvoie jamais).
  const [phoneShown, setPhoneShown] = useState("");

  // Reprise après un rechargement : ?analyse=<id>.
  useEffect(() => {
    const id = new URLSearchParams(window.location.search).get("analyse");
    if (id && /^[0-9a-f-]{36}$/i.test(id)) {
      setLeadId(id);
      setPhase("scan");
    }
  }, []);

  const start = (id: string) => {
    setLeadId(id);
    setPhase("scan");
    window.history.replaceState(null, "", `/audit-gratuit?analyse=${id}`);
    track("audit_gratuit_started", {});
  };

  return (
    <div className="font-landing">
      {phase === "search" && <SearchStep onStarted={start} />}
      {phase === "scan" && leadId && (
        <ScanStep
          leadId={leadId}
          onLead={setLead}
          onDone={(l) => {
            setLead(l);
            track("audit_gratuit_scored", { score_band: scoreBand(l.score), in_brussels: l.inBrussels !== false });
            setPhase(l.phoneLeft ? "done" : "result");
          }}
          onLost={() => {
            window.history.replaceState(null, "", "/audit-gratuit");
            setPhase("search");
          }}
        />
      )}
      {phase === "result" && leadId && lead && (
        <ResultStep
          leadId={leadId}
          lead={lead}
          onPhone={(phone) => {
            track("audit_gratuit_phone_left", { score_band: scoreBand(lead.score) });
            setLead({ ...lead, phoneLeft: true, scan: { ...lead.scan } });
            setPhoneShown(phone);
            setPhase("done");
          }}
        />
      )}
      {phase === "done" && lead && <DoneStep lead={lead} phone={phoneShown} />}
    </div>
  );
}

// ─── 1. L'établissement ──────────────────────────────────────────────────────

function SearchStep({ onStarted }: { onStarted: (id: string) => void }) {
  const [q, setQ] = useState("");
  const [items, setItems] = useState<Suggestion[]>([]);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const [picked, setPicked] = useState<Suggestion | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [searchError, setSearchError] = useState<string | null>(null);
  const session = useRef<string>("");
  if (!session.current) session.current = newSession();

  useEffect(() => {
    if (picked || q.trim().length < 2) {
      setItems([]);
      return;
    }
    const ctrl = new AbortController();
    const t = setTimeout(async () => {
      try {
        const res = await fetch(`/api/audit-gratuit/suggest?q=${encodeURIComponent(q.trim())}&s=${session.current}`, { signal: ctrl.signal });
        const j = (await res.json()) as { suggestions?: Suggestion[]; error?: string };
        if (!res.ok) {
          setSearchError(j.error === "trop_de_recherches" ? "Trop de recherches depuis cette connexion : patientez quelques minutes." : "La recherche est momentanément indisponible.");
          setItems([]);
          return;
        }
        setSearchError(null);
        setItems(j.suggestions ?? []);
        setActive(0);
        setOpen(true);
      } catch {
        /* frappe suivante : requête annulée */
      }
    }, 250);
    return () => {
      clearTimeout(t);
      ctrl.abort();
    };
  }, [q, picked]);

  const choose = (s: Suggestion) => {
    setPicked(s);
    setOpen(false);
    setError(null);
  };

  const launch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!picked) {
      setError("Choisissez l'établissement dans la liste.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/audit-gratuit/start", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ placeId: picked.placeId, session: session.current }),
      });
      const j = (await res.json()) as { id?: string; error?: string };
      if (!res.ok || !j.id) {
        setError(START_ERRORS[j.error ?? "echec"] ?? START_ERRORS.echec);
        setBusy(false);
        return;
      }
      onStarted(j.id);
    } catch {
      setError(START_ERRORS.indisponible);
      setBusy(false);
    }
  };

  return (
    <section className="max-w-[1200px] mx-auto px-4 sm:px-8 py-10 sm:py-16">
      <div className="grid lg:grid-cols-[1.05fr_1fr] rounded-2xl overflow-hidden border border-paper-border shadow-[0_24px_64px_rgba(0,0,0,0.08)]">
        <div className="bg-ink text-night-text p-7 sm:p-10 flex flex-col gap-6">
          <p className="font-mono text-[11px] tracking-[0.12em] uppercase text-moss">▶ Audit gratuit</p>
          <h1 className="font-display text-[30px] sm:text-[38px] leading-[1.1] tracking-[-0.02em] font-bold text-white text-pretty">
            Découvrez la première impression que vous laissez à vos clients.
          </h1>
          <ul className="flex flex-col gap-3 text-[14.5px] leading-relaxed">
            {[
              ["Fiche Google", "horaires, photos, liens de commande : ce qui manque et ce que cela coûte."],
              ["Avis", "la note, les avis récents et les sujets qui reviennent."],
              ["Concurrents à 600 m", "leur note, leur volume d'avis, votre rang parmi eux."],
              ["Site et mobile", "ce qu'un client voit en ouvrant votre site sur son téléphone."],
            ].map(([t, d]) => (
              <li key={t} className="grid grid-cols-[20px_1fr] gap-2">
                <span className="font-mono text-moss">✓</span>
                <span>
                  <b className="text-white font-semibold">{t}</b> — {d}
                </span>
              </li>
            ))}
          </ul>
          <div className="flex items-center gap-4 border-t border-night-line pt-5 mt-auto">
            <div className="w-[58px] h-[58px] rounded-full border-[6px] border-night-line grid place-items-center shrink-0">
              <span className="font-display font-bold text-moss text-2xl">?</span>
            </div>
            <p className="text-[13px] leading-relaxed m-0">
              Une note sur 100 en moins d&apos;une minute, puis le rapport complet et cinq priorités concrètes sur WhatsApp.
            </p>
          </div>
        </div>

        <form onSubmit={launch} className="bg-paper p-7 sm:p-10 flex flex-col gap-5">
          <p className="font-mono text-[10.5px] tracking-[0.1em] uppercase text-ink-faint m-0">
            <b className="text-moss-dark font-medium">1 · Établissement</b> — 2 · Analyse — 3 · Note
          </p>
          <div>
            <label htmlFor="audit-q" className="block text-sm font-semibold text-ink mb-1.5">
              Établissement
            </label>
            {picked ? (
              <div className="flex items-center justify-between gap-3 bg-moss-tint border-[1.5px] border-moss-tint2 rounded-lg px-4 py-3">
                <span>
                  <b className="block text-ink text-[15px]">{picked.name}</b>
                  <span className="text-[13px] text-ink-body">{picked.address}</span>
                </span>
                <button type="button" onClick={() => { setPicked(null); setQ(""); }} className="text-moss-dark font-semibold text-sm">
                  Modifier
                </button>
              </div>
            ) : (
              <div className="relative">
                <input
                  id="audit-q"
                  type="text"
                  autoComplete="off"
                  value={q}
                  placeholder="Ex. : Belchicken Uccle"
                  onChange={(e) => { setQ(e.target.value); setOpen(true); }}
                  onFocus={() => items.length && setOpen(true)}
                  onKeyDown={(e) => {
                    if (!open || !items.length) return;
                    if (e.key === "ArrowDown") { e.preventDefault(); setActive((a) => Math.min(items.length - 1, a + 1)); }
                    if (e.key === "ArrowUp") { e.preventDefault(); setActive((a) => Math.max(0, a - 1)); }
                    if (e.key === "Enter") { e.preventDefault(); choose(items[active]); }
                    if (e.key === "Escape") setOpen(false);
                  }}
                  role="combobox"
                  aria-expanded={open && items.length > 0}
                  aria-controls="audit-suggestions"
                  className="w-full text-[15px] font-medium text-ink px-4 py-3.5 border-[1.5px] border-paper-border focus:border-moss rounded-lg bg-white outline-none"
                />
                {open && items.length > 0 && (
                  <ul id="audit-suggestions" role="listbox" className="absolute z-10 left-0 right-0 top-[calc(100%+4px)] bg-white border border-paper-border rounded-xl shadow-[0_14px_34px_rgba(10,10,10,0.12)] overflow-hidden">
                    {items.map((s, i) => (
                      <li key={s.placeId} role="option" aria-selected={i === active}>
                        <button
                          type="button"
                          onMouseEnter={() => setActive(i)}
                          onClick={() => choose(s)}
                          className={`w-full text-left grid grid-cols-[16px_1fr] gap-2.5 px-4 py-3 border-b border-paper-subtle ${i === active ? "bg-moss-tint" : ""}`}
                        >
                          <span className="text-moss-dark text-xs mt-1">●</span>
                          <span>
                            <b className="block text-ink text-sm font-semibold">{s.name}</b>
                            <span className="text-[13px] text-ink-muted">{s.address}</span>
                          </span>
                        </button>
                      </li>
                    ))}
                    <li className="px-4 py-2 text-[11.5px] text-ink-faint bg-paper">Recherche limitée aux 19 communes de Bruxelles</li>
                  </ul>
                )}
              </div>
            )}
            <p className="text-[12.5px] text-ink-muted mt-1.5 mb-0">
              {searchError ?? "Nom de l'établissement tel qu'il apparaît sur Google Maps."}
            </p>
          </div>

          <button
            type="submit"
            disabled={busy}
            className="w-full bg-moss hover:bg-moss-dark disabled:opacity-60 text-white text-[15px] font-bold px-6 py-4 rounded-lg transition-colors"
          >
            {busy ? "Lancement…" : "Lancer l'analyse gratuite →"}
          </button>
          {error && <p className="text-sm text-warn m-0" role="alert">{error}</p>}
          <p className="text-center text-[13px] text-ink-muted m-0">
            Pas besoin d&apos;audit ?{" "}
            <Link href="/become-a-partner" className="text-ink font-semibold underline underline-offset-4 decoration-paper-border">
              Commencer le plan gratuit
            </Link>
          </p>
        </form>
      </div>
    </section>
  );
}

// ─── 2. L'analyse en direct ──────────────────────────────────────────────────

const STEP_LABEL: Record<StepKey, (l: LeadView | null) => string> = {
  voisins: (l) => `${l?.name ?? "L'établissement"} et ses concurrents`,
  fiche: () => "Fiche Google",
  avis: () => "Avis Google",
  photos: () => "Photos : qualité et quantité",
  site: (l) => (l?.scan.place?.website ? shortUrl(l.scan.place.website) : "Site web"),
  mobile: () => "Expérience sur mobile",
};

function shortUrl(u: string): string {
  try {
    return new URL(u).hostname.replace(/^www\./, "");
  } catch {
    return u.slice(0, 32);
  }
}

function ScanStep({ leadId, onLead, onDone, onLost }: { leadId: string; onLead: (l: LeadView) => void; onDone: (l: LeadView) => void; onLost: () => void }) {
  const [lead, setLead] = useState<LeadView | null>(null);
  const [revealed, setRevealed] = useState(0);
  const [now, setNow] = useState(() => Date.now());
  const lastReveal = useRef(Date.now());
  const revealedRef = useRef(0);
  const finished = useRef(false);
  const leadRef = useRef<LeadView | null>(null);

  // Interrogation du serveur tant que l'analyse tourne.
  useEffect(() => {
    let stop = false;
    let timer: ReturnType<typeof setTimeout>;
    const poll = async () => {
      try {
        const res = await fetch(`/api/audit-gratuit/${leadId}`, { cache: "no-store" });
        if (res.status === 404) return onLost();
        if (res.ok) {
          const j = (await res.json()) as LeadView;
          leadRef.current = j;
          setLead(j);
          onLead(j);
          if (j.status !== "en_cours") return;
        }
      } catch {
        /* réseau : on réessaie */
      }
      if (!stop) timer = setTimeout(poll, POLL_MS);
    };
    poll();
    return () => {
      stop = true;
      clearTimeout(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [leadId]);

  // Avance d'une étape quand sa donnée est là ET qu'elle a été montrée assez longtemps.
  useEffect(() => {
    const t = setInterval(() => {
      const l = leadRef.current;
      const n = Date.now();
      setNow(n);
      if (!l || finished.current) return;
      if (l.status === "hors_zone" || (l.status === "echec" && !l.scan.steps)) {
        finished.current = true;
        onDone(l);
        return;
      }
      // Pas d'effet de bord dans un « updater » setState : React l'appelle deux fois en mode strict.
      const r = revealedRef.current;
      if (r >= STEP_ORDER.length) return;
      const s = l.scan.steps?.[STEP_ORDER[r]];
      const ready = (s && s !== "en_cours") || l.status !== "en_cours";
      if (ready && n - lastReveal.current >= MIN_STEP_MS) {
        lastReveal.current = n;
        revealedRef.current = r + 1;
        setRevealed(r + 1);
      }
    }, 250);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (revealed >= STEP_ORDER.length && lead && lead.status !== "en_cours" && !finished.current) {
      finished.current = true;
      const t = setTimeout(() => onDone(lead), 1200);
      return () => clearTimeout(t);
    }
  }, [revealed, lead, onDone]);

  const current = STEP_ORDER[Math.min(revealed, STEP_ORDER.length - 1)];
  const leftMs = (STEP_ORDER.length - revealed) * MIN_STEP_MS - (now - lastReveal.current);
  const left = Math.ceil(leftMs / 1000);
  const done = revealed >= STEP_ORDER.length;

  return (
    <section className="max-w-[1200px] mx-auto px-4 sm:px-8 py-8 sm:py-12">
      <div className="grid md:grid-cols-[300px_1fr] gap-4 bg-paper-subtle rounded-2xl p-3 sm:p-4 min-h-[560px]">
        {/* Sur mobile, ce qu'on lit passe au-dessus de la liste : c'est ce qui convainc. */}
        <aside className="order-2 md:order-1 bg-white rounded-xl p-6 flex flex-col gap-5">
          <h1 className="font-display text-[19px] font-bold text-ink m-0">{done ? "Analyse terminée" : "Analyse en cours…"}</h1>
          <ol className="flex flex-col gap-0 m-0 p-0 list-none" aria-live="polite">
            {STEP_ORDER.map((k, i) => {
              const state = i < revealed ? "ok" : i === revealed ? "run" : "todo";
              return (
                <li key={k} className="relative pl-9 pb-5 last:pb-0 text-[14.5px] leading-[22px]">
                  {i < STEP_ORDER.length - 1 && (
                    <span className={`absolute left-[9px] top-6 bottom-1 w-0.5 ${state === "ok" ? "bg-moss-tint2" : "bg-paper-subtle"}`} />
                  )}
                  <span
                    className={`absolute left-0 top-0 w-5 h-5 rounded-full grid place-items-center text-[11px] font-bold ${
                      state === "ok" ? "bg-moss-dark text-white" : state === "run" ? `border-2 border-moss-tint2 border-t-moss-dark ${styles.spin}` : "border-2 border-paper-border"
                    }`}
                    aria-hidden="true"
                  >
                    {state === "ok" ? "✓" : ""}
                  </span>
                  <span className={state === "todo" ? "text-ink-faint" : "text-ink"}>{STEP_LABEL[k](lead)}</span>
                </li>
              );
            })}
          </ol>
          <div className="mt-auto bg-paper rounded-lg overflow-hidden">
            <div className="h-[3px] bg-paper-subtle">
              <div className="h-full bg-ink transition-[width] duration-300" style={{ width: `${(revealed / STEP_ORDER.length) * 100}%` }} />
            </div>
            <p className="m-0 px-4 py-3.5 font-semibold text-ink text-[14.5px] flex items-center gap-2.5">
              {!done && <span className={`w-3.5 h-3.5 rounded-full border-2 border-paper-border border-t-ink inline-block ${styles.spin}`} aria-hidden="true" />}
              {done ? "Calcul de la note…" : left > 1 ? `${left} secondes restantes` : "Encore quelques secondes…"}
            </p>
          </div>
        </aside>

        <div className="order-1 md:order-2 relative overflow-hidden rounded-xl bg-[#F6F5F0] min-h-[400px] md:min-h-[480px]">
          <div key={current} className={`absolute inset-0 grid place-items-center p-5 sm:p-8 ${styles.enter}`}>
            <StepView step={current} lead={lead} />
          </div>
          {!done && <div className={styles.scanline} aria-hidden="true" />}
        </div>
      </div>
    </section>
  );
}

function StepView({ step, lead }: { step: StepKey; lead: LeadView | null }) {
  const s = lead?.scan;
  const place = s?.place;
  const ready = s?.steps?.[step] && s.steps[step] !== "en_cours";

  if (step === "voisins") {
    return (
      <div className={`relative w-full h-full min-h-[420px] rounded-xl overflow-hidden ${styles.map}`}>
        <div className="absolute left-1/2 top-1/2 w-[64%] aspect-square -translate-x-1/2 -translate-y-1/2 rounded-full border-[1.5px] border-dashed border-moss-dark bg-moss/[0.07]" />
        <Pin x={50} y={50} label={place?.name ?? lead?.name ?? "…"} me />
        {(s?.neighbors ?? []).slice(0, 6).map((n) => (
          <Pin key={`${n.name}${n.dx}`} x={clamp(50 + (n.dx / 640) * 32 * 1.5, 8, 92)} y={clamp(50 - (n.dy / 640) * 32 * 1.5, 10, 94)} label={n.name} />
        ))}
        {ready && !s?.neighbors?.length && <Note>Aucun concurrent noté à moins de 600 m.</Note>}
      </div>
    );
  }

  if (step === "fiche") {
    return (
      <Phone>
        <div className={`h-[110px] ${styles.map} relative`}>
          <span className="absolute left-1/2 top-[45%] w-4 h-4 bg-[#C5221F] rounded-[50%_50%_50%_0] -translate-x-1/2 -translate-y-1/2 -rotate-45" />
        </div>
        <div className="p-3.5 flex flex-col gap-1.5">
          <b className="text-[16px] text-[#202124]">{place?.name ?? lead?.name}</b>
          {place?.rating != null && (
            <p className="m-0 text-[12.5px] text-[#E37400]">
              {place.rating.toFixed(1).replace(".", ",")} {stars(place.rating)} <span className="text-[#5f6368]">({place.reviewsCount ?? 0})</span>
            </p>
          )}
          {place?.category && <p className="m-0 text-[12.5px] text-[#5f6368]">{place.category}</p>}
          <div className="flex flex-wrap gap-1.5 my-1">
            <Chip on>Itinéraire</Chip>
            <Chip on={!!place?.phone}>Appeler</Chip>
            <Chip on={!!place?.website}>Site Web</Chip>
            {place?.orderButton !== null && place?.orderButton !== undefined && <Chip on={place.orderButton}>Commander</Chip>}
          </div>
          <p className="m-0 text-[12.5px] text-[#5f6368]">
            {!place?.hasHours ? "Horaires non renseignés" : place.openNow == null ? "Horaires renseignés" : place.openNow ? "Ouvert en ce moment" : "Fermé en ce moment"}
          </p>
          {s?.photos?.length ? (
            <div className="grid grid-cols-3 gap-1 mt-1.5">
              {s.photos.slice(0, 3).map((u) => (
                // eslint-disable-next-line @next/next/no-img-element
                <img key={u} src={u} alt="" className="aspect-square object-cover rounded-md" referrerPolicy="no-referrer" />
              ))}
            </div>
          ) : null}
        </div>
      </Phone>
    );
  }

  if (step === "avis") {
    const reviews = s?.reviews ?? [];
    if (ready && !reviews.length) return <Note>Aucun avis rédigé sur la fiche.</Note>;
    return (
      <div className="w-full max-w-[540px] flex flex-col gap-3 self-start">
        {reviews.map((r, i) => (
          <div key={i} className="bg-white rounded-2xl px-5 py-4 shadow-[0_2px_10px_rgba(10,10,10,0.06)]" style={{ transform: `rotate(${[-0.6, 0.8, -0.4, 1.1, -0.9][i % 5]}deg)` }}>
            <div className="grid grid-cols-[36px_1fr_auto] gap-2.5 items-center">
              <span className="w-9 h-9 rounded-full grid place-items-center font-bold text-white" style={{ background: ["#6B4F3A", "#3C6E71", "#8C5E8A", "#5A7D2A", "#A65B3B"][i % 5] }}>
                {r.initial}
              </span>
              <span>
                <b className="block text-ink text-[14px]">{r.initial}.</b>
                <span className="text-[12px] text-ink-faint">{r.when}</span>
              </span>
              <span className="text-[#E08A2E] tracking-[1px] text-sm" aria-label={`${r.rating ?? "?"} étoiles`}>
                {stars(r.rating ?? 0)}
              </span>
            </div>
            <p className="mt-2 mb-0 text-[13.5px] leading-relaxed text-ink-body line-clamp-3">{r.text}</p>
          </div>
        ))}
        {!reviews.length && <Skeleton lines={5} />}
      </div>
    );
  }

  if (step === "photos") {
    const photos = s?.photos ?? [];
    if (ready && !photos.length) return <Note>Aucune photo lisible sur la fiche.</Note>;
    return (
      <div className="flex flex-col items-center">
        {photos.map((u, i) => (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            key={u}
            src={u}
            alt=""
            referrerPolicy="no-referrer"
            className="w-[min(380px,82vw)] aspect-[16/10] object-cover rounded-md border-[7px] border-white shadow-[0_10px_30px_rgba(10,10,10,0.14)]"
            style={{ transform: `rotate(${[3, -2, 1.5, -3][i % 4]}deg)`, marginTop: i ? -26 : 0 }}
          />
        ))}
        {!photos.length && <Skeleton lines={3} />}
        {place?.totalPhotos != null && <p className="mt-4 text-[13px] text-ink-muted">{place.totalPhotos} photos sur la fiche</p>}
      </div>
    );
  }

  if (step === "site") {
    if (ready && !s?.site) return <Note>Aucun site web relié à la fiche Google.</Note>;
    return (
      <div className="w-full max-w-[520px] flex flex-col gap-4">
        <div className="bg-white rounded-xl p-5 shadow-[0_2px_10px_rgba(10,10,10,0.06)]">
          <p className="font-mono text-[11px] text-ink-faint m-0">{s?.site ? shortUrl(s.site.url) : shortUrl(place?.website ?? "")}</p>
          <p className="font-display font-bold text-ink text-lg mt-1 mb-0">{s?.site?.title ?? "Lecture de la page d'accueil…"}</p>
        </div>
        <Checks checks={s?.site?.checks} />
      </div>
    );
  }

  // mobile
  if (ready && !s?.mobile) return <Note>Pas de site à tester sur mobile.</Note>;
  const speed = s?.mobile?.speed;
  return (
    <div className="w-full max-w-[520px] flex flex-col items-center gap-5">
      <div className="w-[140px] h-[140px] rounded-full grid place-items-center bg-white shadow-[0_2px_10px_rgba(10,10,10,0.06)]" style={speed != null ? { background: `conic-gradient(${speed >= 0.5 ? "#467F3B" : "#9E6612"} 0 ${speed * 100}%, #F0F0EC ${speed * 100}% 100%)` } : undefined}>
        <span className="w-[112px] h-[112px] rounded-full bg-white grid place-items-center text-center">
          <span>
            <b className="block font-display text-3xl text-ink">{speed != null ? Math.round(speed * 100) : "…"}</b>
            <span className="text-[11px] text-ink-muted">vitesse mobile</span>
          </span>
        </span>
      </div>
      <Checks checks={s?.mobile?.checks} />
    </div>
  );
}

function Checks({ checks }: { checks?: { label: string; ok: boolean; detail?: string }[] }) {
  if (!checks) return <Skeleton lines={3} />;
  return (
    <div className="flex flex-wrap gap-2">
      {checks.map((c) => (
        <span key={c.label} className={`bg-white rounded-full px-3.5 py-2 text-[13px] font-semibold shadow-[0_4px_14px_rgba(10,10,10,0.08)] ${c.ok ? "text-good" : "text-warn"}`} title={c.detail}>
          <span className="font-mono mr-1.5">{c.ok ? "✓" : "!"}</span>
          {c.label}
        </span>
      ))}
    </div>
  );
}

function Pin({ x, y, label, me = false }: { x: number; y: number; label: string; me?: boolean }) {
  return (
    <span className="absolute -translate-x-1/2 -translate-y-full flex flex-col items-center gap-1.5" style={{ left: `${x}%`, top: `${y}%` }}>
      <b className={`rounded-lg px-2.5 py-1.5 text-[12.5px] whitespace-nowrap shadow-[0_4px_14px_rgba(10,10,10,0.12)] max-w-[180px] truncate ${me ? "bg-ink text-white" : "bg-white text-ink"}`}>
        {label}
      </b>
      <span className={`rounded-full bg-white ${me ? "w-[18px] h-[18px] border-4 border-moss" : "w-3.5 h-3.5 border-4 border-[#C38A3E]"}`} />
    </span>
  );
}

function Phone({ children }: { children: React.ReactNode }) {
  return (
    <div className="w-[250px] bg-white border-[1.5px] border-paper-border rounded-[26px] p-2 shadow-[0_24px_60px_rgba(10,10,10,0.14)]">
      <div className="rounded-[19px] overflow-hidden min-h-[420px] bg-white">{children}</div>
    </div>
  );
}

function Chip({ on, children }: { on: boolean; children: React.ReactNode }) {
  return (
    <span className={`text-[11px] rounded-full px-2.5 py-1 border ${on ? "border-[#dadce0] text-[#1a73e8]" : "border-dashed border-[#dadce0] text-[#9aa0a6] line-through"}`}>
      {children}
    </span>
  );
}

function Skeleton({ lines }: { lines: number }) {
  return (
    <div className="w-full max-w-[480px] bg-white rounded-xl p-5 flex flex-col gap-3">
      {Array.from({ length: lines }, (_, i) => (
        <span key={i} className="h-2.5 rounded bg-paper-subtle" style={{ width: `${[80, 60, 90, 50, 70][i % 5]}%` }} />
      ))}
    </div>
  );
}

function Note({ children }: { children: React.ReactNode }) {
  return <p className="bg-white rounded-xl px-5 py-4 text-sm text-ink-body shadow-[0_2px_10px_rgba(10,10,10,0.06)] m-0">{children}</p>;
}

const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));
const stars = (r: number) => "★".repeat(Math.round(r)) + "☆".repeat(5 - Math.round(r));

// ─── 3. La note, et le numéro qui débloque le rapport ───────────────────────

const VOLET_LABEL: Record<QuickVolet, string> = { fiche: "Fiche Google", avis: "Avis", concurrents: "Concurrents", site: "Site et mobile" };

function ResultStep({ leadId, lead, onPhone }: { leadId: string; lead: LeadView; onPhone: (phone: string) => void }) {
  const s = lead.scan;
  const score = lead.score;
  const horsZone = lead.status === "hors_zone";
  const failed = lead.status === "echec" || (!horsZone && score == null);
  const ahead = s.ranking?.ahead.slice(0, 2) ?? [];
  const negative = useMemo(() => s.reviews?.find((r) => (r.rating ?? 5) <= 2), [s.reviews]);

  return (
    <section className="max-w-[1200px] mx-auto px-4 sm:px-8 py-8 sm:py-12">
      <div className="grid md:grid-cols-[300px_1fr] gap-4 bg-paper-subtle rounded-2xl p-3 sm:p-4 min-h-[560px]">
        <aside className="bg-white rounded-xl p-6 flex flex-col items-center text-center gap-4">
          {horsZone || failed ? (
            <>
              <div className="w-[150px] h-[150px] rounded-full border-[10px] border-paper-subtle grid place-items-center">
                <span className="font-display text-5xl font-bold text-ink-faint">?</span>
              </div>
              <p className="font-display text-xl text-ink m-0">{lead.name}</p>
              <p className="text-sm text-ink-muted m-0">
                {horsZone ? "L'audit couvre pour l'instant les 19 communes de Bruxelles." : "L'analyse automatique n'a pas pu aller au bout pour cette fiche."}
              </p>
            </>
          ) : (
            <>
              <Ring score={score!} />
              <p className="text-sm text-ink-muted m-0">Présence en ligne</p>
              <p className={`font-display text-2xl -mt-3 m-0 ${score! >= 75 ? "text-good" : "text-warn"}`}>{s.verdict ? VERDICT_LABEL[s.verdict] : ""}</p>
              <ul className="w-full mt-auto flex flex-col gap-3.5 text-left list-none p-0 m-0">
                {(Object.keys(VOLET_LABEL) as QuickVolet[]).map((k) => {
                  const v = s.scores?.[k];
                  return (
                    <li key={k} className="grid grid-cols-[12px_1fr_auto] gap-2.5 items-center text-sm font-semibold text-ink">
                      <span className={`w-3 h-3 rounded-full border-[3px] ${v == null ? "border-paper-border" : v >= 75 ? "border-good" : "border-warn"}`} />
                      <span>{VOLET_LABEL[k]}</span>
                      <span className="font-medium text-ink-muted tabular-nums text-[13px]">{v == null ? "non lu" : `${v} / 100`}</span>
                    </li>
                  );
                })}
              </ul>
              <p className="text-[11.5px] text-ink-faint m-0">Score rapide, affiné dans le rapport complet.</p>
            </>
          )}
        </aside>

        <div className="relative overflow-hidden rounded-xl bg-[#F6F5F0] min-h-[480px] grid place-items-center p-5 sm:p-8">
          {!horsZone && !failed && (
            <div className={`absolute inset-5 sm:inset-8 grid sm:grid-cols-2 gap-4 content-start ${styles.blurred}`} aria-hidden="true">
              <div className="bg-white rounded-xl p-5">
                <h3 className="font-display text-base text-ink m-0">{s.ficheIssues?.length ?? 0} points à corriger sur la fiche</h3>
                <p className="text-[13.5px] mt-2 mb-0">{(s.ficheIssues ?? []).join(" · ")}</p>
              </div>
              <div className="bg-white rounded-xl p-5">
                <h3 className="font-display text-base text-ink m-0">Classement face aux voisins</h3>
                <p className="text-[13.5px] mt-2 mb-0">
                  {(s.neighbors ?? []).slice(0, 4).map((n) => `${n.name} ${n.rating?.toFixed(1) ?? "–"}`).join(" · ")}
                </p>
              </div>
              <div className="bg-white rounded-xl p-5 sm:col-span-2">
                <h3 className="font-display text-base text-ink m-0">Ce que disent les avis</h3>
                <p className="text-[13.5px] mt-2 mb-0">{negative?.text ?? s.reviews?.[0]?.text ?? ""}</p>
              </div>
            </div>
          )}
          <PhoneGate
            leadId={leadId}
            onPhone={onPhone}
            title={horsZone ? "Être prévenu" : failed ? "Recevoir l'audit quand même" : "Voir le rapport complet"}
            pitch={
              horsZone ? (
                <>Laissez votre numéro : l&apos;équipe vous écrit dès que l&apos;audit couvre votre commune.</>
              ) : failed ? (
                <>Laissez votre numéro : l&apos;équipe fait l&apos;audit de <b>{lead.name}</b> à la main et vous l&apos;envoie sur WhatsApp.</>
              ) : ahead.length ? (
                <>
                  Pourquoi <b>{ahead[0]}</b>
                  {ahead[1] ? <> et <b>{ahead[1]}</b></> : null} {ahead.length > 1 ? "passent" : "passe"} devant sur Google, et les cinq priorités pour les rattraper.
                </>
              ) : (
                <>Le détail de chaque point à corriger et les cinq priorités pour gagner des clients.</>
              )
            }
          />
        </div>
      </div>
    </section>
  );
}

function Ring({ score }: { score: number }) {
  const c = 2 * Math.PI * 50;
  return (
    <div className="relative w-[150px] h-[150px]">
      <svg viewBox="0 0 120 120" className="w-full h-full -rotate-90" aria-hidden="true">
        <circle cx="60" cy="60" r="50" fill="none" strokeWidth="10" className="stroke-paper-subtle" />
        <circle cx="60" cy="60" r="50" fill="none" strokeWidth="10" strokeLinecap="round" className={score >= 75 ? "stroke-good" : "stroke-warn"} strokeDasharray={`${(score / 100) * c} ${c}`} />
      </svg>
      <div className="absolute inset-0 grid place-content-center">
        <b className="font-display text-[46px] leading-none text-ink">{score}</b>
        <span className="text-[13px] text-ink-muted">sur 100</span>
      </div>
    </div>
  );
}

function PhoneGate({ leadId, onPhone, title, pitch }: { leadId: string; onPhone: (phone: string) => void; title: string; pitch: React.ReactNode }) {
  const [phone, setPhone] = useState("");
  const [consent, setConsent] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      if (!consent) {
        setError("Cochez la case pour recevoir le rapport sur WhatsApp.");
        return;
      }
      setBusy(true);
      setError(null);
      try {
        const raw = phone.trim().startsWith("+") || phone.trim().startsWith("0") ? phone : `+32${phone}`;
        const res = await fetch(`/api/audit-gratuit/${leadId}/phone`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ phone: raw, consent }),
        });
        const j = (await res.json()) as { ok?: boolean; error?: string };
        if (!res.ok) {
          setError(j.error === "numero_invalide" ? "Ce numéro de mobile n'est pas valide (ex. : 470 12 34 56)." : "L'envoi n'a pas abouti. Réessayez dans un instant.");
          setBusy(false);
          return;
        }
        onPhone(raw);
      } catch {
        setError("L'envoi n'a pas abouti. Réessayez dans un instant.");
        setBusy(false);
      }
    },
    [phone, consent, leadId, onPhone],
  );

  return (
    <form onSubmit={submit} className="relative z-10 w-full max-w-[440px] bg-white rounded-2xl shadow-[0_24px_60px_rgba(10,10,10,0.16)] p-7 flex flex-col gap-3.5 text-center">
      <h2 className="font-display text-2xl font-bold text-ink tracking-[-0.02em] m-0">{title}</h2>
      <p className="text-[14.5px] leading-relaxed text-ink-muted m-0">{pitch}</p>
      <label htmlFor="audit-phone" className="sr-only">
        Numéro de mobile WhatsApp
      </label>
      <div className="grid grid-cols-[auto_1fr]">
        <span className="grid place-items-center px-3 border-[1.5px] border-r-0 border-paper-border rounded-l-lg bg-paper font-semibold text-ink text-[14.5px]">+32</span>
        <input
          id="audit-phone"
          type="tel"
          inputMode="tel"
          autoComplete="tel-national"
          required
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          placeholder="470 12 34 56"
          className="w-full text-[15px] font-medium text-ink px-4 py-3.5 border-[1.5px] border-paper-border focus:border-moss rounded-r-lg bg-white outline-none"
        />
      </div>
      <label className="grid grid-cols-[18px_1fr] gap-2.5 text-left text-[12.5px] leading-relaxed text-ink-muted">
        <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} className="mt-0.5 accent-moss-dark" />
        <span>J&apos;accepte d&apos;être contacté sur WhatsApp au sujet de cet audit. Le numéro n&apos;est ni revendu ni utilisé pour autre chose.</span>
      </label>
      <button type="submit" disabled={busy} className="bg-moss hover:bg-moss-dark disabled:opacity-60 text-white font-bold text-[15px] px-6 py-3.5 rounded-lg transition-colors">
        {busy ? "Envoi…" : "Recevoir le rapport sur WhatsApp →"}
      </button>
      {error && <p className="text-sm text-warn m-0" role="alert">{error}</p>}
    </form>
  );
}

// ─── 4. Confirmation ─────────────────────────────────────────────────────────

function DoneStep({ lead, phone }: { lead: LeadView; phone: string }) {
  const horsZone = lead.status === "hors_zone";
  return (
    <section className="max-w-[640px] mx-auto px-4 sm:px-8 py-14 sm:py-20">
      <div className="bg-white border border-paper-border rounded-2xl p-8 sm:p-10 flex flex-col gap-4">
        <span className="w-11 h-11 rounded-full bg-moss-tint text-moss-dark grid place-items-center text-xl font-bold">✓</span>
        <h1 className="font-display text-[26px] font-bold text-ink tracking-[-0.02em] m-0">C&apos;est noté</h1>
        {horsZone ? (
          <p className="text-[15px] leading-relaxed text-ink-body m-0">
            L&apos;équipe Boosteats vous écrit sur WhatsApp{phone ? <> au <b>{phone}</b></> : null} dès que l&apos;audit couvre la commune de <b>{lead.name}</b>.
          </p>
        ) : (
          <>
            <p className="text-[15px] leading-relaxed text-ink-body m-0">
              Le rapport complet de <b>{lead.name}</b> arrive sur WhatsApp{phone ? <> au <b>{phone}</b></> : null} sous 48 h ouvrées.
            </p>
            <ol className="text-[14.5px] leading-relaxed text-ink-body pl-5 m-0 flex flex-col gap-1.5">
              <li>Lecture complète des avis et des concurrents.</li>
              <li>Relecture par l&apos;équipe Boosteats.</li>
              <li>Envoi du rapport sur WhatsApp.</li>
            </ol>
          </>
        )}
        <Link href="/#produit" className="text-ink font-semibold underline underline-offset-4 decoration-paper-border text-[14.5px] mt-2">
          En attendant, voir le produit
        </Link>
      </div>
    </section>
  );
}
