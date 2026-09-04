"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { useParams } from "next/navigation";

type AdminOrder = {
  id: string;
  user_id: string;
  amount: number;
  order_date: string;
  order_time: string;
  order_number: string | null;
  receipt_url: string | null;
  ocr_amount: number | null;
  ocr_confidence: number | null;
  flag_reasons: string[];
  status: string;
  rejection_reason: string | null;
  submitted_at: string;
  validated_at: string | null;
  profiles: { display_name: string; email: string } | null;
  teams: { name: string; flag_emoji: string } | null;
};

const STATUS_FILTER = ["flagged", "pending", "validated", "rejected", "all"] as const;
type Filter = (typeof STATUS_FILTER)[number];

const REJECT_REASONS = [
  "Ticket illisible ou photo floue",
  "Montant ne correspond pas au ticket",
  "Numéro de commande invalide ou déjà utilisé",
  "Commande déjà soumise (doublon)",
  "Ce ticket ne vient pas de cet établissement",
  "Autre (préciser ci-dessous)",
];

const FLAG_LABELS: Record<string, { label: string; color: string }> = {
  high_amount:            { label: "> €200",         color: "bg-orange-100 text-orange-800" },
  low_confidence:         { label: "OCR < 70%",      color: "bg-red-100 text-red-800" },
  unreadable_bestelnummer:{ label: "N° illisible",   color: "bg-red-100 text-red-800" },
  amount_mismatch:        { label: "Écart > 5%",     color: "bg-red-100 text-red-800" },
  no_restaurant_header:   { label: "Hors restaurant",color: "bg-purple-100 text-purple-800" },
  too_many_today:         { label: "3+/jour",        color: "bg-amber-100 text-amber-800" },
  // ADR 0019 : no_order_key remplace no_bestelnummer — les deux restent
  // mappés pour les commandes historiques.
  no_order_key:           { label: "Sans n° de ticket", color: "bg-red-100 text-red-800" },
  no_bestelnummer:        { label: "Sans n° de ticket", color: "bg-red-100 text-red-800" },
  no_receipt:             { label: "Sans photo",     color: "bg-red-100 text-red-800" },
  ocr_failed:             { label: "OCR en échec",   color: "bg-red-100 text-red-800" },
  // Phase C — empreinte proche d'un ticket déjà en base sans certitude : ni
  // crédité, ni rejeté. Les deux tickets sont à comparer côte à côte.
  duplicate_review:       { label: "Doublon possible", color: "bg-fuchsia-100 text-fuchsia-800" },
};

function waitHours(submitted_at: string): number {
  return (Date.now() - new Date(submitted_at).getTime()) / 3_600_000;
}

// ── Photo modal ──────────────────────────────────────────────
function PhotoModal({ url, onClose }: { url: string; onClose: () => void }) {
  return (
    <div
      className="fixed inset-0 z-50 bg-black/90 flex items-center justify-center"
      onClick={onClose}
    >
      <button
        className="absolute top-4 right-4 text-white text-3xl font-light leading-none"
        onClick={onClose}
      >
        ×
      </button>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={url}
        alt="Ticket de caisse"
        className="max-w-full max-h-full object-contain"
        onClick={(e) => e.stopPropagation()}
      />
    </div>
  );
}

// ── Swipe card ───────────────────────────────────────────────
function SwipeCard({
  order,
  selected,
  batchMode,
  onToggleSelect,
  onValidate,
  onReject,
  onPhotoOpen,
  busy,
}: {
  order: AdminOrder;
  selected: boolean;
  batchMode: boolean;
  onToggleSelect: () => void;
  onValidate: () => void;
  onReject: () => void;
  onPhotoOpen: () => void;
  busy: boolean;
}) {
  const cardRef = useRef<HTMLDivElement>(null);
  const startXRef = useRef(0);
  const hoursOld = waitHours(order.submitted_at);
  const overSLA = hoursOld > 2;
  const flags = order.flag_reasons ?? [];

  function onTouchStart(e: React.TouchEvent) {
    if (order.status !== "pending") return;
    startXRef.current = e.touches[0].clientX;
  }

  function onTouchMove(e: React.TouchEvent) {
    if (order.status !== "pending" || !cardRef.current) return;
    const delta = e.touches[0].clientX - startXRef.current;
    cardRef.current.style.transform = `translateX(${delta}px)`;
    if (delta > 40) cardRef.current.style.background = "#f0fdf4";
    else if (delta < -40) cardRef.current.style.background = "#fef2f2";
    else cardRef.current.style.background = "";
  }

  function onTouchEnd(e: React.TouchEvent) {
    if (order.status !== "pending" || !cardRef.current) return;
    const delta = e.changedTouches[0].clientX - startXRef.current;
    cardRef.current.style.transition = "transform 0.15s ease-out, background 0.15s";
    cardRef.current.style.transform = "";
    cardRef.current.style.background = "";
    setTimeout(() => { if (cardRef.current) cardRef.current.style.transition = ""; }, 160);
    if (delta > 80) onValidate();
    else if (delta < -80) onReject();
  }

  const borderColor =
    order.status === "validated" ? "border-green-200" :
    order.status === "rejected"  ? "border-red-200"   :
    overSLA                      ? "border-red-400"   : "border-amber-200";

  return (
    <div
      ref={cardRef}
      className={`bg-white rounded-xl border-2 p-4 select-none ${borderColor} ${selected ? "ring-2 ring-blue-400" : ""}`}
      onTouchStart={onTouchStart}
      onTouchMove={onTouchMove}
      onTouchEnd={onTouchEnd}
    >
      {/* Header row */}
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-start gap-2 min-w-0">
          {/* Batch checkbox */}
          {batchMode && order.status === "pending" && (
            <input
              type="checkbox"
              checked={selected}
              onChange={onToggleSelect}
              className="mt-0.5 shrink-0 h-4 w-4 accent-blue-600"
            />
          )}
          <div className="min-w-0">
            {/* Member */}
            <div className="flex items-center gap-1.5 flex-wrap">
              {/* ADR 0034 — un membre sans équipe envoie ses tickets comme les autres */}
              <span className="text-base shrink-0" title={order.teams?.name ?? "Sans équipe"}>
                {order.teams?.flag_emoji ?? "👤"}
              </span>
              <span className="font-semibold text-gray-900 text-sm">
                {order.profiles?.display_name ?? "—"}
              </span>
              <span className="text-xs text-gray-400 truncate">{order.profiles?.email}</span>
            </div>

            {/* Amount row */}
            <div className="flex items-baseline gap-2 mt-0.5">
              <p className="text-xl font-black text-gray-900">
                {Number(order.amount).toLocaleString("fr-BE", { style: "currency", currency: "EUR" })}
              </p>
              {order.ocr_amount !== null && (
                <p className={`text-xs font-medium ${
                  Math.abs(order.ocr_amount - order.amount) / order.amount > 0.05
                    ? "text-red-600"
                    : "text-gray-500"
                }`}>
                  OCR {Number(order.ocr_amount).toLocaleString("fr-BE", { style: "currency", currency: "EUR" })}
                </p>
              )}
              {order.ocr_confidence !== null && (
                <p className={`text-xs font-medium ${order.ocr_confidence < 70 ? "text-red-600" : "text-gray-400"}`}>
                  {order.ocr_confidence}%
                </p>
              )}
            </div>

            {/* Order number + date */}
            <p className="text-xs text-gray-500 mt-0.5">
              {order.order_number
                ? <span className="font-mono text-gray-700">{order.order_number}</span>
                : <span className="italic text-gray-400">N° non extrait</span>
              }
              {" · "}
              {new Date(order.order_date + "T00:00:00Z").toLocaleDateString("fr-BE", { timeZone: "UTC" })}
              {" · "}
              {new Date(order.submitted_at).toLocaleTimeString("fr-BE", { hour: "2-digit", minute: "2-digit" })}
            </p>

            {/* SLA + flags */}
            <div className="flex flex-wrap gap-1 mt-1.5">
              {order.status === "pending" && overSLA && (
                <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-red-100 text-red-700">
                  ⏱ {Math.floor(hoursOld)}h d&apos;attente
                </span>
              )}
              {flags.map(flag => {
                const meta = FLAG_LABELS[flag];
                return meta ? (
                  <span key={flag} className={`text-xs font-semibold px-2 py-0.5 rounded-full ${meta.color}`}>
                    {meta.label}
                  </span>
                ) : null;
              })}
              {order.rejection_reason && (
                <span className="text-xs text-red-600 mt-0.5 w-full">Rejet : {order.rejection_reason}</span>
              )}
            </div>
          </div>
        </div>

        {/* Right column: photo + status/actions */}
        <div className="flex flex-col items-end gap-2 shrink-0">
          {/* Receipt photo */}
          {order.receipt_url && (
            <button
              onClick={onPhotoOpen}
              className="w-12 h-16 rounded-lg overflow-hidden border border-gray-200 shrink-0 bg-gray-50"
              title="Voir le ticket"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={order.receipt_url} alt="Ticket" className="w-full h-full object-cover" />
            </button>
          )}

          {/* Status badge or action buttons */}
          {order.status !== "pending" ? (
            <span className={`text-xs font-bold px-2.5 py-1 rounded-full ${
              order.status === "validated"
                ? "bg-green-100 text-green-800"
                : "bg-red-100 text-red-800"
            }`}>
              {order.status === "validated" ? "Validée ✓" : "Rejetée"}
            </span>
          ) : !batchMode ? (
            <div className="flex flex-col gap-1.5">
              <button
                onClick={onValidate}
                disabled={busy}
                className="px-3 py-1.5 bg-green-600 text-white rounded-lg text-xs font-semibold hover:bg-green-700 disabled:opacity-50 whitespace-nowrap"
              >
                {busy ? "…" : "✓ Valider"}
              </button>
              <button
                onClick={onReject}
                disabled={busy}
                className="px-3 py-1.5 bg-red-100 text-red-700 rounded-lg text-xs font-semibold hover:bg-red-200 disabled:opacity-50"
              >
                ✕ Rejeter
              </button>
            </div>
          ) : null}
        </div>
      </div>

      {/* Swipe hint (mobile, pending only) */}
      {order.status === "pending" && !batchMode && (
        <p className="text-center text-xs text-gray-300 mt-2 md:hidden">
          ← rejeter · glisser · valider →
        </p>
      )}
    </div>
  );
}

// ── Main page ────────────────────────────────────────────────
export default function AdminOrdersPage() {
  const { restaurantId } = useParams<{ restaurantId: string }>();
  const [orders, setOrders]       = useState<AdminOrder[]>([]);
  const [loading, setLoading]     = useState(true);
  const [filter, setFilter]       = useState<Filter>("flagged");
  const [rejectId, setRejectId]   = useState<string | null>(null);
  const [rejectPreset, setRejectPreset] = useState("");
  const [rejectFree, setRejectFree]    = useState("");
  const [busy, setBusy]           = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [batchMode, setBatchMode] = useState(false);
  const [selected, setSelected]   = useState<Set<string>>(new Set());
  const [batchBusy, setBatchBusy] = useState(false);
  const [photoUrl, setPhotoUrl]   = useState<string | null>(null);

  const fetchOrders = useCallback(async () => {
    const res = await fetch(`/api/admin/orders?restaurantId=${restaurantId}`);
    if (res.ok) setOrders(await res.json());
    setLoading(false);
  }, [restaurantId]);

  useEffect(() => {
    fetchOrders();
    const interval = setInterval(fetchOrders, 30_000);
    return () => clearInterval(interval);
  }, [fetchOrders]);

  // Filtre initial via ?filter=… (cartes du dashboard admin) — lu via
  // window.location comme sur la page Broadcasts (compatible prérendu).
  useEffect(() => {
    const f = new URLSearchParams(window.location.search).get("filter");
    if (f && (STATUS_FILTER as readonly string[]).includes(f)) setFilter(f as Filter);
  }, []);

  async function handleAction(id: string, action: "validate" | "reject", reason?: string) {
    setBusy(id);
    setActionError(null);
    // Une erreur serveur avalée = le restaurateur croit avoir validé une
    // commande qui ne l'est pas (audit 2026-07-23) — toujours vérifier res.ok.
    const res = await fetch("/api/admin/orders", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, action, rejection_reason: reason, restaurantId }),
    }).catch(() => null);
    if (!res?.ok) {
      const body = await res?.json().catch(() => null);
      setActionError(body?.error ?? `Échec de l'action « ${action === "validate" ? "valider" : "rejeter"} » — la commande n'a PAS été traitée. Réessaie.`);
    } else {
      setRejectId(null);
      setRejectPreset("");
      setRejectFree("");
    }
    await fetchOrders();
    setBusy(null);
  }

  async function handleBatchValidate() {
    if (selected.size === 0) return;
    setBatchBusy(true);
    setActionError(null);
    const res = await fetch("/api/admin/orders", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ids: Array.from(selected), action: "batch_validate", restaurantId }),
    }).catch(() => null);
    if (!res?.ok) {
      const body = await res?.json().catch(() => null);
      setActionError(body?.error ?? "Échec de la validation groupée — aucune commande n'a été traitée. Réessaie.");
    } else {
      setSelected(new Set());
      setBatchMode(false);
    }
    await fetchOrders();
    setBatchBusy(false);
  }

  function toggleSelect(id: string) {
    setSelected(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  const rejectReason = rejectPreset === "Autre (préciser ci-dessous)"
    ? rejectFree
    : rejectPreset || rejectFree;

  const isFlagged = (o: AdminOrder) => Array.isArray(o.flag_reasons) && o.flag_reasons.length > 0;

  // Sort pending/flagged by age (oldest first), others by recency (newest first)
  const filtered = orders
    .filter(o => {
      if (filter === "all")     return true;
      if (filter === "flagged") return isFlagged(o) && o.status === "pending";
      return o.status === filter;
    })
    .sort((a, b) => {
      if (filter === "pending" || filter === "flagged" ||
         (filter === "all" && a.status === "pending" && b.status === "pending")) {
        return new Date(a.submitted_at).getTime() - new Date(b.submitted_at).getTime();
      }
      return new Date(b.submitted_at).getTime() - new Date(a.submitted_at).getTime();
    });

  const counts = {
    flagged:   orders.filter(o => isFlagged(o) && o.status === "pending").length,
    pending:   orders.filter(o => o.status === "pending").length,
    validated: orders.filter(o => o.status === "validated").length,
    rejected:  orders.filter(o => o.status === "rejected").length,
    all:       orders.length,
  };

  const pendingOverSLA = orders.filter(o => o.status === "pending" && waitHours(o.submitted_at) > 2).length;

  return (
    <div className="space-y-4">
      {actionError && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-3 text-sm text-red-700 flex items-start justify-between gap-2">
          <span>⚠️ {actionError}</span>
          <button onClick={() => setActionError(null)} className="text-red-400 hover:text-red-700 shrink-0" aria-label="Fermer">✕</button>
        </div>
      )}
      {/* Header */}
      <div className="flex items-start justify-between gap-2">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Commandes suspectes</h1>
          <p className="text-gray-500 text-sm mt-0.5">
            Glisser droite = valider · Glisser gauche = rejeter
          </p>
        </div>
        {counts.pending > 0 && (
          <div className="flex gap-2 shrink-0">
            {batchMode && (
              <button
                onClick={() => {
                  const pendingIds = filtered
                    .filter(o => o.status === "pending")
                    .map(o => o.id);
                  setSelected(prev =>
                    prev.size === pendingIds.length
                      ? new Set()
                      : new Set(pendingIds)
                  );
                }}
                className="text-xs font-semibold px-3 py-2 rounded-lg border bg-white text-gray-700 border-gray-200 hover:border-gray-400 transition-colors"
              >
                Tout sélectionner
              </button>
            )}
            <button
              onClick={() => { setBatchMode(b => !b); setSelected(new Set()); }}
              className={`text-xs font-semibold px-3 py-2 rounded-lg border transition-colors ${
                batchMode
                  ? "bg-blue-600 text-white border-blue-600"
                  : "bg-white text-gray-700 border-gray-200 hover:border-gray-400"
              }`}
            >
              {batchMode ? "Annuler" : "Sélection"}
            </button>
          </div>
        )}
      </div>

      {/* SLA alert */}
      {pendingOverSLA > 0 && (
        <div className="bg-red-50 border border-red-300 rounded-xl p-3 flex items-center gap-2">
          <span className="text-lg">⏱</span>
          <p className="text-red-800 text-sm font-semibold">
            {pendingOverSLA} commande{pendingOverSLA > 1 ? "s" : ""} en attente depuis plus de 2h
          </p>
        </div>
      )}

      {/* Filters */}
      <div className="flex gap-2 flex-wrap">
        {STATUS_FILTER.map(f => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
              filter === f
                ? f === "flagged" ? "bg-red-600 text-white" : "bg-brand-dark text-white"
                : f === "flagged" && counts.flagged > 0
                  ? "bg-red-50 text-red-700 border border-red-300 hover:border-red-500"
                  : "bg-white text-gray-600 border border-gray-200 hover:border-gray-400"
            }`}
          >
            {f === "flagged" ? "🚩 Suspectes" :
             f === "all" ? "Toutes" :
             f === "pending" ? "En attente" :
             f === "validated" ? "Validées" : "Rejetées"}
            <span className="ml-1.5 opacity-60">({counts[f]})</span>
          </button>
        ))}
      </div>

      {/* Order list */}
      {loading ? (
        <div className="space-y-3">
          {[1, 2, 3].map(i => (
            <div key={i} className="bg-white rounded-xl h-28 animate-pulse border border-gray-100" />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-100 p-8 text-center">
          <p className="text-gray-400">Aucune commande dans cette catégorie.</p>
          <p className="text-xs text-gray-400 mt-1 max-w-sm mx-auto">
            Les tickets signalés (montant élevé, OCR incertain…) arrivent ici pour
            revue — les commandes normales se valident toutes seules.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map(order => (
            <div key={order.id}>
              <SwipeCard
                order={order}
                selected={selected.has(order.id)}
                batchMode={batchMode}
                onToggleSelect={() => toggleSelect(order.id)}
                onValidate={() => handleAction(order.id, "validate")}
                onReject={() => { setRejectId(order.id); setRejectPreset(""); setRejectFree(""); }}
                onPhotoOpen={() => order.receipt_url && setPhotoUrl(order.receipt_url)}
                busy={busy === order.id}
              />

              {/* Reject form */}
              {rejectId === order.id && (
                <div className="mt-2 bg-red-50 border border-red-200 rounded-xl p-4 space-y-3">
                  <p className="text-sm font-semibold text-red-900">Motif du rejet</p>
                  <select
                    value={rejectPreset}
                    onChange={e => setRejectPreset(e.target.value)}
                    className="w-full px-3 py-2 border border-red-200 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-red-400"
                  >
                    <option value="">Choisir un motif…</option>
                    {REJECT_REASONS.map(r => (
                      <option key={r} value={r}>{r}</option>
                    ))}
                  </select>
                  {(rejectPreset === "Autre (préciser ci-dessous)" || !rejectPreset) && (
                    <input
                      type="text"
                      value={rejectFree}
                      onChange={e => setRejectFree(e.target.value)}
                      placeholder="Préciser le motif…"
                      className="w-full px-3 py-2 border border-red-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-red-400"
                    />
                  )}
                  <div className="flex gap-2">
                    <button
                      onClick={() => handleAction(order.id, "reject", rejectReason)}
                      disabled={!rejectReason.trim() || busy === order.id}
                      className="flex-1 px-4 py-2 bg-red-600 text-white rounded-lg text-sm font-semibold disabled:opacity-50 hover:bg-red-700"
                    >
                      {busy === order.id ? "…" : "Confirmer le rejet"}
                    </button>
                    <button
                      onClick={() => setRejectId(null)}
                      className="px-4 py-2 border border-gray-200 rounded-lg text-sm text-gray-600 hover:bg-gray-50"
                    >
                      Annuler
                    </button>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Batch action bar */}
      {batchMode && selected.size > 0 && (
        <div className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 shadow-xl p-4 flex gap-3 z-40 safe-bottom">
          <button
            onClick={handleBatchValidate}
            disabled={batchBusy}
            className="flex-1 py-3 bg-green-600 text-white rounded-xl font-semibold text-sm hover:bg-green-700 disabled:opacity-50"
          >
            {batchBusy ? "Validation…" : `✓ Valider ${selected.size} commande${selected.size > 1 ? "s" : ""}`}
          </button>
          <button
            onClick={() => { setSelected(new Set()); setBatchMode(false); }}
            className="px-5 py-3 border border-gray-200 rounded-xl text-sm text-gray-600 hover:bg-gray-50"
          >
            Annuler
          </button>
        </div>
      )}

      {/* Photo modal */}
      {photoUrl && <PhotoModal url={photoUrl} onClose={() => setPhotoUrl(null)} />}
    </div>
  );
}
