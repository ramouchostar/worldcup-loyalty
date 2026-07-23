"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useParams } from "next/navigation";
import type { MenuItem } from "@/types";
import { SOLO_BANDS, COMMUNITY_BANDS } from "@/lib/reward-bands";

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

const tierKey = (layer: string, threshold: number) => `${layer}:${threshold}`;

export default function AdminMenuPage() {
  const { restaurantId } = useParams<{ restaurantId: string }>();
  const [items, setItems] = useState<MenuItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [msg, setMsg] = useState<Msg | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const [tiers, setTiers] = useState<Record<string, string | null>>({});
  const [rationales, setRationales] = useState<Record<string, string>>({});
  // Paliers solo par établissement (ADR 0017) : ceux déjà enregistrés, sinon
  // la grille par défaut ; recalculés par la suggestion.
  const [soloBands, setSoloBands] = useState<number[]>([...SOLO_BANDS]);
  const [suggesting, setSuggesting] = useState(false);
  const [savingTiers, setSavingTiers] = useState(false);
  const [tierMsg, setTierMsg] = useState<Msg | null>(null);

  const loadAll = useCallback(async () => {
    const [itemsRes, tiersRes] = await Promise.all([
      fetch(`/api/admin/menu?restaurantId=${restaurantId}`),
      fetch(`/api/admin/reward-tiers?restaurantId=${restaurantId}`),
    ]);
    const itemsData: MenuItem[] = itemsRes.ok ? await itemsRes.json() : [];
    const allTiers: TierRow[] = tiersRes.ok ? await tiersRes.json() : [];
    const tiersData = allTiers.filter((t) => t.is_active);
    setItems(itemsData);

    const savedSolo = tiersData
      .filter((t) => t.layer === "solo")
      .map((t) => Number(t.min_threshold))
      .sort((a, b) => a - b);
    const bands = savedSolo.length > 0 ? savedSolo : [...SOLO_BANDS];
    setSoloBands(bands);

    const map: Record<string, string | null> = {};
    bands.forEach((b) => { map[tierKey("solo", b)] = null; });
    COMMUNITY_BANDS.forEach((b) => { map[tierKey("community", b)] = null; });
    tiersData.forEach((t) => { map[tierKey(t.layer, Number(t.min_threshold))] = t.menu_item_id; });
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
    const body = await res.json();

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
    const body = await res.json();
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
    const body = await res.json();
    if (res.ok) {
      setTierMsg({ kind: "ok", text: `Paliers enregistrés (${body.saved}).` });
      await loadAll();
    } else {
      // details = violations du plafond de coût par palier (ADR 0017)
      setTierMsg({ kind: "err", text: body.error ?? "Échec de l'enregistrement.", details: body.details });
    }
    setSavingTiers(false);
  }

  function setTier(layer: string, threshold: number, itemId: string | null) {
    setTiers((prev) => ({ ...prev, [tierKey(layer, threshold)]: itemId }));
  }

  function bandRow(layer: "solo" | "community", threshold: number, label: string) {
    const key = tierKey(layer, threshold);
    const rationale = rationales[key];
    return (
      <div key={key} className="py-2.5 first:pt-0 last:pb-0">
        <div className="flex items-center gap-3">
          <span className="text-sm text-gray-600 w-32 shrink-0">{label}</span>
          <select
            value={tiers[key] ?? ""}
            onChange={(e) => setTier(layer, threshold, e.target.value || null)}
            className="flex-1 border border-gray-200 rounded-lg px-3 py-2 text-sm bg-white"
          >
            <option value="">— aucun cadeau —</option>
            {giftItems.map((it) => (
              <option key={it.id} value={it.id}>{it.name}</option>
            ))}
          </select>
        </div>
        {rationale && <p className="text-xs text-brand-gold mt-1 ml-[8.75rem]">💡 {rationale}</p>}
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Menu &amp; coûts</h1>
        <p className="text-gray-500 text-sm mt-1">
          Téléverse ton catalogue, puis assigne un article à chaque palier de récompense. Ces données
          servent au calcul des cadeaux et ne sont jamais visibles côté client.
        </p>
      </div>

      {/* ── Upload ──────────────────────────────────────────────────────────── */}
      <div className="bg-white rounded-xl border border-gray-100 p-5 space-y-3">
        <div className="flex flex-wrap items-center gap-3">
          <label className="px-4 py-2 bg-brand-dark text-white rounded-lg text-sm font-semibold hover:opacity-90 cursor-pointer">
            {uploading ? "Import en cours…" : "Importer un CSV"}
            <input ref={fileRef} type="file" accept=".csv,text/csv" onChange={onFile} disabled={uploading} className="hidden" />
          </label>
          <button onClick={downloadTemplate} className="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg text-sm font-medium hover:bg-gray-200">
            Télécharger le modèle
          </button>
        </div>
        <p className="text-xs text-gray-400">
          Séparateur <code>;</code> ou <code>,</code>, virgule décimale acceptée (ex. <code>0,31</code>).
          Re-téléverser remplace le catalogue : les articles absents sont désactivés (jamais supprimés).
        </p>
      </div>

      {msg && (
        <div className={`rounded-xl p-3 text-sm border ${msg.kind === "ok" ? "bg-green-50 border-green-200 text-green-800" : "bg-red-50 border-red-200 text-red-700"}`}>
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
          {[1, 2, 3, 4].map((i) => <div key={i} className="bg-white rounded-xl h-12 animate-pulse border border-gray-100" />)}
        </div>
      ) : items.length === 0 ? (
        <div className="bg-white rounded-xl border border-dashed border-gray-200 p-8 text-center text-sm text-gray-500">
          Aucun article. Importe ton premier catalogue avec le bouton ci-dessus.
        </div>
      ) : (() => {
        // Marge unitaire (prix vente − prix revient) — top/flop parmi les
        // articles actifs réellement vendus (prix > 0 : les accompagnements
        // offerts, volontairement à 0 €, ne sont pas des « mauvais élèves »).
        const margin = (it: MenuItem) => Number(it.menu_price) - Number(it.cost_price);
        const priced = items.filter((i) => i.is_active && Number(i.menu_price) > 0);
        const sorted = [...priced].sort((a, b) => margin(b) - margin(a));
        const topIds = new Set(sorted.slice(0, 3).map((i) => i.id));
        const flopIds = new Set(sorted.length > 3 ? sorted.slice(-3).map((i) => i.id) : []);
        const best = sorted[0];
        const worst = sorted.length > 1 ? sorted[sorted.length - 1] : null;
        return (
          <>
            {best && worst && (
              <div className="grid grid-cols-2 gap-3">
                <div className="bg-green-50 border border-green-200 rounded-xl p-3">
                  <p className="text-xs text-green-700 font-semibold uppercase tracking-wide">💎 Marge la plus forte</p>
                  <p className="text-sm font-bold text-gray-900 mt-1 truncate">{best.name}</p>
                  <p className="text-xs text-green-700">{euro(margin(best))} de marge par vente</p>
                </div>
                <div className="bg-amber-50 border border-amber-200 rounded-xl p-3">
                  <p className="text-xs text-amber-700 font-semibold uppercase tracking-wide">⚠️ Marge la plus faible</p>
                  <p className="text-sm font-bold text-gray-900 mt-1 truncate">{worst.name}</p>
                  <p className="text-xs text-amber-700">{euro(margin(worst))} de marge par vente</p>
                </div>
              </div>
            )}
            {/* overflow-x-auto + min-w : la table 6 colonnes scrolle sur
                téléphone au lieu de s'écraser (audit 2026-07-23) */}
            <div className="bg-white rounded-xl border border-gray-100 overflow-x-auto">
              <table className="w-full min-w-[640px] text-sm">
                <thead className="bg-gray-50 text-gray-500 text-xs uppercase">
                  <tr>
                    <th className="text-left font-medium px-4 py-2.5">Article</th>
                    <th className="text-left font-medium px-4 py-2.5">Catégorie</th>
                    <th className="text-right font-medium px-4 py-2.5">Prix vente</th>
                    <th className="text-right font-medium px-4 py-2.5">Prix revient</th>
                    <th className="text-right font-medium px-4 py-2.5" title="Prix de vente − prix de revient">Marge</th>
                    <th className="text-right font-medium px-4 py-2.5" title="Valeur perçue par euro de coût">Ratio cadeau</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {items.map((it) => {
                    const ratio = it.cost_price > 0 ? it.menu_price / it.cost_price : 0;
                    const m = margin(it);
                    const isTop = topIds.has(it.id);
                    const isFlop = flopIds.has(it.id);
                    return (
                      <tr key={it.id} className={`${it.is_active ? "" : "opacity-50"} ${isTop ? "bg-green-50/60" : isFlop ? "bg-amber-50/60" : ""}`}>
                        <td className="px-4 py-2.5 font-medium text-gray-900">
                          {it.name}
                          {isTop && <span className="ml-2 text-xs bg-green-100 text-green-700 px-1.5 py-0.5 rounded-full">💎 top marge</span>}
                          {isFlop && <span className="ml-2 text-xs bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded-full">marge faible</span>}
                          {!it.is_active && <span className="ml-2 text-xs bg-red-100 text-red-700 px-1.5 py-0.5 rounded-full">inactif</span>}
                          {!it.reward_eligible && <span className="ml-2 text-xs bg-gray-100 text-gray-500 px-1.5 py-0.5 rounded-full">hors cadeau</span>}
                        </td>
                        <td className="px-4 py-2.5 text-gray-600">{it.category}</td>
                        <td className="px-4 py-2.5 text-right tabular-nums text-gray-700">{euro(it.menu_price)}</td>
                        <td className="px-4 py-2.5 text-right tabular-nums text-gray-700">{euro(it.cost_price)}</td>
                        <td className="px-4 py-2.5 text-right tabular-nums">
                          <span className={`font-semibold ${isTop ? "text-green-600" : isFlop ? "text-amber-600" : "text-gray-700"}`}>
                            {euro(m)}
                          </span>
                        </td>
                        <td className="px-4 py-2.5 text-right tabular-nums">
                          <span className={`font-semibold ${ratio >= 8 ? "text-green-600" : ratio >= 4 ? "text-amber-600" : "text-gray-400"}`}>
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
        <div className="bg-white rounded-xl border border-gray-100 p-5 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="font-bold text-gray-900">Paliers de récompense</h2>
              <p className="text-xs text-gray-500 mt-0.5">
                Assigne un article à chaque palier. L&apos;app peut te suggérer le meilleur choix.
              </p>
            </div>
            <div className="flex items-center gap-2">
              <button onClick={suggest} disabled={suggesting || giftItems.length === 0}
                className="px-3 py-2 bg-brand-gold/15 text-amber-800 border border-brand-gold/40 rounded-lg text-sm font-semibold hover:bg-brand-gold/25 disabled:opacity-50">
                {suggesting ? "Suggestion…" : "✨ Suggérer avec l'IA"}
              </button>
              <button onClick={saveTiers} disabled={savingTiers}
                className="px-3 py-2 bg-brand-dark text-white rounded-lg text-sm font-semibold hover:opacity-90 disabled:opacity-50">
                {savingTiers ? "Enregistrement…" : "Enregistrer les paliers"}
              </button>
            </div>
          </div>

          {tierMsg && (
            <div className={`rounded-lg p-2.5 text-sm border ${tierMsg.kind === "ok" ? "bg-green-50 border-green-200 text-green-800" : "bg-red-50 border-red-200 text-red-700"}`}>
              <p>{tierMsg.text}</p>
              {tierMsg.details && tierMsg.details.length > 0 && (
                <ul className="mt-1 list-disc list-inside text-xs opacity-80">
                  {tierMsg.details.slice(0, 8).map((d, i) => <li key={i}>{d}</li>)}
                </ul>
              )}
            </div>
          )}

          <div className="grid md:grid-cols-2 gap-5">
            <div>
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Récompense solo (montant de commande)</p>
              <div className="divide-y divide-gray-50">
                {soloBands.map((b) => bandRow("solo", b, `Commande ≥ ${b} €`))}
              </div>
            </div>
            <div>
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Bonus communautaire (score d&apos;équipe)</p>
              <div className="divide-y divide-gray-50">
                {COMMUNITY_BANDS.map((b) => bandRow("community", b, `Score ≥ ${b.toLocaleString("fr-BE")} pts`))}
              </div>
            </div>
          </div>

          <p className="text-xs text-gray-400">
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
    const body = await res.json();
    if (res.ok) {
      setMsg({ kind: "ok", text: "Cadeau des jetons enregistré." });
      await load();
    } else {
      setMsg({ kind: "err", text: body.error ?? "Échec de l'enregistrement." });
    }
    setSaving(false);
  }

  if (!info) {
    return <div className="bg-white rounded-xl h-24 animate-pulse border border-gray-100" />;
  }

  const affordable = items.filter(
    (i) => i.is_active && i.reward_eligible && Number(i.cost_price) <= info.costCap
  );

  return (
    <div className="bg-white rounded-xl border border-gray-100 p-5 space-y-3">
      <div>
        <h2 className="font-bold text-gray-900">Cadeau des 4 jetons</h2>
        <p className="text-xs text-gray-500 mt-0.5">
          Remis pour 4 jetons (actions sociales / parrainages) — aucun achat en face, donc coût réel
          plafonné à {euro(info.costCap)} ({euro(info.avgBasket)} de panier moyen × budget cadeaux).
        </p>
      </div>

      <div className="flex items-center gap-2 text-sm">
        <span className="text-gray-500">Cadeau actuel :</span>
        <span className="font-semibold text-gray-900">{info.current.name}</span>
        <span className="text-xs text-gray-400">(coût {euro(info.current.cost)})</span>
      </div>

      {info.suggestion && info.suggestion.id !== info.current.id && (
        <div className="bg-brand-gold/10 border border-brand-gold/30 rounded-lg p-3 flex flex-wrap items-center justify-between gap-2">
          <p className="text-xs text-amber-800">
            💡 Suggestion : <span className="font-semibold">{info.suggestion.name}</span> — perçu à{" "}
            {euro(info.suggestion.menu_price)} pour {euro(info.suggestion.cost_price)} de coût réel
            (ratio ×{(info.suggestion.menu_price / info.suggestion.cost_price).toFixed(1)}).
          </p>
          <button
            onClick={() => save(info.suggestion!.id)}
            disabled={saving}
            className="text-xs px-3 py-1.5 bg-brand-gold/20 text-amber-800 border border-brand-gold/40 rounded-lg font-semibold hover:bg-brand-gold/30 disabled:opacity-50"
          >
            Appliquer
          </button>
        </div>
      )}

      <div className="flex items-center gap-2">
        <select
          value={selected}
          onChange={(e) => setSelected(e.target.value)}
          className="flex-1 border border-gray-200 rounded-lg px-3 py-2 text-sm bg-white"
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
        <div className={`rounded-lg p-2.5 text-sm border ${msg.kind === "ok" ? "bg-green-50 border-green-200 text-green-800" : "bg-red-50 border-red-200 text-red-700"}`}>
          {msg.text}
        </div>
      )}
    </div>
  );
}
