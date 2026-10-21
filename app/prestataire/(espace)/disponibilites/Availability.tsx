"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Card } from "@/components/admin/ui";
import { CalendarGrid, type GridDay } from "@/components/missions/CalendarGrid";
import type { ProviderDayState } from "@/lib/mission-dates";
import { useT } from "@/components/i18n/I18nProvider";
import type { MessageKey } from "@/lib/i18n/core";

// ADR 0084 §5 — « Quand tu peux filmer » : le prestataire touche les jours où il N'est PAS disponible.
// Les restaurateurs ne voient que ses jours libres ; une date réservée se bloque toute seule et ne se
// débloque pas ici (pour ne plus venir, il annule la mission : le restaurateur compte dessus).

export function Availability({ days }: { days: { date: string; weekday: number; state: ProviderDayState }[] }) {
  const router = useRouter();
  const { t, tp } = useT();
  // État local : les jours bloqués, au départ ceux de la base. Les modifications partent en un envoi.
  const initial = useMemo(() => new Set(days.filter((d) => d.state === "unavailable").map((d) => d.date)), [days]);
  const [blocked, setBlocked] = useState<Set<string>>(new Set(initial));
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  const grid: GridDay[] = days.map((d) => ({
    date: d.date,
    weekday: d.weekday,
    label: d.state === "free" || d.state === "unavailable" ? (blocked.has(d.date) ? t("avail.state.unavailable") : t("avail.state.free")) : t(`avail.state.${d.state}` as MessageKey),
    disabled: d.state === "past" || d.state === "booked",
    struck: blocked.has(d.date) || d.state === "booked",
  }));

  const toBlock = [...blocked].filter((d) => !initial.has(d)).sort();
  const toFree = [...initial].filter((d) => !blocked.has(d)).sort();
  const dirty = toBlock.length + toFree.length > 0;

  function toggle(date: string) {
    setMessage(null);
    setBlocked((s) => {
      const next = new Set(s);
      if (next.has(date)) next.delete(date);
      else next.add(date);
      return next;
    });
  }

  async function send(action: "block" | "free", list: string[]): Promise<{ ok: boolean; refused: string[] }> {
    if (list.length === 0) return { ok: true, refused: [] };
    const res = await fetch("/api/prestataire/disponibilites", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action, days: list }) });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(body.error ?? t("lang.error"));
    return { ok: true, refused: Array.isArray(body.refused) ? body.refused : [] };
  }

  async function save() {
    setSaving(true);
    setMessage(null);
    try {
      const a = await send("block", toBlock);
      await send("free", toFree);
      setMessage({
        ok: a.refused.length === 0,
        text: a.refused.length ? tp("avail.savedExcept", a.refused.length) : t("avail.saved"),
      });
      router.refresh();
    } catch (e) {
      setMessage({ ok: false, text: (e as Error).message });
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-4">
      <Card className="space-y-4">
        <CalendarGrid days={grid} selected={blocked} onPick={toggle} />
        <ul className="flex flex-wrap gap-x-4 gap-y-1 text-[12.5px] text-ink-muted" aria-label={t("avail.legend")}>
          <li>
            <span className="inline-block w-3 h-3 rounded-sm border border-paper-border bg-white align-middle mr-1" /> {t("avail.legend.free")}
          </li>
          <li>
            <span className="inline-block w-3 h-3 rounded-sm bg-boost-olive align-middle mr-1" /> {t("avail.legend.blocked")}
          </li>
          <li>
            <span className="line-through">12</span> {t("avail.legend.booked")}
          </li>
        </ul>
      </Card>
      {message && (
        <p role="status" className={`text-[13.5px] font-semibold ${message.ok ? "text-good" : "text-danger"}`}>
          {message.text}
        </p>
      )}
      <button
        type="button"
        disabled={!dirty || saving}
        onClick={save}
        className="w-full inline-flex items-center justify-center min-h-[44px] px-5 rounded-xl bg-boost-olive text-white text-[14px] font-semibold shadow-[inset_0_-3px_0_#4F5C2D] hover:brightness-95 disabled:opacity-50"
      >
        {saving ? t("avail.saving") : dirty ? t("avail.save", { blocked: tp("avail.blocked", toBlock.length), freed: tp("avail.freed", toFree.length) }) : t("avail.nothing")}
      </button>
    </div>
  );
}
