"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Check, Clock, Moon } from "lucide-react";
import { Card } from "@/components/admin/ui";
import { CalendarGrid, type GridDay } from "@/components/missions/CalendarGrid";
import { shootSlots, phoneLooksValid } from "@/lib/mission-brief";
import { dateLabelFr } from "@/lib/mission-team-message";
import type { CalendarDay } from "@/lib/mission-dates";

// ADR 0084 §5 — le restaurateur fixe SON tournage : un jour libre du prestataire (au moins 7 jours
// à l'avance), un créneau conseillé, qui doit être là, UN contact sur place. La date le LIE : l'écran
// le dit avant le bouton. Les jours bloqués ou pris sont grisés ; c'est la base qui tranche si deux
// restaurateurs visent le même jour au même instant.

const ROLES = ["Cuisinier", "Serveur", "Barman"] as const;
const DAY_LABEL: Record<CalendarDay["state"], string> = { free: "libre", too_soon: "trop tôt pour prévenir ton équipe", unavailable: "le prestataire n'est pas disponible", booked: "déjà réservé", past: "passé" };

const ADVICE_TEXT = { recommended: "Conseillé", ok: "Possible", discouraged: "Déconseillé" } as const;

export function ShootPlanner({
  restaurantId,
  missionId,
  providerName,
  days,
}: {
  restaurantId: string;
  missionId: string;
  providerName: string | null;
  days: CalendarDay[];
}) {
  const router = useRouter();
  const [date, setDate] = useState<string | null>(null);
  const [slot, setSlot] = useState<string | null>(null);
  const [roles, setRoles] = useState<string[]>([]);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [access, setAccess] = useState("");
  const [agreed, setAgreed] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [triedSend, setTriedSend] = useState(false);

  const grid: GridDay[] = useMemo(
    () => days.map((d) => ({ date: d.date, weekday: d.weekday, label: DAY_LABEL[d.state], disabled: d.state !== "free", hint: d.state === "free" && d.calm, struck: d.state === "unavailable" || d.state === "booked" })),
    [days]
  );
  const slots = date ? shootSlots(date) : [];
  const phoneOk = phoneLooksValid(phone);
  const missing = [!date && "une date", date && !slot && "un créneau", roles.length === 0 && "qui doit être là", !name.trim() && "le nom de ton contact", !phoneOk && "son téléphone", !agreed && "ton accord"].filter(Boolean) as string[];

  async function send() {
    setTriedSend(true);
    if (missing.length > 0) return;
    setSending(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/missions/${missionId}/date`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ restaurantId, shoot_date: date, shoot_slot: slot, roles, contact: { name, phone }, access }),
      });
      const body = await res.json().catch(() => ({}));
      if (res.ok) {
        router.refresh();
        return;
      }
      setError(body.error ?? "Impossible pour le moment. Réessaie.");
      if (body.issue === "booked" || body.issue === "unavailable") {
        setDate(null);
        setSlot(null);
        router.refresh(); // le calendrier se met à jour : le jour pris est grisé
      }
    } catch {
      setError("Pas de connexion. Réessaie dans un instant.");
    } finally {
      setSending(false);
    }
  }

  return (
    <Card className="space-y-6">
      <div>
        <h2 className="font-display text-[20px] font-bold tracking-[-0.02em] text-ink">Quand filme-t-on ?</h2>
        <p className="text-ink-muted text-[13.5px] mt-1">
          Tu vois seulement les jours libres de {providerName ?? "ton vidéaste"}. Choisis un jour calme (en vert clair) : ton équipe est dispo, la salle est libre, pas de clients à flouter.
        </p>
      </div>

      <CalendarGrid days={grid} selected={new Set(date ? [date] : [])} onPick={(d) => { setDate(d); setSlot(null); setError(null); }} />

      {date && (
        <fieldset className="space-y-2">
          <legend className="text-[14px] font-semibold text-ink">Créneau le {dateLabelFr(date)}</legend>
          <div role="radiogroup" aria-label="Créneau" className="space-y-2">
            {slots.map((s) => {
              const on = slot === s.start;
              return (
                <button
                  key={s.start}
                  type="button"
                  role="radio"
                  aria-checked={on}
                  onClick={() => setSlot(s.start)}
                  className={`w-full flex items-center gap-3 text-left rounded-xl border p-3 min-h-[44px] ${on ? "border-boost-olive bg-boost-cream" : "border-paper-border bg-white"}`}
                >
                  <Clock className="w-4 h-4 shrink-0 text-ink-muted" aria-hidden />
                  <span className="flex-1">
                    <span className="block text-[14px] font-semibold text-ink">
                      {s.start} – {s.end}
                    </span>
                    <span className="block text-[12.5px] text-ink-muted">{s.tag}</span>
                  </span>
                  <span className={`text-[12px] font-semibold ${s.advice === "discouraged" ? "text-warn" : s.advice === "recommended" ? "text-good" : "text-ink-muted"}`}>{ADVICE_TEXT[s.advice]}</span>
                </button>
              );
            })}
          </div>
          {slot && slots.find((s) => s.start === slot)?.darkWarning && (
            <p className="flex items-start gap-2 text-[13px] text-warn font-semibold">
              <Moon className="w-4 h-4 shrink-0 mt-0.5" aria-hidden /> À cette période de l&apos;année, il fait nuit en fin de journée : une scène de jour ne se tourne pas à cette heure.
            </p>
          )}
          <p className="text-[12.5px] text-ink-muted">Ton restaurant est fermé à ce moment ? Si ton équipe vient hors de son planning, ce sont des heures en plus à prévoir.</p>
        </fieldset>
      )}

      <fieldset className="space-y-2">
        <legend className="text-[14px] font-semibold text-ink">Qui doit être là ?</legend>
        <p className="text-[12.5px] text-ink-muted">Ceux dont on a besoin à l&apos;image. Le plat doit être fait par quelqu&apos;un qui sait le faire.</p>
        <div className="flex flex-wrap gap-2">
          {ROLES.map((r) => {
            const on = roles.includes(r);
            return (
              <button
                key={r}
                type="button"
                aria-pressed={on}
                onClick={() => setRoles((l) => (on ? l.filter((x) => x !== r) : [...l, r]))}
                className={`min-h-[44px] px-4 rounded-xl border text-[14px] font-medium ${on ? "bg-boost-olive border-boost-olive text-white" : "bg-white border-paper-border text-ink"}`}
              >
                {r}
              </button>
            );
          })}
        </div>
      </fieldset>

      <fieldset className="space-y-2">
        <legend className="text-[14px] font-semibold text-ink">Ton contact sur place</legend>
        <p className="text-[12.5px] text-ink-muted">Une seule personne, joignable le jour J. Le prestataire ne court pas après ton personnel.</p>
        <div className="grid gap-2 sm:grid-cols-2">
          <input aria-label="Prénom du contact" placeholder="Prénom" value={name} onChange={(e) => setName(e.target.value)} maxLength={200} className="border border-paper-border rounded-xl px-3 py-2.5 text-[14px] text-ink bg-white focus:outline-none focus-visible:ring-2 focus-visible:ring-boost-olive" />
          <input aria-label="Téléphone du contact" placeholder="04xx xx xx xx" inputMode="tel" value={phone} onChange={(e) => setPhone(e.target.value)} maxLength={30} className="border border-paper-border rounded-xl px-3 py-2.5 text-[14px] text-ink bg-white focus:outline-none focus-visible:ring-2 focus-visible:ring-boost-olive" />
        </div>
        {phone && !phoneOk && <p role="alert" className="text-danger text-[13px] font-semibold">Numéro de téléphone incomplet</p>}
      </fieldset>

      <div className="space-y-2">
        <label htmlFor="access" className="block text-[14px] font-semibold text-ink">
          Accès et déchargement <span className="font-normal text-ink-faint">· facultatif</span>
        </label>
        <textarea id="access" value={access} onChange={(e) => setAccess(e.target.value)} rows={2} maxLength={2000} placeholder="Où se garer, étage, ascenseur…" className="w-full border border-paper-border rounded-xl px-3 py-2.5 text-[14px] text-ink bg-white focus:outline-none focus-visible:ring-2 focus-visible:ring-boost-olive" />
      </div>

      <div className="rounded-xl bg-boost-cream border border-boost-olive/30 p-3 space-y-3">
        <p className="font-semibold text-ink text-[14px]">Cette date t&apos;engage</p>
        <ul className="text-[13.5px] text-ink-body space-y-1 list-disc pl-5">
          <li>Plus de 7 jours avant : tu peux annuler sans frais.</li>
          <li>Entre 7 jours et 48 h : la moitié est due.</li>
          <li>Moins de 48 h, ou si personne n&apos;est là : tout est dû.</li>
        </ul>
        <button
          type="button"
          role="checkbox"
          aria-checked={agreed}
          onClick={() => setAgreed((a) => !a)}
          className={`w-full flex items-start gap-3 text-left rounded-xl border p-3 min-h-[44px] bg-white ${agreed ? "border-boost-olive" : "border-paper-border"}`}
        >
          <span className={`mt-0.5 w-5 h-5 shrink-0 rounded border flex items-center justify-center ${agreed ? "bg-boost-olive border-boost-olive text-white" : "border-ink-faint bg-white"}`}>{agreed && <Check className="w-3.5 h-3.5" aria-hidden />}</span>
          <span className="text-[14px] font-semibold text-ink">Je m&apos;engage sur cette date, et mon équipe sera prévenue à temps</span>
        </button>
      </div>

      {triedSend && missing.length > 0 && (
        <p role="alert" className="text-danger text-[13.5px] font-semibold">
          Il manque : {missing.join(", ")}.
        </p>
      )}
      {error && (
        <p role="alert" className="text-danger text-[13.5px] font-semibold">
          {error}
        </p>
      )}
      <button
        type="button"
        disabled={sending}
        onClick={send}
        className="w-full inline-flex items-center justify-center min-h-[44px] px-5 rounded-xl bg-boost-olive text-white text-[14px] font-semibold shadow-[inset_0_-3px_0_#4F5C2D] hover:brightness-95 disabled:opacity-60"
      >
        {sending ? "Réservation…" : date && slot ? `Réserver le ${dateLabelFr(date)} à ${slot}` : "Réserver cette date"}
      </button>
    </Card>
  );
}
