// Pour les tests de la publication automatique : une base en mémoire, une carte, des sources et un facteur factices.
// Aucun import de production ne doit venir ici.

import type { MetForecast, MetHour } from "../../signals/weather-met";
import type { PublicMenu } from "../../site-orders/menu";
import { OFFER_ARTICLE_PROBLEM, articleProblem, type OfferRow } from "../../site-offers/offers";
import type { PostEvent, PostsDb } from "../service";
import type { PostRow } from "../types";
import type { OpeningVerdict } from "./opening";
import type { AutoDeps, AutoRestaurant, NotifyInput } from "./ports";
import type { SendProof } from "./proof";
import type { AutoReason } from "./reasons";
import { eventSource, type AgendaRow } from "./sources/events";
import { matchSource } from "./sources/matches";
import { promoSource } from "./sources/promos";
import { weatherSource } from "./sources/weather";
import { NO_OFFERINGS } from "./offerings";
import { brusselsDay } from "./time";
import { ACTIVE_STATUSES, PENDING_STATUSES, type AutoSettings, type Occasion, type Offerings } from "./types";

export const RESTO = "resto";
export const DISH_ID = "33333333-3333-4333-8333-333333333333";
export const HERE = { lat: 50.8503, lng: 4.3517 };

export const MENU: PublicMenu = {
  restaurant: { id: RESTO, name: "Chez Exemple", logoUrl: null },
  retentionDays: 30,
  whatsapp: null,
  hidden: 0,
  categories: [
    {
      name: "Menus",
      items: [{ id: DISH_ID, name: "Menu poulet frit 6 pièces", priceCents: 1250, description: null, allergens: { text: "", confirmed: false }, imageUrl: null, groups: [] }],
    },
  ],
};

/** 17 h et 10 h à Bruxelles en novembre (UTC+1). */
export const at17 = (day: string) => new Date(`${day}T16:00:00Z`);
export const at10 = (day: string) => new Date(`${day}T09:00:00Z`);

export const agendaRow = (day: string, over: Partial<AgendaRow> = {}): AgendaRow => ({
  source: "visitbrussels",
  external_id: `ev1:${day}`,
  event_id: "ev1",
  name: "Brocante de la place Exemple",
  category: "brocante",
  day,
  starts_at: `${day}T08:00:00Z`,
  ends_at: `${day}T17:00:00Z`,
  lat: HERE.lat + 0.0054, // environ 600 m au nord
  lng: HERE.lng,
  is_canceled: false,
  synced_at: `${day}T00:00:00Z`,
  ...over,
});

const clone = <T>(v: T): T => (v === null || v === undefined ? v : (JSON.parse(JSON.stringify(v)) as T));

/** Une prévision INVENTÉE pour un jour : les heures de Bruxelles de 8 h à 23 h (UTC+1 en novembre), sèches et couvertes. */
export function forecast(day: string, set: (localHour: number) => Partial<MetHour> = () => ({})): MetForecast {
  return {
    updatedAt: `${day}T00:00:00Z`,
    hours: Array.from({ length: 16 }, (_, i) => i + 8).map((h) => ({
      time: `${day}T${String(h - 1).padStart(2, "0")}:00:00.000Z`,
      airTemperature: 9,
      cloudAreaFraction: 90,
      precipitationNextHour: 0,
      ...set(h),
    })),
  };
}
export const rainAtNoon = (day: string) => forecast(day, (h) => (h >= 11 && h <= 13 ? { precipitationNextHour: 1.2 } : {}));
export const sunAtNoon = (day: string) => forecast(day, (h) => (h >= 11 && h <= 13 ? { cloudAreaFraction: 5, airTemperature: 15 } : {}));

export function world() {
  const state = {
    now: at17("2026-11-27"),
    open: true,
    menu: MENU as PublicMenu | null,
    coords: HERE as { lat: number; lng: number } | null,
    /** Ce que le journal dira du prochain message : « delivered » par défaut. */
    proof: { status: "delivered", delivered_at: "2026-11-27T16:00:05Z", bounced_at: null, complained_at: null } as SendProof | null,
    notifyFails: null as AutoReason | null,
    /** Les horaires : ouvert par défaut ; `closedDays` : des jours fermés, quoi que dise `opening`. */
    opening: "ouvert" as OpeningVerdict,
    closedDays: new Set<string>(),
    offerings: NO_OFFERINGS as Offerings,
    /** Les offres de la page de commande : source éteinte par défaut (`offersOff` dit pourquoi). `offersDown` : illisibles. */
    offersOff: "les offres ne sont pas activées" as string | null,
    offers: new Map<string, OfferRow>(),
    offersDown: false,
    /** Les plats retirés de la commande. */
    hiddenDishes: new Set<string>(),
    /** La météo : éteinte par défaut ; `forecast` : la prévision rendue ; `down` : le service ne répond pas. */
    weather: { on: false, down: false, forecast: null as MetForecast | null, asked: [] as { network: boolean; at: string }[] },
  };
  const posts = new Map<string, PostRow>();
  const files = new Map<string, Uint8Array>();
  const events: PostEvent[] = [];
  const settings = new Map<string, AutoSettings>();
  const occasions = new Map<string, Occasion>();
  const sent: NotifyInput[] = [];
  const proofs = new Map<string, SendProof | null>();
  const agenda: AgendaRow[] = [];
  let ids = 0;
  const readOffer = (id: string) => {
    if (state.offersDown) throw new Error("panne inventée");
    return clone(state.offers.get(id) ?? null);
  };
  const orderable = (list: OfferRow[]) => new Set(list.flatMap((o) => o.menu_item_id ?? []).filter((id) => !state.hiddenDishes.has(id)));

  const postsDb: PostsDb = {
    async get(restaurantId, id) { const r = posts.get(id); return r && r.restaurant_id === restaurantId ? clone(r) : null; },
    async getById(id) { return clone(posts.get(id) ?? null); },
    async getBySlug(restaurantId, slug) { return clone([...posts.values()].find((r) => r.restaurant_id === restaurantId && r.slug === slug) ?? null); },
    async insert(row) {
      const full: PostRow = {
        ...row, revision: 1, published_title: null, published_blocks: null, published_revision: null, rights_confirmed_at: null, rights_confirmed_by: null,
        mask_reason: null, masked_at: null, created_at: state.now.toISOString(), updated_at: state.now.toISOString(), first_published_at: null, published_at: null,
        withdrawn_at: null, expires_at: null,
      };
      posts.set(row.id, full);
      return clone(full);
    },
    async update(id, patch, expect) {
      const r = posts.get(id);
      if (!r || (expect.revision !== undefined && r.revision !== expect.revision) || (expect.status !== undefined && r.status !== expect.status)) return { ok: false, why: "stale" };
      if (patch.slug && [...posts.values()].some((o) => o.id !== id && o.restaurant_id === r.restaurant_id && o.slug === patch.slug)) return { ok: false, why: "slug" };
      Object.assign(r, clone(patch));
      return { ok: true, row: clone(r) };
    },
    async remove(id) {
      posts.delete(id);
      for (const o of occasions.values()) if (o.post_id === id) o.post_id = null;
    },
    async addEvent(e) { events.push(e); },
    async hasEvent() { return false; },
    async bump() {},
    async onlineByOffer(restaurantId, offerId) { return clone([...posts.values()].filter((p) => p.restaurant_id === restaurantId && p.offer_id === offerId && p.status === "en_ligne")); },
    async offerProblem(_restaurantId, offerId, now) {
      const offer = readOffer(offerId);
      const problem = articleProblem(offer, brusselsDay(now), orderable(offer ? [offer] : []), true);
      return problem ? OFFER_ARTICLE_PROBLEM[problem] : null;
    },
    async listFiles(folder) { return [...files.keys()].filter((f) => f.startsWith(`${folder}/`)); },
    async uploadFile(path, data) { files.set(path, data); },
    async removeFiles(paths) { for (const p of paths) files.delete(p); },
  };

  const dayTaken = (o: Pick<Occasion, "id" | "restaurant_id" | "publish_day" | "status">) =>
    ACTIVE_STATUSES.includes(o.status) &&
    [...occasions.values()].some((x) => x.id !== o.id && x.restaurant_id === o.restaurant_id && x.publish_day === o.publish_day && ACTIVE_STATUSES.includes(x.status));

  const db: AutoDeps["db"] = {
    async settings(id) { return clone(settings.get(id) ?? null); },
    async enabledSettings() { return clone([...settings.values()].filter((s) => s.enabled)); },
    async saveSettings(row) { settings.set(row.restaurant_id, clone(row)); },
    async recentOccasions(id, since) { return clone([...occasions.values()].filter((o) => o.restaurant_id === id && o.publish_day >= since)); },
    async occasion(id) { return clone(occasions.get(id) ?? null); },
    async occasionByPost(restaurantId, postId) { return clone([...occasions.values()].find((o) => o.restaurant_id === restaurantId && o.post_id === postId) ?? null); },
    async pendingOccasions(id) { return clone([...occasions.values()].filter((o) => PENDING_STATUSES.includes(o.status) && (id === undefined || o.restaurant_id === id))); },
    async insertOccasion(row) {
      const full: Occasion = { ...clone(row), id: `00000000-0000-4000-8000-${String(++ids).padStart(12, "0")}`, created_at: state.now.toISOString(), updated_at: state.now.toISOString() };
      if ([...occasions.values()].some((o) => o.restaurant_id === row.restaurant_id && o.source_key === row.source_key) || dayTaken(full)) return null;
      occasions.set(full.id, full);
      return clone(full);
    },
    async updateOccasion(id, patch, expect) {
      const o = occasions.get(id);
      if (!o || !expect.includes(o.status)) return null;
      const next = { ...o, ...clone(patch) };
      if (dayTaken(next)) return null;
      occasions.set(id, next);
      return clone(next);
    },
    async sendProof(sendId) { return clone(proofs.get(sendId) ?? null); },
    async expiredPosts(nowIso) { return clone([...posts.values()].filter((p) => p.status === "en_ligne" && !!p.expires_at && p.expires_at <= nowIso)); },
  };

  const sources = [
    promoSource({
      async ready() { return state.offersOff; },
      async published(restaurantId, since) {
        if (state.offersDown) throw new Error("panne inventée");
        return clone([...state.offers.values()].filter((o) => o.restaurant_id === restaurantId && o.state === "publiee" && o.last_day >= since));
      },
      async get(_restaurantId, id) { return readOffer(id); },
      async orderable(_restaurantId, list) { return orderable(list); },
    }),
    eventSource({
      async nearby({ from, to }) { return clone(agenda.filter((r) => r.day >= from && r.day <= to)); },
      async one(source, externalId) { return clone(agenda.find((r) => r.source === source && r.external_id === externalId) ?? null); },
    }),
    matchSource(async () => ({ ok: true, matches: [], perCompetition: {}, errors: [] }), false),
    weatherSource({
      reader: {
        async get(_c, { now, network }) {
          state.weather.asked.push({ network, at: now.toISOString() });
          if (state.weather.down || !state.weather.forecast) return { ok: false, error: "panne inventée" };
          return { ok: true, forecast: clone(state.weather.forecast) };
        },
      },
      off: null,
      cacheReady: async () => state.weather.on,
    }),
  ];

  const deps = (): AutoDeps => ({
    db,
    posts: postsDb,
    sources,
    now: state.now,
    async restaurant(id): Promise<AutoRestaurant> { return { id, name: "Chez Exemple", coords: state.coords, open: state.open }; },
    async menu() { return state.menu; },
    async offerings() { return state.offerings; },
    async opening(_id, window) { return state.closedDays.has(brusselsDay(window.from)) ? "ferme" : state.opening; },
    async notify(input) {
      if (state.notifyFails) return { sent: false, reason: state.notifyFails };
      sent.push(input);
      proofs.set(input.sendId, state.proof);
      return { sent: true };
    },
  });

  return { state, deps, posts, events, settings, occasions, sent, proofs, agenda, list: () => [...occasions.values()] };
}
