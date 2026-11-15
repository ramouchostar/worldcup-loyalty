import { createAdminClient } from "./supabase";
import { loadRevenueTracker } from "./revenue-tracker-data";
import { listBelpeopleHourly, listProductSales, readsRevenueFromBelpeople } from "./belpeople/store";
import type { HourRow } from "./revenue-page";

// Lecture de la page « Chiffre d'affaires » (lib/revenue-page.ts) — service-role,
// UN établissement. Chaque bloc est lu à part : un bloc en échec dit « lecture
// impossible » à l'écran et laisse sa ligne `[ca]` dans les journaux, jamais
// une page cassée ni un zéro silencieux.

export type Block<T> = { ok: true; data: T } | { ok: false };

async function block<T>(label: string, read: () => Promise<T>): Promise<Block<T>> {
  try {
    return { ok: true, data: await read() };
  } catch (e) {
    console.error(`[ca] ${label} :`, (e as Error).message);
    return { ok: false };
  }
}

/** Assez loin pour la période, le mois d'avant ET les 8 semaines de la semaine type. */
export function loadCaDays(restaurantId: string, today: string, since: string) {
  const days = Math.max(130, Math.ceil((Date.parse(today) - Date.parse(since)) / 86_400_000) + 40);
  return block("chiffre d'affaires", () => loadRevenueTracker(restaurantId, today, days));
}

export async function loadCaSource(restaurantId: string): Promise<"belpeople" | "saisie"> {
  return (await readsRevenueFromBelpeople(restaurantId)) ? "belpeople" : "saisie";
}

/** Les ventes par heure de la caisse (Belpeople seulement). */
export function loadHourly(restaurantId: string, fromDay: string) {
  return block("ventes par heure", async (): Promise<HourRow[]> => {
    // Minuit UTC moins 2 h couvre l'heure d'été et d'hiver ; le filtre exact se fait au calcul.
    const fromIso = new Date(Date.parse(`${fromDay}T00:00:00Z`) - 2 * 3_600_000).toISOString();
    return listBelpeopleHourly(restaurantId, fromIso);
  });
}

/**
 * Les ventes par canal sur [from, to] : articles par canal de la caisse
 * (Belpeople), sinon euros par moyen de paiement et par plateforme de la saisie.
 */
export function loadChannels(restaurantId: string, source: "belpeople" | "saisie", from: string, to: string) {
  return block("canaux", async (): Promise<{ unit: "articles" | "euros"; parts: { name: string; value: number }[] }> => {
    if (source === "belpeople") {
      const rows = (await listProductSales(restaurantId, from)) ?? [];
      const by = new Map<string, number>();
      for (const r of rows) {
        if (r.sales_day > to) continue;
        const k = r.channel_name ?? "Autre";
        by.set(k, (by.get(k) ?? 0) + (Number(r.items_sold) || 0));
      }
      return { unit: "articles", parts: [...by.entries()].map(([name, value]) => ({ name, value })) };
    }
    const { data, error } = await createAdminClient()
      .from("daily_revenue_entries")
      .select("sales_day, carte, cash, internet, uber, deliveroo, takeaway")
      .eq("restaurant_id", restaurantId)
      .gte("sales_day", from)
      .lte("sales_day", to);
    if (error) throw new Error(`daily_revenue_entries (canaux) : ${error.message}`);
    const sum = { "Carte": 0, "Cash": 0, "Commandes internet": 0, "Uber Eats": 0, "Deliveroo": 0, "Takeaway": 0 };
    for (const r of (data ?? []) as Record<string, number | null>[]) {
      sum["Carte"] += Number(r.carte) || 0;
      sum["Cash"] += Number(r.cash) || 0;
      sum["Commandes internet"] += Number(r.internet) || 0;
      sum["Uber Eats"] += Number(r.uber) || 0;
      sum["Deliveroo"] += Number(r.deliveroo) || 0;
      sum["Takeaway"] += Number(r.takeaway) || 0;
    }
    return { unit: "euros", parts: Object.entries(sum).map(([name, value]) => ({ name, value })) };
  });
}

