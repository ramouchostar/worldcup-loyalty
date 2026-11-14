// ADR 0103 (suite) — ventes par heure de Belpeople → profil heures pleines /
// creuses pour le personnel. Pur (aucun réseau ni base). Testé dans hourly.test.ts.

export type HourlyRow = {
  hour_start: string; // ISO avec décalage
  gross_inc_vat: number | null;
  orders_count: number | null;
};

export type DayType = "semaine" | "weekend";
export type HourLevel = "plein" | "normal" | "creux";

export type HourSlot = {
  hour: number; // 0–23, heure de Bruxelles
  avgOrders: number;
  avgCa: number;
  days: number; // nombre de dates distinctes observées pour cette heure
  level: HourLevel;
};

export type HourlyProfile = Record<DayType, HourSlot[]>;

function brussels(iso: string): { day: string; hour: number; weekday: number } | null {
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return null;
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Brussels",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    hourCycle: "h23",
    weekday: "short",
  }).formatToParts(new Date(t));
  const get = (k: string) => parts.find((p) => p.type === k)?.value ?? "";
  const day = `${get("year")}-${get("month")}-${get("day")}`;
  const wk = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(get("weekday"));
  return { day, hour: Number(get("hour")), weekday: wk };
}

/** Un samedi/dimanche compte en « weekend ». */
function dayType(weekday: number): DayType {
  return weekday === 0 || weekday === 6 ? "weekend" : "semaine";
}

/**
 * Moyenne des commandes et du CA par heure de la journée, séparément en semaine
 * et le week-end. Une heure est « pleine » si elle atteint ≥ 66 % du pic de son
 * type de jour, « creuse » si ≤ 33 %. Les heures jamais observées sont omises.
 */
export function hourlyProfile(rows: HourlyRow[]): HourlyProfile {
  type Acc = { orders: number; ca: number; dates: Set<string> };
  const buckets = new Map<string, Acc>(); // `${type}|${hour}`
  for (const r of rows) {
    const b = brussels(r.hour_start);
    if (!b) continue;
    const key = `${dayType(b.weekday)}|${b.hour}`;
    const a = buckets.get(key) ?? { orders: 0, ca: 0, dates: new Set<string>() };
    a.orders += r.orders_count ?? 0;
    a.ca += r.gross_inc_vat ?? 0;
    a.dates.add(b.day);
    buckets.set(key, a);
  }

  const build = (type: DayType): HourSlot[] => {
    const slots: HourSlot[] = [];
    for (let h = 0; h < 24; h++) {
      const a = buckets.get(`${type}|${h}`);
      if (!a || a.dates.size === 0) continue;
      const n = a.dates.size;
      slots.push({ hour: h, avgOrders: Math.round((a.orders / n) * 10) / 10, avgCa: Math.round((a.ca / n) * 100) / 100, days: n, level: "normal" });
    }
    const peak = slots.reduce((m, s) => Math.max(m, s.avgOrders), 0);
    if (peak > 0) {
      for (const s of slots) {
        if (s.avgOrders >= 0.66 * peak) s.level = "plein";
        else if (s.avgOrders <= 0.33 * peak) s.level = "creux";
      }
    }
    return slots.sort((a, b) => a.hour - b.hour);
  };

  return { semaine: build("semaine"), weekend: build("weekend") };
}
