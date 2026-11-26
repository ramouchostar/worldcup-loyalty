"use client";

import { useCallback, useEffect, useState } from "react";
import { readJsonSafe } from "@/lib/fetch-json";
import { euro } from "@/lib/site-orders/cart";
import type { ProblemState, WeeklyReport } from "@/lib/site-orders/report";

// ADR 0108 §6 — le rapport de la semaine (maquette validée le 2026-11-20) : six chiffres, les plats, les heures, et ce qui n'a pas
// marché. Un chiffre qu'on ne sait pas mesurer s'écrit « — » avec la raison, jamais un zéro inventé.

const card = "rounded-lg border border-paper-border bg-white";
const btn = "min-h-[44px] rounded-lg border border-paper-border bg-white px-4 py-2 text-[15px] font-semibold text-ink hover:border-ink-faint focus-visible:outline focus-visible:outline-2 focus-visible:outline-ink";

const STATE: Record<ProblemState, { label: string; tone: string }> = {
  regle: { label: "Réglé", tone: "text-boost-olive-dark" },
  a_regler: { label: "À régler", tone: "text-danger" },
  a_verifier: { label: "À vérifier", tone: "text-ink-muted" },
};

// Un jour « AAAA-MM-JJ » se lit à midi UTC : aucun fuseau ne le fait changer de date.
const dayLabel = (day: string, weekday: boolean) =>
  new Date(`${day}T12:00:00Z`).toLocaleDateString("fr-BE", { ...(weekday ? { weekday: "long" } : {}), day: "numeric", month: "long", timeZone: "UTC" });
const capital = (s: string) => s.charAt(0).toLocaleUpperCase("fr-BE") + s.slice(1);
const ordersWord = (n: number) => `${n} commande${n > 1 ? "s" : ""}`;

type Phase = "loading" | "ready" | "closed" | "unavailable" | "error";

export function WeeklyReportView({ restaurantId }: { restaurantId: string }) {
  const [report, setReport] = useState<WeeklyReport | null>(null);
  const [phase, setPhase] = useState<Phase>("loading");

  const load = useCallback(async () => {
    setPhase("loading");
    try {
      const res = await fetch(`/api/admin/site-orders/report?restaurantId=${encodeURIComponent(restaurantId)}`, { cache: "no-store" });
      const { data } = await readJsonSafe<{ report?: WeeklyReport }>(res);
      if (res.status === 404) { setPhase("closed"); return; }
      if (res.status === 503) { setPhase("unavailable"); return; }
      if (!res.ok || !data?.report) { setPhase("error"); return; }
      setReport(data.report);
      setPhase("ready");
    } catch {
      setPhase("error");
    }
  }, [restaurantId]);

  useEffect(() => { void load(); }, [load]);

  if (phase === "loading") return <div role="status" aria-label="Nina prépare ton rapport" className="grid grid-cols-2 gap-4 sm:grid-cols-3">{[1, 2, 3, 4, 5, 6].map((i) => <div key={i} className={`h-24 animate-pulse ${card}`} />)}</div>;
  if (phase === "closed") return <p className={`p-4 text-[15px] text-ink ${card}`}>Les commandes de ton site (Nina, en pilote) ne sont pas encore ouvertes pour ton établissement. Nous te prévenons dès que c&apos;est le cas.</p>;
  if (phase === "unavailable") return <p className={`p-4 text-[15px] text-ink ${card}`}>Les commandes du site ne sont pas encore activées pour ton compte. Réessaie dans un moment : nous nous en occupons.</p>;
  if (phase === "error" || !report) {
    return (
      <div className={`flex flex-wrap items-center gap-3 p-4 ${card}`}>
        <p role="alert" className="flex-1 text-[15px] text-danger">Nina n&apos;a pas pu préparer ton rapport. Réessaie dans un instant.</p>
        <button type="button" onClick={() => void load()} className={btn}>Réessayer</button>
      </div>
    );
  }

  const tiles: { label: string; value: string; why?: string }[] = [
    { label: "Commandes reçues", value: String(report.received) },
    { label: "Retirées et payées", value: String(report.pickedUp) },
    { label: "Annulées", value: String(report.cancelled) },
    { label: "Total des commandes retirées", value: euro(report.pickedUpCents) },
    { label: "Nouveaux membres venus par l'espace", value: report.newMembers === null ? "—" : String(report.newMembers), why: report.newMembers === null ? "Pas encore mesuré" : undefined },
    { label: "Délai moyen entre reçue et prête", value: report.avgReadyMinutes === null ? "—" : `${report.avgReadyMinutes} min`, why: report.avgReadyMinutes === null ? "Aucune commande marquée « prête »" : undefined },
  ];

  return (
    <div className="max-w-[900px] space-y-6">
      <p className="text-[15px] text-ink-muted">Du {dayLabel(report.fromDay, false)} au {dayLabel(report.toDay, false)}, aujourd&apos;hui compris. Écrit par Nina.</p>

      <dl aria-label="Chiffres de la semaine" className="grid grid-cols-2 gap-4 sm:grid-cols-3">
        {tiles.map((t) => (
          <div key={t.label} className={`flex flex-col gap-1 p-4 ${card}`}>
            <dt className="text-[13px] text-ink-muted">{t.label}</dt>
            {/* Un gros total (« 12 978,25 € ») doit tenir dans une demi-largeur de téléphone : la taille suit la place. */}
            <dd className="text-[20px] font-semibold leading-tight tabular-nums text-ink sm:text-[24px] lg:text-[32px]">{t.value}</dd>
            {t.why && <dd className="text-[13px] text-ink-muted">{t.why}</dd>}
          </div>
        ))}
      </dl>

      <section aria-label="Plats les plus commandés" className="space-y-2">
        <h2 className="text-[17px] font-semibold text-ink">Plats les plus commandés</h2>
        {report.topDishes.length === 0 ? (
          <p className={`p-4 text-[15px] text-ink-muted ${card}`}>Aucune commande sur ces sept jours.</p>
        ) : (
          <ol className={`divide-y divide-paper-border ${card}`}>
            {report.topDishes.map((d, i) => (
              <li key={`${i}-${d.name}`} className="flex justify-between gap-4 px-4 py-3 text-[15px] text-ink">
                <span className="min-w-0 break-words">{i + 1}. {d.name}</span>
                <span className="whitespace-nowrap font-semibold tabular-nums">{d.qty} fois</span>
              </li>
            ))}
          </ol>
        )}
      </section>

      <section aria-label="Heures de pointe" className="space-y-2">
        <h2 className="text-[17px] font-semibold text-ink">Heures de pointe</h2>
        <PeakHours hours={report.hours} />
      </section>

      <section aria-label="Problèmes de la semaine" className="space-y-2">
        <h2 className="text-[17px] font-semibold text-ink">Ce qui n&apos;a pas marché cette semaine</h2>
        {report.problems.length === 0 ? (
          <p className={`p-4 text-[15px] text-ink-muted ${card}`}>Aucun problème enregistré sur ces sept jours.</p>
        ) : (
          <ul className={`divide-y divide-paper-border ${card}`}>
            {report.problems.map((p) => (
              <li key={`${p.day}-${p.text}`} className="flex flex-wrap justify-between gap-x-4 gap-y-1 px-4 py-3 text-[15px] text-ink">
                <span className="min-w-[200px] flex-1">{capital(dayLabel(p.day, true))} : {p.text}</span>
                <span className={`whitespace-nowrap font-semibold ${STATE[p.state].tone}`}>{STATE[p.state].label}</span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

// Une seule série (le nombre de commandes) : une teinte, pas de légende, la valeur écrite sur la pointe seulement. Les autres se
// lisent au survol ou au clavier, et le tableau les donne toutes (la couleur et le survol ne sont jamais le seul chemin).
function PeakHours({ hours }: { hours: WeeklyReport["hours"] }) {
  const [active, setActive] = useState<number | null>(null);
  if (hours.length === 0) return <p className={`p-4 text-[15px] text-ink-muted ${card}`}>Le graphique apparaîtra avec la première commande.</p>;
  const max = Math.max(...hours.map((h) => h.count));
  const peak = hours.find((h) => h.count === max)!;
  const shown = hours.find((h) => h.hour === active) ?? peak;
  // Au-delà de huit heures, une étiquette sur trois : sur un téléphone, elles se chevaucheraient.
  const step = hours.length > 8 ? 3 : 1;

  return (
    <div className={`space-y-3 p-4 ${card}`}>
      <p aria-live="polite" className="text-[13px] text-ink-muted">
        {active === null ? "Le plus chargé : " : ""}{shown.hour} h, {ordersWord(shown.count)}. Les annulées ne comptent pas.
      </p>
      <div className="flex h-[140px] items-end gap-0.5 border-b border-paper-border" onMouseLeave={() => setActive(null)}>
        {hours.map((h) => (
          <button key={h.hour} type="button" aria-label={`${h.hour} h : ${ordersWord(h.count)}`} title={`${h.hour} h : ${ordersWord(h.count)}`}
            onMouseEnter={() => setActive(h.hour)} onFocus={() => setActive(h.hour)} onBlur={() => setActive(null)} onClick={() => setActive(h.hour)}
            className="flex h-full min-w-0 flex-1 flex-col items-center justify-end focus-visible:outline focus-visible:outline-2 focus-visible:outline-ink">
            {h.hour === peak.hour && <span aria-hidden="true" className="text-[13px] font-semibold tabular-nums text-ink">{h.count}</span>}
            <span aria-hidden="true" className={`w-full max-w-[24px] rounded-t-lg ${active === h.hour ? "bg-boost-olive-dark" : "bg-boost-olive"}`} style={{ height: h.count === 0 ? 0 : Math.max(4, Math.round((h.count / max) * 110)) }} />
          </button>
        ))}
      </div>
      <div aria-hidden="true" className="flex gap-0.5">
        {hours.map((h, i) => <span key={h.hour} className="min-w-0 flex-1 whitespace-nowrap text-center text-[13px] tabular-nums text-ink-muted">{i % step === 0 ? `${h.hour} h` : ""}</span>)}
      </div>
      <details className="text-[15px] text-ink">
        <summary className="min-h-[44px] cursor-pointer py-2 font-semibold">Voir les chiffres</summary>
        <table className="w-full max-w-[320px] text-left tabular-nums">
          <thead><tr><th scope="col" className="py-1 font-semibold">Heure</th><th scope="col" className="py-1 font-semibold">Commandes</th></tr></thead>
          <tbody>{hours.map((h) => <tr key={h.hour} className="border-t border-paper-border"><td className="py-1">{h.hour} h</td><td className="py-1">{h.count}</td></tr>)}</tbody>
        </table>
      </details>
    </div>
  );
}
