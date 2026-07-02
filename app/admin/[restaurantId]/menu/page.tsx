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
type TierRow = { layer: string; min_threshold: number; menu_item_id: string | null };
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
  const [suggesting, setSuggesting] = useState(false);
  const [savingTiers, setSavingTiers] = useState(false);
  const [tierMsg, setTierMsg] = useState<Msg | null>(null);

  const loadAll = useCallback(async () => {
    const [itemsRes, tiersRes] = await Promise.all([
      fetch(`/api/admin/menu?restaurantId=${restaurantId}`),
      fetch(`/api/admin/reward-tiers?restaurantId=${restaurantId}`),
    ]);
    const itemsData: MenuItem[] = itemsRes.ok ? await itemsRes.json() : [];
    const tiersData: TierRow[] = tiersRes.ok ? await tiersRes.json() : [];
    setItems(itemsData);

    const map: Record<string, string | null> = {};
    SOLO_BANDS.forEach((b) => { map[tierKey("solo", b)] = null; });
    COMMUNITY_BANDS.forEach((b) => { map[tierKey("community", b)] = null; });
    tiersData.forEach((t) => { map[tierKey(t.layer, t.min_threshold)] = t.menu_item_id; });
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
      setMsg({ kind: "ok", text: `${body.upserted} article(s) importé(s), ${body.deactivated} désactivé(s).`, details: body.warnings });
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
      const nextTiers = { ...tiers };
      const nextRationales: Record<string, string> = {};
      (body.suggestions as Suggestion[]).forEach((s) => {
        const item = items.find((i) => i.name === s.item_name);
        const key = tierKey(s.layer, s.threshold);
        if (item) nextTiers[key] = item.id;
        if (s.rationale) nextRationales[key] = s.rationale;
      });
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
      setTierMsg({ kind: "err", text: body.error ?? "Échec de l'enregistrement." });
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
      ) : (
        <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-gray-500 text-xs uppercase">
              <tr>
                <th className="text-left font-medium px-4 py-2.5">Article</th>
                <th className="text-left font-medium px-4 py-2.5">Catégorie</th>
                <th className="text-right font-medium px-4 py-2.5">Prix vente</th>
                <th className="text-right font-medium px-4 py-2.5">Prix revient</th>
                <th className="text-right font-medium px-4 py-2.5" title="Valeur perçue par euro de coût">Ratio cadeau</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {items.map((it) => {
                const ratio = it.cost_price > 0 ? it.menu_price / it.cost_price : 0;
                return (
                  <tr key={it.id} className={it.is_active ? "" : "opacity-50"}>
                    <td className="px-4 py-2.5 font-medium text-gray-900">
                      {it.name}
                      {!it.is_active && <span className="ml-2 text-xs bg-red-100 text-red-700 px-1.5 py-0.5 rounded-full">inactif</span>}
                      {!it.reward_eligible && <span className="ml-2 text-xs bg-gray-100 text-gray-500 px-1.5 py-0.5 rounded-full">hors cadeau</span>}
                    </td>
                    <td className="px-4 py-2.5 text-gray-600">{it.category}</td>
                    <td className="px-4 py-2.5 text-right tabular-nums text-gray-700">{euro(it.menu_price)}</td>
                    <td className="px-4 py-2.5 text-right tabular-nums text-gray-700">{euro(it.cost_price)}</td>
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
      )}

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
              {tierMsg.text}
            </div>
          )}

          <div className="grid md:grid-cols-2 gap-5">
            <div>
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Récompense solo (montant de commande)</p>
              <div className="divide-y divide-gray-50">
                {SOLO_BANDS.map((b) => bandRow("solo", b, `Commande ≥ ${b} €`))}
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
    </div>
  );
}
