"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Check, Clock, Moon } from "lucide-react";
import { Card } from "@/components/admin/ui";
import { CalendarGrid, type GridDay } from "@/components/missions/CalendarGrid";
import { shootSlots, phoneLooksValid } from "@/lib/mission-brief";
import { useT } from "@/components/i18n/I18nProvider";
import { dayLabel, type MessageKey } from "@/lib/i18n/core";
import type { CalendarDay } from "@/lib/mission-dates";

// ADR 0084 §5 — le restaurateur fixe SON tournage : un jour libre du prestataire (au moins 7 jours
// à l'avance), un créneau conseillé, qui doit être là, UN contact sur place. La date le LIE : l'écran
// le dit avant le bouton. Les jours bloqués ou pris sont grisés ; c'est la base qui tranche si deux
// restaurateurs visent le même jour au même instant.

const ROLES = ["Cuisinier", "Serveur", "Barman"] as const;

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
  const tr = useT();
  const { t, locale } = tr;
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
    () => days.map((d) => ({ date: d.date, weekday: d.weekday, label: t(`rc.plan.day.${d.state}` as MessageKey), disabled: d.state !== "free", hint: d.state === "free" && d.calm, struck: d.state === "unavailable" || d.state === "booked" })),
    [days, t]
  );
  const slots = date ? shootSlots(date) : [];
  const phoneOk = phoneLooksValid(phone);
  const missing = [!date && t("rc.plan.m.date"), date && !slot && t("rc.plan.m.slot"), roles.length === 0 && t("rc.plan.m.roles"), !name.trim() && t("rc.plan.m.name"), !phoneOk && t("rc.plan.m.phone"), !agreed && t("rc.plan.m.agree")].filter(Boolean) as string[];

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
      setError(tr.err(body, "err.generic"));
      if (body.issue === "booked" || body.issue === "unavailable") {
        setDate(null);
        setSlot(null);
        router.refresh(); // le calendrier se met à jour : le jour pris est grisé
      }
    } catch {
      setError(t("err.network"));
    } finally {
      setSending(false);
    }
  }

  return (
    <Card className="space-y-6">
      <div>
        <h2 className="font-display text-[20px] font-bold tracking-[-0.02em] text-ink">{t("rc.plan.title")}</h2>
        <p className="text-ink-muted text-[13.5px] mt-1">{t("rc.plan.intro", { name: providerName ?? t("rest.yourProvider") })}</p>
      </div>

      <CalendarGrid days={grid} selected={new Set(date ? [date] : [])} onPick={(d) => { setDate(d); setSlot(null); setError(null); }} />

      {date && (
        <fieldset className="space-y-2">
          <legend className="text-[14px] font-semibold text-ink">{t("rc.plan.slotOn", { date: dayLabel(date, locale) })}</legend>
          <div role="radiogroup" aria-label={t("rc.plan.slotGroup")} className="space-y-2">
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
                    <span className="block text-[12.5px] text-ink-muted">{tr.canon("slot", s.tag)}</span>
                  </span>
                  <span className={`text-[12px] font-semibold ${s.advice === "discouraged" ? "text-warn" : s.advice === "recommended" ? "text-good" : "text-ink-muted"}`}>{t(`rc.plan.advice.${s.advice}` as MessageKey)}</span>
                </button>
              );
            })}
          </div>
          {slot && slots.find((s) => s.start === slot)?.darkWarning && (
            <p className="flex items-start gap-2 text-[13px] text-warn font-semibold">
              <Moon className="w-4 h-4 shrink-0 mt-0.5" aria-hidden /> {t("rc.plan.dark")}
            </p>
          )}
          <p className="text-[12.5px] text-ink-muted">{t("rc.plan.closed")}</p>
        </fieldset>
      )}

      <fieldset className="space-y-2">
        <legend className="text-[14px] font-semibold text-ink">{t("rc.plan.who")}</legend>
        <p className="text-[12.5px] text-ink-muted">{t("rc.plan.whoNote")}</p>
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
                {tr.canon("role", r)}
              </button>
            );
          })}
        </div>
      </fieldset>

      <fieldset className="space-y-2">
        <legend className="text-[14px] font-semibold text-ink">{t("rc.plan.contact")}</legend>
        <p className="text-[12.5px] text-ink-muted">{t("rc.plan.contactNote")}</p>
        <div className="grid gap-2 sm:grid-cols-2">
          <input aria-label={t("rc.plan.firstNameLabel")} placeholder={t("rc.plan.firstName")} value={name} onChange={(e) => setName(e.target.value)} maxLength={200} className="border border-paper-border rounded-xl px-3 py-2.5 text-[14px] text-ink bg-white focus:outline-none focus-visible:ring-2 focus-visible:ring-boost-olive" />
          <input aria-label={t("rc.plan.phoneLabel")} placeholder="04xx xx xx xx" inputMode="tel" value={phone} onChange={(e) => setPhone(e.target.value)} maxLength={30} className="border border-paper-border rounded-xl px-3 py-2.5 text-[14px] text-ink bg-white focus:outline-none focus-visible:ring-2 focus-visible:ring-boost-olive" />
        </div>
        {phone && !phoneOk && <p role="alert" className="text-danger text-[13px] font-semibold">{t("rc.plan.badPhone")}</p>}
      </fieldset>

      <div className="space-y-2">
        <label htmlFor="access" className="block text-[14px] font-semibold text-ink">
          {t("rc.plan.access")} <span className="font-normal text-ink-faint">· {t("quote.optional")}</span>
        </label>
        <textarea id="access" value={access} onChange={(e) => setAccess(e.target.value)} rows={2} maxLength={2000} placeholder={t("rc.plan.accessPlaceholder")} className="w-full border border-paper-border rounded-xl px-3 py-2.5 text-[14px] text-ink bg-white focus:outline-none focus-visible:ring-2 focus-visible:ring-boost-olive" />
      </div>

      <div className="rounded-xl bg-boost-cream border border-boost-olive/30 p-3 space-y-3">
        <p className="font-semibold text-ink text-[14px]">{t("rc.plan.binds")}</p>
        <ul className="text-[13.5px] text-ink-body space-y-1 list-disc pl-5">
          <li>{t("rc.plan.binds.1")}</li>
          <li>{t("rc.plan.binds.2")}</li>
          <li>{t("rc.plan.binds.3")}</li>
        </ul>
        <button
          type="button"
          role="checkbox"
          aria-checked={agreed}
          onClick={() => setAgreed((a) => !a)}
          className={`w-full flex items-start gap-3 text-left rounded-xl border p-3 min-h-[44px] bg-white ${agreed ? "border-boost-olive" : "border-paper-border"}`}
        >
          <span className={`mt-0.5 w-5 h-5 shrink-0 rounded border flex items-center justify-center ${agreed ? "bg-boost-olive border-boost-olive text-white" : "border-ink-faint bg-white"}`}>{agreed && <Check className="w-3.5 h-3.5" aria-hidden />}</span>
          <span className="text-[14px] font-semibold text-ink">{t("rc.plan.agree")}</span>
        </button>
      </div>

      {triedSend && missing.length > 0 && (
        <p role="alert" className="text-danger text-[13.5px] font-semibold">
          {t("rc.plan.missing", { list: missing.join(", ") })}
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
        {sending ? t("rc.plan.booking") : date && slot ? t("rc.plan.book", { date: dayLabel(date, locale), slot }) : t("rc.plan.bookThis")}
      </button>
    </Card>
  );
}
