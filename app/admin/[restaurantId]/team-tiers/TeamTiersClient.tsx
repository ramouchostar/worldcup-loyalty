"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import type { MenuItem } from "@/types";
import { readJsonSafe, describeHttpFailure } from "@/lib/fetch-json";
import { PageHeader } from "@/components/admin/ui";

type RewardKind = "percent" | "free_item";
type TierForm = { threshold_spent: string; reward_kind: RewardKind; percent_value: string; menu_item_id: string };
type TierRow = { threshold_spent: number; reward_kind: RewardKind; percent_value: number | null; menu_item_id: string | null };
type Msg = { kind: "ok" | "err"; text: string };

export function TeamTiersClient() {
  const { restaurantId } = useParams<{ restaurantId: string }>();
  const [tiers, setTiers] = useState<TierForm[]>([]);
  const [items, setItems] = useState<MenuItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<Msg | null>(null);

  async function load() {
    const [tRes, mRes] = await Promise.all([
      fetch(`/api/admin/team-tiers?restaurantId=${restaurantId}`),
      fetch(`/api/admin/menu?restaurantId=${restaurantId}`),
    ]);
    const tData: TierRow[] = tRes.ok ? await tRes.json() : [];
    const mData: MenuItem[] = mRes.ok ? await mRes.json() : [];
    setItems(mData);
    setTiers(
      tData.map((t) => ({
        threshold_spent: String(t.threshold_spent),
        reward_kind: t.reward_kind,
        percent_value: t.percent_value != null ? String(t.percent_value) : "",
        menu_item_id: t.menu_item_id ?? "",
      }))
    );
    setLoading(false);
  }

  useEffect(() => { load(); }, [restaurantId]);

  const giftItems = items.filter((i) => i.is_active && i.reward_eligible);

  function update(i: number, patch: Partial<TierForm>) {
    setTiers((prev) => prev.map((t, idx) => (idx === i ? { ...t, ...patch } : t)));
  }
  function addRow() {
    setTiers((prev) => [...prev, { threshold_spent: "", reward_kind: "free_item", percent_value: "", menu_item_id: "" }]);
  }
  function removeRow(i: number) {
    setTiers((prev) => prev.filter((_, idx) => idx !== i));
  }

  async function save() {
    setSaving(true);
    setMsg(null);
    const payload = tiers.map((t) => ({
      threshold_spent: Number(t.threshold_spent),
      reward_kind: t.reward_kind,
      percent_value: t.reward_kind === "percent" ? Number(t.percent_value) : null,
      menu_item_id: t.reward_kind === "free_item" ? t.menu_item_id || null : null,
    }));
    const res = await fetch("/api/admin/team-tiers", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ restaurantId, tiers: payload }),
    });
    const { data: body } = await readJsonSafe<{ saved?: number; error?: string }>(res);
    if (res.ok) {
      setMsg({ kind: "ok", text: `Paliers enregistrés (${body?.saved ?? 0}).` });
      await load();
    } else {
      setMsg({ kind: "err", text: describeHttpFailure(res.status, body?.error) });
    }
    setSaving(false);
  }

  return (
    <div className="space-y-5">
      <PageHeader
        title={<>Paliers d&apos;équipe</>}
        subtitle={<>Quand la dépense cumulée d&apos;une équipe atteint un seuil, tous ses membres débloquent la
          récompense. Le pourcentage s&apos;applique de façon bornée (prochaine commande). Ces seuils en
          euros ne sont jamais visibles côté client.</>}
      />

      <div className="bg-warn/10 border border-warn/30 rounded-xl p-4 text-sm text-warn">
        Rétro-financé : grâce au plafond de budget cadeaux, le restaurant a déjà encaissé la marge avant
        que la récompense ne parte.
      </div>

      {msg && (
        <div className={`rounded-xl p-3 text-sm border ${msg.kind === "ok" ? "bg-good/10 border-good/30 text-good" : "bg-danger/10 border-danger/30 text-danger"}`}>
          {msg.text}
        </div>
      )}

      {loading ? (
        <div className="space-y-2">
          {[1, 2, 3].map((i) => <div key={i} className="bg-white rounded-xl h-16 animate-pulse border border-paper-border" />)}
        </div>
      ) : (
        <div className="space-y-3">
          {tiers.length === 0 && (
            <div className="bg-white rounded-xl border border-dashed border-paper-border p-6 text-center text-sm text-ink-muted">
              Aucun palier. Ajoute-en un ci-dessous.
            </div>
          )}

          {tiers.map((t, i) => (
            <div key={i} className="bg-white rounded-xl border border-paper-border p-4 flex flex-wrap items-end gap-3">
              <div>
                <label className="text-xs text-ink-muted mb-1 block">Dépense cumulée (€)</label>
                <input
                  type="number"
                  min={0}
                  value={t.threshold_spent}
                  onChange={(e) => update(i, { threshold_spent: e.target.value })}
                  className="w-32 border border-paper-border rounded-lg px-3 py-2 text-sm"
                />
              </div>

              <div>
                <label className="text-xs text-ink-muted mb-1 block">Récompense</label>
                <select
                  value={t.reward_kind}
                  onChange={(e) => update(i, { reward_kind: e.target.value as RewardKind })}
                  className="border border-paper-border rounded-lg px-3 py-2 text-sm bg-white"
                >
                  <option value="free_item">Article gratuit</option>
                  <option value="percent">Pourcentage</option>
                </select>
              </div>

              {t.reward_kind === "percent" ? (
                <div>
                  <label className="text-xs text-ink-muted mb-1 block">Remise (%)</label>
                  <input
                    type="number"
                    min={1}
                    max={100}
                    value={t.percent_value}
                    onChange={(e) => update(i, { percent_value: e.target.value })}
                    className="w-24 border border-paper-border rounded-lg px-3 py-2 text-sm"
                  />
                </div>
              ) : (
                <div className="flex-1 min-w-[12rem]">
                  <label className="text-xs text-ink-muted mb-1 block">Article offert</label>
                  <select
                    value={t.menu_item_id}
                    onChange={(e) => update(i, { menu_item_id: e.target.value })}
                    className="w-full border border-paper-border rounded-lg px-3 py-2 text-sm bg-white"
                  >
                    <option value="">— choisir —</option>
                    {giftItems.map((it) => (
                      <option key={it.id} value={it.id}>{it.name}</option>
                    ))}
                  </select>
                </div>
              )}

              <button
                onClick={() => removeRow(i)}
                className="px-3 py-2 text-xs text-danger hover:bg-danger/10 rounded-lg font-medium"
              >
                Supprimer
              </button>
            </div>
          ))}

          <div className="flex items-center gap-3">
            <button onClick={addRow} className="px-4 py-2 bg-paper-subtle text-ink-body rounded-lg text-sm font-medium hover:bg-paper-border">
              + Ajouter un palier
            </button>
            <button
              onClick={save}
              disabled={saving}
              className="px-4 py-2 bg-brand-dark text-white rounded-lg text-sm font-semibold hover:opacity-90 disabled:opacity-50"
            >
              {saving ? "Enregistrement…" : "Enregistrer"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
