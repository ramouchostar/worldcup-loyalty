import { redirect } from "next/navigation";
import Link from "next/link";
import { createServerSupabaseClient, createAdminClient } from "@/lib/supabase";
import {
  WEEKDAY_LABELS,
  MIN_ITEMS_FOR_INSIGHTS,
  findQuietDay,
  findQuietHours,
  pickPromoProduct,
  suggestCombos,
  pairKey,
  type ProductStat,
} from "@/lib/insights";

// Opportunités — l'app force de proposition (promos jours/heures creux,
// combos par co-occurrence et par marges), le restaurateur ajuste le
// message puis l'envoie en push via le broadcast existant (à tous, par
// type d'équipe ou par équipe). Surface admin : euros autorisés (ADR 0007).

const euro = (n: number) =>
  Number(n).toLocaleString("fr-BE", { style: "currency", currency: "EUR" });

const PERIOD_DAYS = 90;

type OrderRow = { id: string; order_date: string; order_time: string | null };
type ItemRow = { order_id: string; quantity: number; menu_item_id: string | null };
type MenuRow = { id: string; name: string; menu_price: number; cost_price: number; is_active: boolean };

export default async function AdminInsightsPage({ params }: { params: Promise<{ restaurantId: string }> }) {
  const { restaurantId } = await params;
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const admin = createAdminClient();
  const startDate = new Date(Date.now() - PERIOD_DAYS * 86_400_000).toISOString().slice(0, 10);

  const [{ data: ordersRaw }, { data: menuRaw }] = await Promise.all([
    admin
      .from("orders")
      .select("id, order_date, order_time")
      .eq("restaurant_id", restaurantId)
      .eq("status", "validated")
      .gte("order_date", startDate)
      .limit(5000),
    admin
      .from("menu_items")
      .select("id, name, menu_price, cost_price, is_active")
      .eq("restaurant_id", restaurantId)
      .eq("is_active", true),
  ]);

  const orders = (ordersRaw ?? []) as OrderRow[];
  const menu = (menuRaw ?? []) as MenuRow[];

  const items: ItemRow[] = [];
  const orderIds = orders.map((o) => o.id);
  for (let i = 0; i < orderIds.length; i += 150) {
    const { data: chunk } = await admin
      .from("order_items")
      .select("order_id, quantity, menu_item_id")
      .in("order_id", orderIds.slice(i, i + 150));
    items.push(...((chunk ?? []) as ItemRow[]));
  }

  // ── Statistiques produits + créneaux + co-occurrences ─────────────────────
  const orderById = new Map(orders.map((o) => [o.id, o]));
  const qtyByProduct = new Map<string, number>();
  const byHour = new Array<number>(24).fill(0);
  const byWeekday = new Array<number>(7).fill(0);
  const productsPerOrder = new Map<string, Set<string>>();
  let totalItems = 0;

  for (const it of items) {
    const order = orderById.get(it.order_id);
    if (!order) continue;
    const qty = Number(it.quantity) || 1;
    totalItems += qty;
    if (order.order_time) {
      const h = parseInt(order.order_time.slice(0, 2), 10);
      if (h >= 0 && h < 24) byHour[h] += qty;
    }
    const wd = (new Date(`${order.order_date}T00:00:00Z`).getUTCDay() + 6) % 7;
    byWeekday[wd] += qty;
    if (it.menu_item_id) {
      qtyByProduct.set(it.menu_item_id, (qtyByProduct.get(it.menu_item_id) ?? 0) + qty);
      const set = productsPerOrder.get(it.order_id) ?? new Set<string>();
      set.add(it.menu_item_id);
      productsPerOrder.set(it.order_id, set);
    }
  }

  const pairCounts = new Map<string, number>();
  productsPerOrder.forEach((set) => {
    const ids = Array.from(set);
    for (let i = 0; i < ids.length; i++) {
      for (let j = i + 1; j < ids.length; j++) {
        const key = pairKey(ids[i], ids[j]);
        pairCounts.set(key, (pairCounts.get(key) ?? 0) + 1);
      }
    }
  });

  const products: ProductStat[] = menu.map((m) => ({
    id: m.id,
    name: m.name,
    menuPrice: Number(m.menu_price),
    costPrice: Number(m.cost_price),
    qty: qtyByProduct.get(m.id) ?? 0,
  }));

  // ── Suggestions ────────────────────────────────────────────────────────────
  const quietDay = findQuietDay(byWeekday, totalItems);
  const quietHours = findQuietHours(byHour, totalItems);
  const promo = pickPromoProduct(products);
  const combos = suggestCombos(products, pairCounts, totalItems);

  const broadcast = (message: string) =>
    `/admin/${restaurantId}/broadcast?prefill=${encodeURIComponent(message)}`;

  type Card = {
    icon: string;
    title: string;
    rationale: string;
    message: string;
    detail?: string;
  };
  const cards: Card[] = [];

  if (quietDay && promo) {
    const day = WEEKDAY_LABELS[quietDay.day];
    cards.push({
      icon: "📅",
      title: `Relancer le ${day}`,
      rationale: `Le ${day} est ton jour le plus calme (${quietDay.qty} articles vendus sur ${PERIOD_DAYS} jours, contre ${quietDay.busiestQty} le ${WEEKDAY_LABELS[quietDay.busiestDay]}). Une promo ciblée y coûte peu : « ${promo.product.name} » garde ${euro((promo.product.menuPrice - promo.product.costPrice) - (promo.product.menuPrice * promo.discountPct) / 100)} de marge même à −${promo.discountPct} %.`,
      message: `😍 Spécial ${day} : −${promo.discountPct}% sur ${promo.product.name} pour les membres ! Montre ton app en caisse 🎉`,
    });
  }

  if (quietHours && promo) {
    cards.push({
      icon: "⏰",
      title: `Happy hour ${quietHours.start}h–${quietHours.end}h`,
      rationale: `Le créneau ${quietHours.start}h–${quietHours.end}h est ton plus calme (${quietHours.qty} articles, contre ${quietHours.windowQty} sur ton meilleur créneau de 2 h). Remplis-le sans casser ta marge : −${promo.discountPct} % sur « ${promo.product.name} » reste rentable.`,
      message: `⏰ Happy hour membres ${quietHours.start}h–${quietHours.end}h : −${promo.discountPct}% sur ${promo.product.name} !`,
    });
  }

  for (const c of combos) {
    const fullPrice = c.a.menuPrice + c.b.menuPrice;
    cards.push({
      icon: "🍽️",
      title: `Combo ${c.a.name} + ${c.b.name}`,
      rationale: `${c.rationale} Prix suggéré : ${euro(c.comboPrice)} au lieu de ${euro(fullPrice)} — il te reste ${euro(c.comboMargin)} de marge par combo vendu.`,
      message: `🍽️ Nouveau combo membres : ${c.a.name} + ${c.b.name} à ${euro(c.comboPrice)} au lieu de ${euro(fullPrice)} !`,
      detail: `Pense aussi à l'ajouter à ton catalogue CSV comme article « ${c.a.name} + ${c.b.name} » (prix ${euro(c.comboPrice)}, coût ${euro(c.a.costPrice + c.b.costPrice)}) pour suivre ses ventes.`,
    });
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Opportunités</h1>
        <p className="text-gray-500 text-sm mt-1">
          Des propositions calculées sur tes {PERIOD_DAYS} derniers jours de ventes
          scannées — tu ajustes le message, tu choisis qui le reçoit, tu envoies.
        </p>
      </div>

      {totalItems < MIN_ITEMS_FOR_INSIGHTS ? (
        <div className="bg-white rounded-xl border border-dashed border-gray-200 p-8 text-center">
          <p className="text-3xl mb-2">🌱</p>
          <p className="font-bold text-gray-900">Pas encore assez de données</p>
          <p className="text-sm text-gray-500 mt-1 max-w-md mx-auto">
            Les suggestions se débloquent à partir de {MIN_ITEMS_FOR_INSIGHTS} articles
            vendus et scannés ({totalItems} pour l&apos;instant). Encourage tes clients à
            scanner leurs tickets — chaque scan enrichit tes statistiques.
          </p>
        </div>
      ) : cards.length === 0 ? (
        <div className="bg-white rounded-xl border border-dashed border-gray-200 p-8 text-center text-sm text-gray-500">
          Rien à signaler : tes ventes sont régulières sur la période et aucune
          paire de plats ne se détache encore. Reviens quand il y aura plus de
          scans.
        </div>
      ) : (
        <div className="space-y-4">
          {cards.map((card, i) => (
            <div key={i} className="bg-white rounded-2xl border border-gray-100 p-5">
              <div className="flex items-center gap-2 mb-2">
                <span className="text-2xl">{card.icon}</span>
                <h2 className="font-bold text-gray-900">{card.title}</h2>
              </div>
              <p className="text-sm text-gray-600 leading-relaxed mb-3">{card.rationale}</p>

              <div className="bg-gray-50 border border-gray-200 rounded-xl p-3 mb-1.5">
                <p className="text-xs text-gray-400 font-semibold uppercase tracking-wide mb-1">
                  Notification proposée
                </p>
                <p className="text-sm text-gray-800">{card.message}</p>
              </div>
              {card.detail && <p className="text-xs text-gray-400 mb-2">💡 {card.detail}</p>}

              <div className="flex justify-end mt-2">
                <Link
                  href={broadcast(card.message)}
                  className="bg-brand-red text-white text-sm font-semibold px-4 py-2 rounded-lg hover:bg-red-700 transition-colors"
                >
                  Ajuster et envoyer →
                </Link>
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="bg-gray-50 rounded-xl p-4 text-xs text-gray-500 space-y-1">
        <p>
          💡 Chaque proposition est calculée à partir de tes ventes scannées et de
          tes coûts de revient — les remises suggérées préservent toujours au moins
          la moitié de ta marge.
        </p>
        <p>
          💡 Le bouton « Ajuster et envoyer » ouvre le broadcast pré-rempli : tu
          peux modifier le texte et cibler tous tes membres, certains types
          d&apos;équipes ou des équipes précises.
        </p>
      </div>
    </div>
  );
}
