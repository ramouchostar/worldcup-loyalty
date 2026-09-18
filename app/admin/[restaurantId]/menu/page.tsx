"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Camera, Gem, Lightbulb, TriangleAlert } from "lucide-react";
import { useParams } from "next/navigation";
import type { MenuItem } from "@/types";
import { SOLO_BANDS, COMMUNITY_BANDS } from "@/lib/reward-bands";
import { fitsSaverCap } from "@/lib/reserve-tiers-view";
import { CATALOGUE_BUDGET_PCT, catalogPricePoints } from "@/lib/catalogue";
import { readJsonSafe, describeHttpFailure } from "@/lib/fetch-json";
import { CatalogGapsSection } from "@/components/admin/CatalogGapsSection";
import { menuImageUrl } from "@/lib/menu-images";
import { PageHeader } from "@/components/admin/ui";

const TEMPLATE = `nom;categorie;prix_vente;prix_revient
Finest burger;Burger;9,00;0,94
Frites Medium;Accompagnement;3,00;0,24
Churros 6 pcs;Dessert;3,50;0,31
Coca 33cl;Boisson;2,50;0,30`;

const euro = (n: number) =>
  Number(n).toLocaleString("fr-BE", { style: "currency", currency: "EUR" });

type Msg = { kind: "ok" | "err"; text: string; details?: string[] };
type TierRow = { layer: string; min_threshold: number; menu_item_id: string | null; is_active: boolean };
type Suggestion = { layer: string; threshold: number; item_name: string | null; rationale: string };
// Données serveur des gros cadeaux de la réserve (ADR 0060) — euros, console uniquement.
type ReserveInfo = { avgBasket: number; budgetPct: number };

const tierKey = (layer: string, threshold: number) => `${layer}:${threshold}`;

export default function AdminMenuPage() {
  const { restaurantId } = useParams<{ restaurantId: string }>();
  const [items, setItems] = useState<MenuItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [msg, setMsg] = useState<Msg | null>(null);
  const [photoBusy, setPhotoBusy] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const [tiers, setTiers] = useState<Record<string, string | null>>({});
  const [rationales, setRationales] = useState<Record<string, string>>({});
  // Paliers solo par établissement (ADR 0017) : ceux déjà enregistrés, sinon
  // la grille par défaut ; recalculés par la suggestion.
  const [soloBands, setSoloBands] = useState<number[]>([...SOLO_BANDS]);
  const [suggesting, setSuggesting] = useState(false);
  const [savingTiers, setSavingTiers] = useState(false);
  const [tierMsg, setTierMsg] = useState<Msg | null>(null);
  // ADR 0060 — gros cadeaux de la réserve : seuils actifs enregistrés, sinon
  // calculés sur le panier moyen ; seul l'article se choisit.
  const [saverBands, setSaverBands] = useState<number[]>([]);
  const [reserveInfo, setReserveInfo] = useState<ReserveInfo | null>(null);

  const loadAll = useCallback(async () => {
    const [itemsRes, tiersRes, reserveRes] = await Promise.all([
      fetch(`/api/admin/menu?restaurantId=${restaurantId}`),
      fetch(`/api/admin/reward-tiers?restaurantId=${restaurantId}`),
      fetch(`/api/admin/reserve-tiers?restaurantId=${restaurantId}`),
    ]);
    const itemsData: MenuItem[] = itemsRes.ok ? await itemsRes.json() : [];
    const allTiers: TierRow[] = tiersRes.ok ? await tiersRes.json() : [];
    const reserve: ReserveInfo | null = reserveRes.ok ? await reserveRes.json() : null;
    const tiersData = allTiers.filter((t) => t.is_active);
    setItems(itemsData);
    setReserveInfo(reserve);

    // ADR 0061 — les gros cadeaux de la réserve cèdent la place au catalogue
    // « Mes points » : plus aucun palier `saver` n'est proposé ni enregistré.
    setSaverBands([]);

    const savedSolo = tiersData
      .filter((t) => t.layer === "solo")
      .map((t) => Number(t.min_threshold))
      .sort((a, b) => a - b);
    const bands = savedSolo.length > 0 ? savedSolo : [...SOLO_BANDS];
    setSoloBands(bands);

    const map: Record<string, string | null> = {};
    bands.forEach((b) => { map[tierKey("solo", b)] = null; });
    COMMUNITY_BANDS.forEach((b) => { map[tierKey("community", b)] = null; });
    // ADR 0061 — les paliers `saver` ne sont plus repris : « Enregistrer » les
    // laisse désactivés (un palier absent de l'envoi est désactivé côté serveur).
    tiersData
      .filter((t) => t.layer !== "saver")
      .forEach((t) => { map[tierKey(t.layer, Number(t.min_threshold))] = t.menu_item_id; });
    setTiers(map);
    setLoading(false);
  }, [restaurantId]);

  useEffect(() => { loadAll(); }, [loadAll]);

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    setMsg(null);

    const csv = await file.text();
    const res = await fetch("/api/admin/menu", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ csv, restaurantId }),
    });
    // CSV catalogue : peut être volumineux → 413 plateforme en texte.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const body: any = (await readJsonSafe(res)).data ?? {};

    if (res.ok) {
      // Grille par défaut appliquée par l'API si rien n'était configuré (ADR 0017 §4)
      const d = body.defaults ?? {};
      const extra = d.soloConfigured || d.communityConfigured || d.jetonsConfigured
        ? " Grille par défaut calculée pour ton établissement — vérifie les paliers ci-dessous."
        : "";
      setMsg({ kind: "ok", text: `${body.upserted} article(s) importé(s), ${body.deactivated} désactivé(s).${extra}`, details: body.warnings });
      await loadAll();
    } else {
      setMsg({ kind: "err", text: body.error ?? "Échec de l'import.", details: body.details });
    }
    setUploading(false);
    if (fileRef.current) fileRef.current.value = "";
  }

  function downloadTemplate() {
    const blob = new Blob([TEMPLATE], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "catalogue-modele.csv";
    a.click();
    URL.revokeObjectURL(url);
  }

  const giftItems = items.filter((i) => i.is_active && i.reward_eligible);

  async function suggest() {
    setSuggesting(true);
    setTierMsg(null);
    const res = await fetch("/api/admin/menu/suggest", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ restaurantId }),
    });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const body: any = (await readJsonSafe(res)).data ?? {};
    if (res.ok) {
      // Paliers solo recalculés pour l'établissement (ADR 0017) : on remplace
      // les bandes solo, en conservant les assignations communautaires.
      const nextBands: number[] =
        Array.isArray(body.soloBands) && body.soloBands.length > 0
          ? body.soloBands.map(Number)
          : soloBands;
      const nextTiers: Record<string, string | null> = {};
      nextBands.forEach((b) => { nextTiers[tierKey("solo", b)] = null; });
      COMMUNITY_BANDS.forEach((b) => { nextTiers[tierKey("community", b)] = tiers[tierKey("community", b)] ?? null; });

      const nextRationales: Record<string, string> = {};
      (body.suggestions as Suggestion[]).forEach((s) => {
        const item = items.find((i) => i.name === s.item_name);
        const key = tierKey(s.layer, s.threshold);
        if (item) nextTiers[key] = item.id;
        if (s.rationale) nextRationales[key] = s.rationale;
      });

      // ADR 0061 — plus de gros cadeaux de la réserve à suggérer : le client
      // choisit lui-même au catalogue « Mes points ».
      setSoloBands(nextBands);
      setTiers(nextTiers);
      setRationales(nextRationales);
      setTierMsg({ kind: "ok", text: body.note ?? "Suggestions générées." });
    } else {
      setTierMsg({ kind: "err", text: body.error ?? "Échec de la suggestion." });
    }
    setSuggesting(false);
  }

  async function saveTiers() {
    setSavingTiers(true);
    setTierMsg(null);
    const payload = Object.entries(tiers).map(([key, menu_item_id]) => {
      const [layer, threshold] = key.split(":");
      return { layer, min_threshold: Number(threshold), menu_item_id };
    });
    const res = await fetch("/api/admin/reward-tiers", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ restaurantId, tiers: payload }),
    });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const body: any = (await readJsonSafe(res)).data ?? {};
    if (res.ok) {
      setTierMsg({ kind: "ok", text: `Paliers enregistrés (${body.saved}).` });
      await loadAll();
    } else {
      // details = violations du plafond de coût par palier (ADR 0017)
      setTierMsg({ kind: "err", text: describeHttpFailure(res.status, body.error), details: body.details });
    }
    setSavingTiers(false);
  }

  function setTier(layer: string, threshold: number, itemId: string | null) {
    setTiers((prev) => ({ ...prev, [tierKey(layer, threshold)]: itemId }));
  }

  // Photo d'un article — dépôt manuel par le restaurateur, en complément de
  // l'import en masse. Le serveur valide type, poids et appartenance de
  // l'article à l'établissement ; ici on ne fait que transmettre et recharger.
  async function uploadPhoto(item: MenuItem, file: File) {
    setPhotoBusy(item.id);
    setMsg(null);
    const fd = new FormData();
    fd.set("restaurantId", restaurantId);
    fd.set("menuItemId", item.id);
    fd.set("file", file);
    const res = await fetch("/api/admin/menu/image", { method: "POST", body: fd });
    const body = (await readJsonSafe<{ error?: string }>(res)).data;
    setPhotoBusy(null);
    if (!res.ok) {
      setMsg({ kind: "err", text: body?.error ?? describeHttpFailure(res.status, null) });
      return;
    }
    setMsg({ kind: "ok", text: `Photo enregistrée pour « ${item.name} ».` });
    await loadAll();
  }

  // ADR 0061 — le restaurateur règle son catalogue « Mes points » d'un clic :
  // un article « au catalogue » est proposé aux clients (prix en points
  // calculé), un article « hors catalogue » ne l'est pas. Mise à jour
  // optimiste, annulée si le serveur refuse.
  async function toggleEligible(item: MenuItem) {
    const next = !item.reward_eligible;
    const setFlag = (value: boolean) =>
      setItems((prev) => prev.map((x) => (x.id === item.id ? { ...x, reward_eligible: value } : x)));
    setFlag(next);
    try {
      const res = await fetch("/api/admin/menu/eligible", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ restaurantId, menuItemId: item.id, rewardEligible: next }),
      });
      if (!res.ok) throw new Error(String(res.status));
    } catch {
      setFlag(!next);
      setMsg({ kind: "err", text: `Impossible de modifier « ${item.name} » au catalogue. Réessaie.` });
    }
  }

  async function removePhoto(item: MenuItem) {
    setPhotoBusy(item.id);
    setMsg(null);
    const res = await fetch(
      `/api/admin/menu/image?restaurantId=${encodeURIComponent(restaurantId)}&menuItemId=${item.id}`,
      { method: "DELETE" }
    );
    const body = (await readJsonSafe<{ error?: string }>(res)).data;
    setPhotoBusy(null);
    if (!res.ok) {
      setMsg({ kind: "err", text: body?.error ?? describeHttpFailure(res.status, null) });
      return;
    }
    setMsg({ kind: "ok", text: `Photo retirée de « ${item.name} ».` });
    await loadAll();
  }

  // `costCap` : gros cadeaux de la réserve seulement (ADR 0060) — le plafond
  // s'affiche et les articles au-dessus ne se choisissent pas (le serveur les
  // refuserait à l'enregistrement).
  function bandRow(layer: "solo" | "community" | "saver", threshold: number, label: string, costCap?: number) {
    const key = tierKey(layer, threshold);
    const rationale = rationales[key];
    return (
      <div key={key} className="py-2.5 first:pt-0 last:pb-0">
        {/* `min-w-0` sur le select n'est pas cosmétique : un élément flex a
            `min-width: auto` par défaut, donc un <select> refuse de descendre
            sous la largeur de sa plus longue option (« Magnifique Chicken
            Menu »…). Sans lui il déborde de sa colonne de grille et vient
            recouvrir le libellé de la colonne voisine. `whitespace-nowrap` sur
            le libellé évite le « € » renvoyé seul à la ligne suivante. */}
        <div className="flex items-center gap-3">
          <span className="text-sm text-ink-body w-44 shrink-0 whitespace-nowrap">{label}</span>
          <select
            value={tiers[key] ?? ""}
            onChange={(e) => setTier(layer, threshold, e.target.value || null)}
            className="flex-1 min-w-0 border border-paper-border rounded-lg px-3 py-2 text-sm bg-white"
          >
            <option value="">— aucun cadeau —</option>
            {giftItems.map((it) => {
              const blocked = costCap !== undefined && !fitsSaverCap(it, costCap);
              return (
                // Un article déjà assigné reste sélectionnable même au-dessus
                // du plafond (plafond qui bouge avec le panier moyen) : le
                // restaurateur le voit, et l'enregistrement dira pourquoi.
                <option key={it.id} value={it.id} disabled={blocked && tiers[key] !== it.id}>
                  {it.name}{blocked ? " — au-dessus du plafond" : ""}
                </option>
              );
            })}
          </select>
          {costCap !== undefined && (
            <span className="text-xs text-ink-faint shrink-0 whitespace-nowrap tabular-nums">
              plafond {euro(costCap)}
            </span>
          )}
        </div>
        {rationale && <p className="text-xs text-brand-gold mt-1 ml-[11.75rem]"><Lightbulb size={13} strokeWidth={1.8} className="inline-block mr-1 -mt-0.5" aria-hidden="true" />{rationale}</p>}
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <PageHeader
        title={<>Menu &amp; coûts</>}
        subtitle={<>Téléverse ton catalogue, puis assigne un article à chaque palier de récompense. Ces données
          servent au calcul des cadeaux et ne sont jamais visibles côté client.</>}
      />

      {/* ── Upload ──────────────────────────────────────────────────────────── */}
      <div className="bg-white rounded-xl border border-paper-border p-5 space-y-3">
        <div className="flex flex-wrap items-center gap-3">
          <label className="px-4 py-2 bg-brand-dark text-white rounded-lg text-sm font-semibold hover:opacity-90 cursor-pointer">
            {uploading ? "Import en cours…" : "Importer un CSV"}
            <input ref={fileRef} type="file" accept=".csv,text/csv" onChange={onFile} disabled={uploading} className="hidden" />
          </label>
          <button onClick={downloadTemplate} className="px-4 py-2 bg-paper-subtle text-ink-body rounded-lg text-sm font-medium hover:bg-paper-border">
            Télécharger le modèle
          </button>
        </div>
        <p className="text-xs text-ink-faint">
          Séparateur <code>;</code> ou <code>,</code>, virgule décimale acceptée (ex. <code>0,31</code>).
          Re-téléverser remplace le catalogue : les articles absents sont désactivés (jamais supprimés).
        </p>
      </div>

      {/* ADR 0046 — boucle de complétion : libellés récurrents des tickets
          absents du catalogue, réglés en un geste (jamais de re-téléversement). */}
      <CatalogGapsSection restaurantId={restaurantId} menuItems={items} onResolved={loadAll} />

      {msg && (
        <div className={`rounded-xl p-3 text-sm border ${msg.kind === "ok" ? "bg-good/10 border-good/30 text-good" : "bg-danger/10 border-danger/30 text-danger"}`}>
          <p className="font-medium">{msg.text}</p>
          {msg.details && msg.details.length > 0 && (
            <ul className="mt-1 list-disc list-inside text-xs opacity-80">
              {msg.details.slice(0, 8).map((d, i) => <li key={i}>{d}</li>)}
            </ul>
          )}
        </div>
      )}

      {/* ── Catalogue ───────────────────────────────────────────────────────── */}
      {loading ? (
        <div className="space-y-2">
          {[1, 2, 3, 4].map((i) => <div key={i} className="bg-white rounded-xl h-12 animate-pulse border border-paper-border" />)}
        </div>
      ) : items.length === 0 ? (
        <div className="bg-white rounded-xl border border-dashed border-paper-border p-8 text-center text-sm text-ink-muted">
          Aucun article. Importe ton premier catalogue avec le bouton ci-dessus.
        </div>
      ) : (() => {
        // Marge unitaire (prix vente − prix revient) — top/flop parmi les
        // articles actifs réellement vendus (prix > 0 : les accompagnements
        // offerts, volontairement à 0 €, ne sont pas des « mauvais élèves »).
        const margin = (it: MenuItem) => Number(it.menu_price) - Number(it.cost_price ?? 0);
        // Coût inconnu (ADR 0046) : exclu des classements top/flop marge —
        // une marge calculée sur un coût 0 serait un mensonge flatteur.
        const priced = items.filter((i) => i.is_active && Number(i.menu_price) > 0 && i.cost_price != null);
        const sorted = [...priced].sort((a, b) => margin(b) - margin(a));
        const topIds = new Set(sorted.slice(0, 3).map((i) => i.id));
        const flopIds = new Set(sorted.length > 3 ? sorted.slice(-3).map((i) => i.id) : []);
        const best = sorted[0];
        const worst = sorted.length > 1 ? sorted[sorted.length - 1] : null;
        return (
          <>
            {best && worst && (
              <div className="grid grid-cols-2 gap-3">
                <div className="bg-good/10 border border-good/30 rounded-xl p-3">
                  <p className="text-xs text-good font-semibold uppercase tracking-wide flex items-center gap-1"><Gem size={12} strokeWidth={2} aria-hidden="true" />Marge la plus forte</p>
                  <p className="text-sm font-bold text-ink mt-1 truncate">{best.name}</p>
                  <p className="text-xs text-good">{euro(margin(best))} de marge par vente</p>
                </div>
                <div className="bg-warn/10 border border-warn/30 rounded-xl p-3">
                  <p className="text-xs text-warn font-semibold uppercase tracking-wide flex items-center gap-1"><TriangleAlert size={12} strokeWidth={2} aria-hidden="true" />Marge la plus faible</p>
                  <p className="text-sm font-bold text-ink mt-1 truncate">{worst.name}</p>
                  <p className="text-xs text-warn">{euro(margin(worst))} de marge par vente</p>
                </div>
              </div>
            )}
            {/* Repère de complétude des photos : dit d'un coup d'œil combien
                d'articles sont illustrés, sans dramatiser les manquants (une
                sauce ou une canette n'a pas vocation à avoir une photo). */}
            {(() => {
              const avec = items.filter((i) => i.image_path).length;
              return (
                <p className="text-xs text-ink-muted">
                  <span className="font-semibold text-ink-body">{avec}</span> des {items.length} articles ont une photo.
                  Clique une miniature pour l&apos;ouvrir en grand et vérifier qu&apos;elle colle à l&apos;article ;
                  « Ajouter » / « Changer » dépose ta propre photo (JPG, PNG ou WebP, 2 Mo max).
                </p>
              );
            })()}
            {/* overflow-x-auto + min-w : la table 7 colonnes scrolle sur
                téléphone au lieu de s'écraser (audit 2026-07-23) */}
            <div className="bg-white rounded-xl border border-paper-border overflow-x-auto">
              <table className="w-full min-w-[720px] text-sm">
                <thead className="bg-paper text-ink-muted text-xs uppercase">
                  <tr>
                    <th className="text-left font-medium px-4 py-2.5 w-16">Photo</th>
                    <th className="text-left font-medium px-4 py-2.5">Article</th>
                    <th className="text-left font-medium px-4 py-2.5">Catégorie</th>
                    <th className="text-right font-medium px-4 py-2.5">Prix vente</th>
                    <th className="text-right font-medium px-4 py-2.5">Prix revient</th>
                    <th className="text-right font-medium px-4 py-2.5" title="Prix de vente − prix de revient">Marge</th>
                    <th className="text-right font-medium px-4 py-2.5" title="Valeur perçue par euro de coût">Ratio cadeau</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-paper-border">
                  {items.map((it) => {
                    const costKnown = it.cost_price != null;
                    const ratio = costKnown && it.cost_price! > 0 ? it.menu_price / it.cost_price! : 0;
                    const m = costKnown ? margin(it) : null;
                    const isTop = topIds.has(it.id);
                    const isFlop = flopIds.has(it.id);
                    const photo = menuImageUrl(it.image_path);
                    const busy = photoBusy === it.id;
                    return (
                      <tr key={it.id} className={`${it.is_active ? "" : "opacity-50"} ${isTop ? "bg-good/10/60" : isFlop ? "bg-warn/10/60" : ""}`}>
                        <td className="px-4 py-2.5">
                          {/* La miniature ouvre la photo en grand (vérifier
                              qu'elle colle à l'article) ; le lien dessous
                              ouvre le sélecteur de fichier. Un article sans
                              photo présente directement une zone cliquable :
                              l'absence de photo est neutre — beaucoup
                              d'articles n'en auront jamais (sauces, canettes)
                              — mais doit rester actionnable en un geste. */}
                          <div className="w-12">
                            {photo ? (
                              <a href={photo} target="_blank" rel="noopener noreferrer" title="Ouvrir en grand">
                                {/* eslint-disable-next-line @next/next/no-img-element */}
                                <img
                                  src={photo}
                                  alt={it.name}
                                  loading="lazy"
                                  className="h-12 w-12 object-cover rounded-lg border border-paper-border hover:opacity-80"
                                />
                              </a>
                            ) : (
                              <label className="h-12 w-12 rounded-lg border border-dashed border-paper-border grid place-items-center text-ink-faint text-lg cursor-pointer hover:border-ink-faint hover:text-ink-body" title="Ajouter une photo">
                                <Camera size={17} strokeWidth={1.7} aria-hidden="true" />
                                <input
                                  type="file"
                                  accept="image/jpeg,image/png,image/webp"
                                  className="hidden"
                                  disabled={busy}
                                  onChange={(e) => {
                                    const f = e.target.files?.[0];
                                    e.target.value = ""; // re-choisir le même fichier doit redéclencher
                                    if (f) uploadPhoto(it, f);
                                  }}
                                />
                              </label>
                            )}
                            {busy ? (
                              <span className="block text-[11px] text-ink-faint mt-1 text-center">…</span>
                            ) : (
                              <div className="flex items-center justify-center gap-1.5 mt-1">
                                <label className="text-[11px] text-ink-muted hover:text-ink underline cursor-pointer">
                                  {photo ? "Changer" : "Ajouter"}
                                  <input
                                    type="file"
                                    accept="image/jpeg,image/png,image/webp"
                                    className="hidden"
                                    onChange={(e) => {
                                      const f = e.target.files?.[0];
                                      e.target.value = "";
                                      if (f) uploadPhoto(it, f);
                                    }}
                                  />
                                </label>
                                {photo && (
                                  <button
                                    type="button"
                                    onClick={() => removePhoto(it)}
                                    className="text-[11px] text-ink-faint hover:text-ink-body underline"
                                  >
                                    Retirer
                                  </button>
                                )}
                              </div>
                            )}
                          </div>
                        </td>
                        <td className="px-4 py-2.5 font-medium text-ink">
                          {it.name}
                          {isTop && <span className="ml-2 text-xs bg-good/12 text-good px-1.5 py-0.5 rounded-full">top marge</span>}
                          {isFlop && <span className="ml-2 text-xs bg-warn/12 text-warn px-1.5 py-0.5 rounded-full">marge faible</span>}
                          {!it.is_active && <span className="ml-2 text-xs bg-danger/12 text-danger px-1.5 py-0.5 rounded-full">inactif</span>}
                          {/* ADR 0061 — un clic met l'article au catalogue « Mes points » ou l'en retire. */}
                          <button
                            type="button"
                            onClick={() => void toggleEligible(it)}
                            title={it.reward_eligible ? "Retirer du catalogue « Mes points »" : "Mettre au catalogue « Mes points »"}
                            className={`ml-2 text-xs px-1.5 py-0.5 rounded-full border transition-colors ${
                              it.reward_eligible
                                ? "border-good/30 bg-good/12 text-good hover:bg-good/20"
                                : "border-paper-border bg-paper-subtle text-ink-muted hover:text-ink-body"
                            }`}
                          >
                            {it.reward_eligible ? "au catalogue" : "hors catalogue"}
                          </button>
                        </td>
                        <td className="px-4 py-2.5 text-ink-body">{it.category}</td>
                        <td className="px-4 py-2.5 text-right tabular-nums text-ink-body">{euro(it.menu_price)}</td>
                        <td className="px-4 py-2.5 text-right tabular-nums text-ink-body">
                          {costKnown ? euro(it.cost_price!) : (
                            <span className="text-xs bg-warn/10 text-warn px-1.5 py-0.5 rounded-full" title="Prix de revient inconnu — cet article est exclu des cadeaux et sa marge n'est pas calculée">
                              coût manquant
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-2.5 text-right tabular-nums">
                          {m !== null ? (
                            <span className={`font-semibold ${isTop ? "text-good" : isFlop ? "text-warn" : "text-ink-body"}`}>
                              {euro(m)}
                            </span>
                          ) : (
                            <span className="text-ink-faint/60">—</span>
                          )}
                        </td>
                        <td className="px-4 py-2.5 text-right tabular-nums">
                          <span className={`font-semibold ${ratio >= 8 ? "text-good" : ratio >= 4 ? "text-warn" : "text-ink-faint"}`}>
                            {ratio > 0 ? `×${ratio.toFixed(1)}` : "—"}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </>
        );
      })()}

      {/* ── Paliers de récompense ───────────────────────────────────────────── */}
      {!loading && items.length > 0 && (
        <div className="bg-white rounded-xl border border-paper-border p-5 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="font-bold text-ink">Paliers de récompense</h2>
              <p className="text-xs text-ink-muted mt-0.5">
                Assigne un article à chaque palier. L&apos;app peut te suggérer le meilleur choix.
              </p>
            </div>
            <div className="flex items-center gap-2">
              <button onClick={suggest} disabled={suggesting || giftItems.length === 0}
                className="px-3 py-2 bg-brand-gold/15 text-warn border border-brand-gold/40 rounded-lg text-sm font-semibold hover:bg-brand-gold/25 disabled:opacity-50">
                {suggesting ? "Suggestion…" : "Suggérer avec l'IA"}
              </button>
              <button onClick={saveTiers} disabled={savingTiers}
                className="px-3 py-2 bg-brand-dark text-white rounded-lg text-sm font-semibold hover:opacity-90 disabled:opacity-50">
                {savingTiers ? "Enregistrement…" : "Enregistrer les paliers"}
              </button>
            </div>
          </div>

          {tierMsg && (
            <div className={`rounded-lg p-2.5 text-sm border ${tierMsg.kind === "ok" ? "bg-good/10 border-good/30 text-good" : "bg-danger/10 border-danger/30 text-danger"}`}>
              <p>{tierMsg.text}</p>
              {tierMsg.details && tierMsg.details.length > 0 && (
                <ul className="mt-1 list-disc list-inside text-xs opacity-80">
                  {tierMsg.details.slice(0, 8).map((d, i) => <li key={i}>{d}</li>)}
                </ul>
              )}
            </div>
          )}

          <div className="grid md:grid-cols-2 gap-5">
            <div className="min-w-0">
              <p className="text-xs font-semibold text-ink-muted uppercase tracking-wide mb-1">Récompense solo (montant de commande)</p>
              <div className="divide-y divide-paper-border">
                {soloBands.map((b) => bandRow("solo", b, `Commande ≥ ${b} €`))}
              </div>
            </div>
            <div className="min-w-0">
              <p className="text-xs font-semibold text-ink-muted uppercase tracking-wide mb-1">Cadeaux d&apos;équipe (points d&apos;équipe)</p>
              {/* ADR 0061 §7 — offert UNE fois à chaque membre quand l'équipe
                  franchit le palier, si sa dépense le finance (ADR 0017). */}
              <p className="text-xs text-ink-muted mb-1">Offert une fois à chaque membre quand l&apos;équipe franchit le palier.</p>
              <div className="divide-y divide-paper-border">
                {COMMUNITY_BANDS.map((b) => bandRow("community", b, `Palier ${b.toLocaleString("fr-BE")} points`))}
              </div>
            </div>
          </div>

          {/* ADR 0061 — le catalogue « Mes points » remplace les gros cadeaux
              de la réserve : tout article « au catalogue » (actif, prix de
              revient connu) est proposé aux clients, à un prix en points
              calculé pour tenir le budget cadeaux. Aucun seuil à choisir. */}
          {(() => {
            const pct = reserveInfo?.budgetPct ?? CATALOGUE_BUDGET_PCT;
            const rows = items
              .filter((i) => i.is_active && i.reward_eligible && Number(i.cost_price) > 0)
              .map((i) => ({ id: i.id, name: i.name, cost: Number(i.cost_price), points: catalogPricePoints(Number(i.cost_price), pct) ?? 0 }))
              .sort((a, b) => a.points - b.points || a.name.localeCompare(b.name));
            return (
              <div className="min-w-0 border-t border-paper-border pt-4">
                <p className="text-xs font-semibold text-ink-muted uppercase tracking-wide mb-1">Catalogue « Mes points »</p>
                <p className="text-xs text-ink-faint mb-2">
                  Tes clients gagnent des points à chaque ticket et choisissent eux-mêmes leur cadeau parmi les
                  articles « au catalogue ». Le prix en points est calculé depuis le prix de revient pour tenir ton
                  budget cadeaux ({Math.round(pct * 100)} %). Un clic sur « au catalogue » dans la liste ci-dessus
                  retire l&apos;article, ou l&apos;y remet.
                </p>
                {rows.length > 0 ? (
                  <details>
                    <summary className="cursor-pointer text-xs font-semibold text-ink-body">
                      {rows.length} articles au catalogue — voir les prix en points
                    </summary>
                    <div className="mt-2 divide-y divide-paper-border">
                      {rows.map((row) => (
                        <div key={row.id} className="flex items-center justify-between gap-3 py-1.5 text-xs">
                          <span className="text-ink-body">{row.name}</span>
                          <span className="tabular-nums text-ink-muted shrink-0">
                            coût {euro(row.cost)} → <span className="font-semibold text-ink">{row.points.toLocaleString("fr-BE")} points</span>
                          </span>
                        </div>
                      ))}
                    </div>
                  </details>
                ) : (
                  <p className="text-xs text-warn">
                    Aucun article au catalogue : ajoute un prix de revient et mets l&apos;article « au catalogue ».
                  </p>
                )}
              </div>
            );
          })()}

          <p className="text-xs text-ink-faint">
            Un palier sans article ne donne aucun cadeau. Tant qu&apos;aucun palier n&apos;est enregistré pour
            une couche, la grille héritée s&apos;applique automatiquement.
          </p>
        </div>
      )}

      {/* ── Cadeau des 4 jetons (ADR 0017) ─────────────────────────────────── */}
      {!loading && items.length > 0 && (
        <JetonsGiftCard restaurantId={restaurantId} items={items} />
      )}
    </div>
  );
}

// Cadeau remis pour 4 jetons (actions sociales / parrainages) — aucun achat en
// face, donc plafond strict : coût ≤ panier moyen × budget cadeaux (ADR 0017).
// L'app suggère le meilleur ratio valeur perçue / coût, l'admin décide.
type JetonsInfo = {
  current: { id: string | null; name: string; cost: number };
  suggestion: { id: string; name: string; menu_price: number; cost_price: number } | null;
  costCap: number;
  avgBasket: number;
};

function JetonsGiftCard({ restaurantId, items }: { restaurantId: string; items: MenuItem[] }) {
  const [info, setInfo] = useState<JetonsInfo | null>(null);
  const [selected, setSelected] = useState<string>("");
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<Msg | null>(null);

  const load = useCallback(async () => {
    const res = await fetch(`/api/admin/jetons-gift?restaurantId=${restaurantId}`);
    if (res.ok) {
      const data: JetonsInfo = await res.json();
      setInfo(data);
      setSelected(data.current.id ?? "");
    }
  }, [restaurantId]);

  useEffect(() => { load(); }, [load]);

  async function save(itemId: string) {
    if (!itemId) return;
    setSaving(true);
    setMsg(null);
    const res = await fetch("/api/admin/jetons-gift", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ restaurantId, menu_item_id: itemId }),
    });
    const { data: body } = await readJsonSafe<{ error?: string }>(res);
    if (res.ok) {
      setMsg({ kind: "ok", text: "Cadeau des jetons enregistré." });
      await load();
    } else {
      setMsg({ kind: "err", text: describeHttpFailure(res.status, body?.error) });
    }
    setSaving(false);
  }

  if (!info) {
    return <div className="bg-white rounded-xl h-24 animate-pulse border border-paper-border" />;
  }

  const affordable = items.filter(
    (i) => i.is_active && i.reward_eligible && Number(i.cost_price) <= info.costCap
  );

  return (
    <div className="bg-white rounded-xl border border-paper-border p-5 space-y-3">
      <div>
        <h2 className="font-bold text-ink">Cadeau des 4 jetons</h2>
        <p className="text-xs text-ink-muted mt-0.5">
          Remis pour 4 jetons (actions sociales / parrainages) — aucun achat en face, donc coût réel
          plafonné à {euro(info.costCap)} ({euro(info.avgBasket)} de panier moyen × budget cadeaux).
        </p>
      </div>

      <div className="flex items-center gap-2 text-sm">
        <span className="text-ink-muted">Cadeau actuel :</span>
        <span className="font-semibold text-ink">{info.current.name}</span>
        <span className="text-xs text-ink-faint">(coût {euro(info.current.cost)})</span>
      </div>

      {info.suggestion && info.suggestion.id !== info.current.id && (
        <div className="bg-brand-gold/10 border border-brand-gold/30 rounded-lg p-3 flex flex-wrap items-center justify-between gap-2">
          <p className="text-xs text-warn">
            <Lightbulb size={13} strokeWidth={1.8} className="inline-block mr-1 -mt-0.5" aria-hidden="true" />Suggestion : <span className="font-semibold">{info.suggestion.name}</span> — perçu à{" "}
            {euro(info.suggestion.menu_price)} pour {euro(info.suggestion.cost_price)} de coût réel
            (ratio ×{(info.suggestion.menu_price / info.suggestion.cost_price).toFixed(1)}).
          </p>
          <button
            onClick={() => save(info.suggestion!.id)}
            disabled={saving}
            className="text-xs px-3 py-1.5 bg-brand-gold/20 text-warn border border-brand-gold/40 rounded-lg font-semibold hover:bg-brand-gold/30 disabled:opacity-50"
          >
            Appliquer
          </button>
        </div>
      )}

      <div className="flex items-center gap-2">
        <select
          value={selected}
          onChange={(e) => setSelected(e.target.value)}
          className="flex-1 min-w-0 border border-paper-border rounded-lg px-3 py-2 text-sm bg-white"
        >
          <option value="">— choisir un article (sous plafond) —</option>
          {affordable.map((it) => (
            <option key={it.id} value={it.id}>{it.name}</option>
          ))}
        </select>
        <button
          onClick={() => save(selected)}
          disabled={saving || !selected}
          className="px-3 py-2 bg-brand-dark text-white rounded-lg text-sm font-semibold hover:opacity-90 disabled:opacity-50"
        >
          {saving ? "Enregistrement…" : "Enregistrer"}
        </button>
      </div>

      {msg && (
        <div className={`rounded-lg p-2.5 text-sm border ${msg.kind === "ok" ? "bg-good/10 border-good/30 text-good" : "bg-danger/10 border-danger/30 text-danger"}`}>
          {msg.text}
        </div>
      )}
    </div>
  );
}
