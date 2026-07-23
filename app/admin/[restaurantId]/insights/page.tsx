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
  suggestDegressiveBundle,
  suggestBuyNGetOneFree,
  findRushDay,
  suggestRushUpsell,
  findMonthEndDip,
  suggestTightBudgetOffer,
  nextDateInMonthDays,
  addDaysISO,
  PAYDAY_DAYS,
  TIGHT_DAYS,
  upcomingCalendarContexts,
  matchSeasonalProducts,
  suggestGroupPack,
  findTeamTypeSlots,
  menuEngineering,
  suggestSizeDecoys,
  nextPromoDates,
  pairKey,
  type ProductStat,
} from "@/lib/insights";
import { getAverageBasket } from "@/lib/avg-basket";
import { todayInBrussels } from "@/lib/broadcast";

// Opportunités — l'app force de proposition (promos jours/heures creux,
// combos par co-occurrence et par marges), le restaurateur ajuste le
// message puis l'envoie en push via le broadcast existant (à tous, par
// type d'équipe ou par équipe). Surface admin : euros autorisés (ADR 0007).

const euro = (n: number) =>
  Number(n).toLocaleString("fr-BE", { style: "currency", currency: "EUR" });

const PERIOD_DAYS = 90;

type OrderRow = { id: string; user_id: string; order_date: string; order_time: string | null };
type ItemRow = { order_id: string; quantity: number; menu_item_id: string | null };
type MenuRow = { id: string; name: string; menu_price: number; cost_price: number; is_active: boolean };

export default async function AdminInsightsPage({ params }: { params: Promise<{ restaurantId: string }> }) {
  const { restaurantId } = await params;
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const admin = createAdminClient();
  const startDate = new Date(Date.now() - PERIOD_DAYS * 86_400_000).toISOString().slice(0, 10);

  const [{ data: ordersRaw }, { data: menuRaw }, avgBasket] = await Promise.all([
    admin
      .from("orders")
      .select("id, user_id, order_date, order_time")
      .eq("restaurant_id", restaurantId)
      .eq("status", "validated")
      .gte("order_date", startDate)
      .limit(5000),
    admin
      .from("menu_items")
      .select("id, name, menu_price, cost_price, is_active")
      .eq("restaurant_id", restaurantId)
      .eq("is_active", true),
    getAverageBasket(restaurantId),
  ]);

  const orders = (ordersRaw ?? []) as OrderRow[];
  const menu = (menuRaw ?? []) as MenuRow[];

  // Type d'équipe de chaque membre (ADR 0014) — pour typer les créneaux.
  const [{ data: membershipsRaw }, { data: teamsRaw }] = await Promise.all([
    admin.from("memberships").select("user_id, team_id").eq("restaurant_id", restaurantId).not("team_id", "is", null),
    admin.from("teams").select("id, type").eq("restaurant_id", restaurantId),
  ]);
  const teamType = new Map(((teamsRaw ?? []) as { id: string; type: string }[]).map((t) => [t.id, t.type]));
  const userType = new Map(
    ((membershipsRaw ?? []) as { user_id: string; team_id: string }[]).map((m) => [m.user_id, teamType.get(m.team_id) ?? "autre"])
  );

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
  const byMonthDay = new Array<number>(32).fill(0);
  const byTypeHour = new Map<string, number[]>();
  const productsPerOrder = new Map<string, Set<string>>();
  let totalItems = 0;

  for (const it of items) {
    const order = orderById.get(it.order_id);
    if (!order) continue;
    const qty = Number(it.quantity) || 1;
    totalItems += qty;
    if (order.order_time) {
      const h = parseInt(order.order_time.slice(0, 2), 10);
      if (h >= 0 && h < 24) {
        byHour[h] += qty;
        const type = userType.get(order.user_id);
        if (type) {
          const arr = byTypeHour.get(type) ?? new Array<number>(24).fill(0);
          arr[h] += qty;
          byTypeHour.set(type, arr);
        }
      }
    }
    const wd = (new Date(`${order.order_date}T00:00:00Z`).getUTCDay() + 6) % 7;
    byWeekday[wd] += qty;
    const md = parseInt(order.order_date.slice(8, 10), 10);
    if (md >= 1 && md <= 31) byMonthDay[md] += qty;
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
  const bundle = suggestDegressiveBundle(products, totalItems);
  const freebie = suggestBuyNGetOneFree(products, totalItems);
  const rushDay = findRushDay(byWeekday, totalItems);
  const rushUpsell = suggestRushUpsell(products, avgBasket, totalItems);
  const monthDip = findMonthEndDip(byMonthDay, totalItems);
  const tightOffer = suggestTightBudgetOffer(products, totalItems);
  const calendarContexts = upcomingCalendarContexts(todayInBrussels());
  const typeSlots = findTeamTypeSlots(byTypeHour);
  const menuAudit = menuEngineering(products, totalItems);
  const sizeDecoys = suggestSizeDecoys(products, totalItems);

  const broadcast = (message: string, sendOn?: string, promoOn?: string, targetType?: string) => {
    const q = new URLSearchParams({ prefill: message });
    if (sendOn) q.set("sendOn", sendOn);
    if (promoOn) q.set("promoOn", promoOn);
    if (targetType) q.set("targetType", targetType);
    return `/admin/${restaurantId}/broadcast?${q.toString()}`;
  };

  // ADR 0023 — les promos liées à un jour visent leur prochaine occurrence ;
  // l'annonce part la veille, jamais plus tôt (une notification reçue le
  // samedi pour un mardi ferait reporter les commandes du week-end).
  const todayISO = todayInBrussels();
  const fmtDate = (iso: string) =>
    new Date(`${iso}T00:00:00Z`).toLocaleDateString("fr-BE", {
      weekday: "long",
      day: "numeric",
      month: "long",
      timeZone: "UTC",
    });

  type Card = {
    icon: string;
    title: string;
    rationale: string;
    message?: string; // absent = conseil interne (repricing…), pas de broadcast
    detail?: string;
    planning?: string; // promo datée : occurrence visée + date d'annonce
    sendOn?: string;
    promoOn?: string;
    targetType?: string; // broadcast pré-ciblé sur un type d'équipe
  };
  const cards: Card[] = [];

  if (quietDay && promo) {
    const day = WEEKDAY_LABELS[quietDay.day];
    const dates = nextPromoDates(todayISO, quietDay.day);
    cards.push({
      icon: "📅",
      title: `Relancer le ${day}`,
      rationale: `Le ${day} est ton jour le plus calme (${quietDay.qty} articles vendus sur ${PERIOD_DAYS} jours, contre ${quietDay.busiestQty} le ${WEEKDAY_LABELS[quietDay.busiestDay]}). Une promo ciblée y coûte peu : « ${promo.product.name} » garde ${euro((promo.product.menuPrice - promo.product.costPrice) - (promo.product.menuPrice * promo.discountPct) / 100)} de marge même à −${promo.discountPct} %.`,
      message: `😍 Spécial ${day} : −${promo.discountPct}% sur ${promo.product.name} pour les membres ! Montre ton app en caisse 🎉`,
      planning: `Prochaine occurrence : ${fmtDate(dates.promoOn)}. L'annonce partira la veille (${fmtDate(dates.sendOn)}) — assez tôt pour que tes membres prévoient leur visite, assez tard pour ne pas déplacer les commandes des autres jours. Prévois le stock de « ${promo.product.name} ».`,
      sendOn: dates.sendOn,
      promoOn: dates.promoOn,
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

  if (rushUpsell && rushDay) {
    const day = WEEKDAY_LABELS[rushDay.day];
    const dates = nextPromoDates(todayISO, rushDay.day);
    const u = rushUpsell;
    cards.push({
      icon: "📈",
      title: `Arrondir le ticket du ${day}`,
      rationale: `Le ${day} est ton jour de rush (${rushDay.qty} articles vendus contre ${Math.round(rushDay.othersAvg)} en moyenne les autres jours) — inutile d'y chercher plus de commandes, fais grossir le ticket. Dès qu'une commande atteint ${euro(u.threshold)} (ton panier moyen ~${euro(avgBasket)}), propose « 1 ${u.product.name} acheté = 1 offert » : la portion offerte est perçue à ${euro(u.product.menuPrice)} mais coûte ${euro(u.product.costPrice)}. Chaque ticket qui joue le jeu passe de ${euro(u.threshold)} à ${euro(u.newBasket)}, soit +${euro(u.marginGain)} de marge après le coût des deux portions.`,
      message: `📈 ${day.charAt(0).toUpperCase() + day.slice(1)} membres : dès ${euro(u.threshold)} de commande, 1 ${u.product.name} acheté = 1 offert — de quoi régaler toute la table !`,
      detail: `Briefe le comptoir : l'offre se propose à voix haute quand le ticket franchit ${euro(u.threshold)}. Elle marche avec n'importe quel accompagnement à partager au coût très bas (frites larges, onion rings, churros…) — le moteur a choisi « ${u.product.name} » car c'est celui qui fait grossir la marge le plus fort.`,
      planning: `Prochaine occurrence : ${fmtDate(dates.promoOn)}. L'annonce partira la veille (${fmtDate(dates.sendOn)}). Prévois un stock large de « ${u.product.name} » — les portions offertes partent vite un jour de rush.`,
      sendOn: dates.sendOn,
      promoOn: dates.promoOn,
    });
  }

  if (freebie && quietDay) {
    const day = WEEKDAY_LABELS[quietDay.day];
    const dates = nextPromoDates(todayISO, quietDay.day);
    const f = freebie;
    const offer =
      f.paidUnits === 1
        ? `1 ${f.product.name} acheté = 1 offert`
        : `${f.paidUnits} ${f.product.name} achetés = 1 offert`;
    cards.push({
      icon: "🎁",
      title: `${offer} — le ${day}`,
      rationale: `Le ${day} est ton jour le plus calme (${quietDay.qty} articles vendus contre ${quietDay.busiestQty} le ${WEEKDAY_LABELS[quietDay.busiestDay]}). L'unité offerte de « ${f.product.name} » est perçue à ${euro(f.perceivedValue)} mais ne te coûte que ${euro(f.realCost)} : chaque formule encaisse ${euro(f.revenue)} pour ${euro(f.totalCost)} de coût matière — il te reste ${euro(f.margin)} de marge (${Math.round(f.marginRatio * 100)} %). Et un client qui multiplie la formule pour cumuler les gratuits multiplie d'autant ce qu'il te laisse.`,
      message: `🎁 Spécial ${day} membres : ${offer} !`,
      detail: `Réserve l'offre au ${day} (et aux membres) : sur un jour plein elle remplacerait des ventes plein tarif au lieu d'en créer.`,
      planning: `Prochaine occurrence : ${fmtDate(dates.promoOn)}. L'annonce partira la veille (${fmtDate(dates.sendOn)}) — jamais plus tôt, pour ne pas déplacer les commandes des jours pleins. Prévois le stock de « ${f.product.name} ».`,
      sendOn: dates.sendOn,
      promoOn: dates.promoOn,
    });
  }

  for (const ctx of calendarContexts) {
    const ongoing = ctx.start <= todayISO;
    // Contexte à venir : l'annonce part la veille du début (ADR 0023) ;
    // contexte en cours : communication immédiate.
    const sendOn = ongoing ? undefined : addDaysISO(ctx.start, -1);
    const promoOn = ongoing ? undefined : ctx.start;
    const period = ongoing
      ? `en cours jusqu'au ${fmtDate(ctx.end)}`
      : `du ${fmtDate(ctx.start)} au ${fmtDate(ctx.end)}`;

    if (ctx.angle === "groupe") {
      const pack = suggestGroupPack(products, totalItems);
      if (!pack) continue;
      cards.push({
        icon: "⚽",
        title: `${ctx.label} : vise les groupes`,
        rationale: `Pendant ${ctx.label} (${period}), les gens se réunissent pour regarder les matchs ensemble — c'est une clientèle de GROUPES, pas d'individuels. Propose un pack : 4× « ${pack.main.name} » (ton plat le mieux vendu, ${pack.main.qty}×) + 2× « ${pack.side.name} » à partager, à ${euro(pack.packPrice)} au lieu de ${euro(pack.fullPrice)}. L'économie affichée est de ${euro(pack.saving)}, il te reste ${euro(pack.margin)} de marge par pack.`,
        message: `⚽ ${ctx.label} : Pack match 4 personnes — 4× ${pack.main.name} + 2× ${pack.side.name} à ${euro(pack.packPrice)} au lieu de ${euro(pack.fullPrice)} ! On regarde ensemble, on mange ensemble 🍽️`,
        detail: `Un pack de groupe fait un ticket ~4× ton panier individuel — pense au stock et au conditionnement à emporter pour les soirées de match.`,
        planning: ongoing
          ? `${ctx.label} est en cours (jusqu'au ${fmtDate(ctx.end)}) — l'annonce peut partir dès maintenant et l'offre courir toute la compétition.`
          : `${ctx.label} démarre le ${fmtDate(ctx.start)}. L'annonce partira la veille (${fmtDate(sendOn!)}).`,
        sendOn,
        promoOn,
      });
      continue;
    }

    const seasonal = matchSeasonalProducts(products, ctx.angle);
    const isEte = ctx.angle === "ete";
    const names = seasonal.map((s) => s.name);
    cards.push({
      icon: isEte ? "☀️" : "🍲",
      title: isEte
        ? `${ctx.label} : mets tes produits d'été en avant`
        : `${ctx.label} : plats chauds et réconfortants`,
      rationale: isEte
        ? `Juillet-août vendent généralement moins — plutôt qu'une remise, attire avec ce qui colle à la saison (${period}).${names.length > 0 ? ` Dans ton catalogue : ${names.map((n) => `« ${n} »`).join(", ")} — communique dessus, sans toucher aux prix.` : ` Ton catalogue ne contient pas d'article estival identifiable (glaces, boissons fraîches, salades…) — c'est peut-être le moment d'en ajouter via ton CSV.`}`
        : `Pendant les vacances d'hiver (${period}), les clients cherchent du réconfort — rappelle-leur tes plats chauds.${names.length > 0 ? ` Dans ton catalogue : ${names.map((n) => `« ${n} »`).join(", ")} — communique dessus, sans toucher aux prix.` : ` Ton catalogue ne contient pas d'article « réconfort » identifiable (soupes, gratins, plats mijotés…) — c'est peut-être le moment d'en ajouter via ton CSV.`}`,
      message:
        names.length > 0
          ? `${isEte ? "☀️" : "🍲"} ${isEte ? "L'été est là" : "Il fait froid dehors"} : ${names.join(", ")} ${names.length > 1 ? "vous attendent" : "vous attend"} ! ${isEte ? "Fraîcheur garantie 🧊" : "De quoi se réchauffer 🔥"}`
          : `${isEte ? "☀️ Nos nouveautés d'été vous attendent !" : "🍲 Nos plats chauds vous attendent pour affronter l'hiver !"}`,
      detail: `Communication de saison, pas une promo : aucun prix ne bouge, zéro impact sur ta marge — le bon produit au bon moment suffit.`,
      planning: ongoing
        ? `${ctx.label} : ${period} — l'annonce peut partir dès maintenant.`
        : `${ctx.label} : ${period}. L'annonce partira la veille du début (${fmtDate(sendOn!)}).`,
      sendOn,
      promoOn,
    });
  }

  // Offres par type d'équipe × créneau (ADR 0022) — l'offre s'adapte au
  // budget du public : petit prix pour les écoles, promo classique ailleurs.
  const TYPE_META: Record<string, { emoji: string; label: string }> = {
    ecole: { emoji: "🎓", label: "écoles" },
    entreprise: { emoji: "🏢", label: "entreprises" },
    rue_quartier: { emoji: "🏘️", label: "rues & quartiers" },
    taxis: { emoji: "🚕", label: "taxis" },
  };
  for (const slot of typeSlots) {
    const meta = TYPE_META[slot.type];
    if (!meta) continue;
    const isNight = slot.peak.start >= 21 || slot.peak.start < 6;
    const window = `${slot.peak.start}h–${slot.peak.end}h`;
    const slotLabel = isNight ? `service de nuit (${window})` : `créneau ${window}`;

    let offerText: string | null = null;
    let offerMsg: string | null = null;
    if (slot.type === "ecole" && tightOffer) {
      const t = tightOffer;
      offerText = `Pour des étudiants, le prix d'entrée compte : « ${t.product.name} » à ${euro(t.newPrice)} au lieu de ${euro(t.product.menuPrice)} (−${t.discountPct} %, il te reste ${euro(t.newPrice - t.product.costPrice)} de marge).`;
      offerMsg = `${meta.emoji} Offre étudiante ${window} : ${t.product.name} à ${euro(t.newPrice)} au lieu de ${euro(t.product.menuPrice)} — montre ton app !`;
    } else if (promo) {
      offerText = `« ${promo.product.name} » à −${promo.discountPct} % reste rentable (${euro(promo.product.menuPrice - promo.product.costPrice - (promo.product.menuPrice * promo.discountPct) / 100)} de marge).`;
      offerMsg = `${meta.emoji} Spécial ${meta.label} ${window} : −${promo.discountPct}% sur ${promo.product.name} — montre ton app !`;
    }
    if (!offerText || !offerMsg) continue;

    cards.push({
      icon: meta.emoji,
      title: `Offre ${meta.label} sur leur ${isNight ? "service de nuit" : "créneau"}`,
      rationale: `Tes équipes ${meta.label} commandent surtout sur le ${slotLabel} : ${slot.peak.qty} articles sur cette fenêtre, soit ${Math.round(slot.peak.share * 100)} % de leur volume (${slot.qty} au total). Une offre dédiée, envoyée uniquement à ce type d'équipe, travaille leur créneau sans toucher au reste de ta clientèle. ${offerText}`,
      message: offerMsg,
      detail: `Le broadcast s'ouvrira pré-ciblé sur les équipes ${meta.label} — les autres membres ne verront rien.`,
      targetType: slot.type,
    });
  }

  // Effet leurre sur les tailles (ADR 0022) — conseil de repricing interne,
  // aucun broadcast : on n'annonce pas un changement de prix aux clients.
  for (const d of sizeDecoys) {
    cards.push({
      icon: "📏",
      title: `Effet leurre : ${d.large.name}`,
      rationale: `« ${d.medium.name} » (${euro(d.medium.menuPrice)}${d.medium.qty > 0 ? `, vendu ${d.medium.qty}×` : ""}) et « ${d.large.name} » (${euro(d.large.menuPrice)}) : l'écart de ${euro(d.large.menuPrice - d.medium.menuPrice)} fait hésiter. Remonte « ${d.medium.name} » à ${euro(d.suggestedMediumPrice)} : l'écart tombe à ${euro(d.large.menuPrice - d.suggestedMediumPrice)} et passer à la grande devient une évidence. Chaque client qui reste à la petite paie ${euro(d.stayUplift)} de plus, chaque client qui bascule te rapporte ${euro(d.switchUplift)} de marge en plus. On ne remise rien — on repositionne la perception.`,
      detail: `Changement à faire sur ta carte et ton catalogue CSV (prix de « ${d.medium.name} » → ${euro(d.suggestedMediumPrice)}). Pas d'annonce aux membres : un repricing ne se broadcast pas.`,
    });
  }

  if (bundle) {
    const p0 = bundle.product;
    const ladder0 = bundle.tiers.map((t) => `${t.units} pour ${euro(t.price)}`).join(" · ");
    const promoOn = nextDateInMonthDays(todayISO, PAYDAY_DAYS);
    const sendOn = addDaysISO(promoOn, -1);
    cards.push({
      icon: "💶",
      title: "Vague de paie : pousse ton plus gros ticket",
      rationale: `Fin et début de mois, tes clients viennent d'être payés — c'est le moment où ils peuvent se faire plaisir, donc le moment de pousser l'offre qui fait le plus gros ticket : la formule dégressive « ${p0.name} » (1 pour ${euro(p0.menuPrice)} · ${ladder0}).${monthDip ? ` Tes propres ventes le confirment : ${monthDip.paydayQty} articles vendus sur la semaine de paie contre ${monthDip.tightQty} sur la semaine du 20 (−${Math.round((1 - monthDip.ratio) * 100)} %).` : ""}`,
      message: `💶 Ce ${fmtDate(promoOn).split(" ")[0]} membres : ${p0.name} — 1 pour ${euro(p0.menuPrice)} · ${ladder0} !`,
      planning: `Prochaine vague de paie : ${fmtDate(promoOn)}. L'annonce partira la veille (${fmtDate(sendOn)}). Prévois le stock de « ${p0.name} » — c'est l'offre à multiplier quand les portefeuilles sont pleins.`,
      sendOn,
      promoOn,
    });
  }

  if (monthDip && tightOffer) {
    const t = tightOffer;
    const promoOn = nextDateInMonthDays(todayISO, TIGHT_DAYS);
    const sendOn = addDaysISO(promoOn, -1);
    const remaining = t.newPrice - t.product.costPrice;
    cards.push({
      icon: "🪙",
      title: "Semaine du 20 : une petite vente plutôt que rien",
      rationale: `Autour du 20, les portefeuilles se vident — et chez toi ça se voit : ${monthDip.tightQty} articles vendus sur la semaine du 20 contre ${monthDip.paydayQty} sur la semaine de paie (−${Math.round((1 - monthDip.ratio) * 100)} %). Inutile de pousser un gros panier à des clients qui n'ont plus de budget : abaisse le ticket d'entrée. « ${t.product.name} » à ${euro(t.newPrice)} au lieu de ${euro(t.product.menuPrice)} (−${t.discountPct} %) reste rentable (${euro(remaining)} de marge) — une petite commande vaut toujours mieux qu'un client qui ne vient pas, et il garde l'habitude de venir.`,
      message: `🪙 Cette semaine pour les membres : ${t.product.name} à ${euro(t.newPrice)} au lieu de ${euro(t.product.menuPrice)} — petit prix, plaisir entier !`,
      planning: `Prochaine semaine du 20 : à partir du ${fmtDate(promoOn)}. L'annonce partira la veille (${fmtDate(sendOn)}) et l'offre peut courir toute la semaine creuse.`,
      sendOn,
      promoOn,
    });
  }

  if (bundle) {
    const p = bundle.product;
    const ladder = bundle.tiers
      .map((t) => `${t.units} pour ${euro(t.price)}`)
      .join(" · ");
    const marginalMargins = bundle.tiers
      .map((t) => `+${euro(t.marginalMargin)}`)
      .join(" / ");
    const topTier = bundle.tiers[bundle.tiers.length - 1];
    cards.push({
      icon: "🪜",
      title: `Formule dégressive ${p.name}`,
      rationale: `« ${p.name} » est ton article à forte valeur perçue (${euro(p.menuPrice)} carte pour ${euro(p.costPrice)} de coût, vendu ${p.qty}× sur la période) — le profil idéal pour une échelle dégressive : 1 pour ${euro(p.menuPrice)} · ${ladder}. Chaque unité ajoutée reste rentable (${marginalMargins} de marge) et le panier grimpe de ${euro(p.menuPrice)} à ${euro(topTier.price)}. Elle gagne quand elle fait monter en gamme un client venu pour une seule unité — affiche-la comme une offre membre, pas comme une réduction de groupe.`,
      message: `🪜 Offre membres : ${p.name} — 1 pour ${euro(p.menuPrice)} · ${ladder} !`,
      detail: `Astuce terrain : si tu peux alléger la garniture des unités supplémentaires (sans toucher à la première), leur coût baisse et chaque palier gagne encore en marge — la valeur perçue de la formule, elle, ne bouge pas.`,
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
          {cards.length > 0 ? `${cards.length} proposition${cards.length > 1 ? "s" : ""} calculée${cards.length > 1 ? "s" : ""}` : "Des propositions calculées"} sur
          tes {PERIOD_DAYS} derniers jours de ventes scannées — tu ajustes, tu décides, tu envoies.
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
        // Sectionné par nature de l'action (audit 2026-07-23) : le
        // restaurateur entre deux services scanne les titres, pas 14 pavés.
        <div className="space-y-6">
          {(
            [
              ["📆 Promos datées", "L'annonce part automatiquement à la date prévue — prépare ton stock.", cards.filter((c) => c.sendOn)],
              ["📣 Offres à lancer quand tu veux", null, cards.filter((c) => !c.sendOn && c.message)],
              ["🛠️ Conseils internes", "Changements de carte ou de prix — rien n'est envoyé aux membres.", cards.filter((c) => !c.message)],
            ] as [string, string | null, Card[]][]
          )
            .filter(([, , list]) => list.length > 0)
            .map(([sectionTitle, sectionSub, list]) => (
              <section key={sectionTitle}>
                <h2 className="font-bold text-gray-900 mb-0.5">
                  {sectionTitle} <span className="text-gray-400 font-normal text-sm">({list.length})</span>
                </h2>
                {sectionSub && <p className="text-xs text-gray-500 mb-3">{sectionSub}</p>}
                <div className={`space-y-4 ${sectionSub ? "" : "mt-3"}`}>
                  {list.map((card, i) => (
                    <div key={i} className="bg-white rounded-2xl border border-gray-100 p-5">
                      <div className="flex items-center gap-2 mb-2">
                        <span className="text-2xl">{card.icon}</span>
                        <h3 className="font-bold text-gray-900">{card.title}</h3>
                      </div>
                      <p className="text-sm text-gray-600 leading-relaxed mb-3">{card.rationale}</p>

                      {card.message && (
                        <div className="bg-gray-50 border border-gray-200 rounded-xl p-3 mb-1.5">
                          <p className="text-xs text-gray-400 font-semibold uppercase tracking-wide mb-1">
                            Notification proposée
                          </p>
                          <p className="text-sm text-gray-800">{card.message}</p>
                        </div>
                      )}
                      {card.planning && (
                        <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 mb-1.5">
                          <p className="text-xs text-amber-700 font-semibold uppercase tracking-wide mb-1">
                            📆 Planning
                          </p>
                          <p className="text-sm text-amber-900">{card.planning}</p>
                        </div>
                      )}
                      {card.detail && <p className="text-xs text-gray-400 mb-2">💡 {card.detail}</p>}

                      {card.message && (
                        <div className="flex justify-end mt-2">
                          <Link
                            href={broadcast(card.message, card.sendOn, card.promoOn, card.targetType)}
                            className="bg-brand-red text-white text-sm font-semibold px-4 py-2 rounded-lg hover:bg-red-700 transition-colors"
                          >
                            {card.sendOn ? "Programmer l'annonce →" : "Ajuster et envoyer →"}
                          </Link>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </section>
            ))}
        </div>
      )}

      {menuAudit && (
        <div className="bg-white rounded-2xl border border-gray-100 p-5">
          <div className="flex items-center gap-2 mb-1">
            <span className="text-2xl">🔬</span>
            <h2 className="font-bold text-gray-900">Ta carte au rayon X</h2>
          </div>
          <p className="text-sm text-gray-500 mb-4">
            Chaque article classé selon sa popularité (seuil : {menuAudit.popThreshold.toFixed(0)} ventes
            sur la période) et sa marge unitaire (seuil : {euro(menuAudit.marginThreshold)}).
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {(
              [
                ["⭐", "Tes stars", "Populaires et rentables — protège-les : mets-les en photo, ne touche pas à leur prix.", menuAudit.stars],
                ["🐴", "Tes chevaux de trait", "Populaires mais peu rentables — monte légèrement le prix ou associe-les à un article à forte marge (vois les combos).", menuAudit.workhorses],
                ["🧩", "Tes énigmes", "Rentables mais invendus — mets-les en avant : photo, suggestion du comptoir, promo découverte.", menuAudit.puzzles],
                ["🪨", "Tes poids morts", "Ni vendus ni rentables — retire-les de la carte ou repense-les, ils encombrent le choix.", menuAudit.dogs],
              ] as [string, string, string, ProductStat[]][]
            ).map(([emoji, title, advice, list]) => (
              <div key={title} className="border border-gray-100 rounded-xl p-3">
                <p className="font-semibold text-gray-900 text-sm mb-1">
                  {emoji} {title} <span className="text-gray-400 font-normal">({list.length})</span>
                </p>
                <p className="text-xs text-gray-500 mb-2">{advice}</p>
                {list.slice(0, 4).map((p) => (
                  <p key={p.id} className="text-xs text-gray-700">
                    {p.name} — {p.qty}× · {euro(p.menuPrice - p.costPrice)} de marge
                  </p>
                ))}
                {list.length > 4 && <p className="text-xs text-gray-400 mt-1">+ {list.length - 4} autres</p>}
              </div>
            ))}
          </div>
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
