"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { TriangleAlert, X } from "lucide-react";
import { useParams } from "next/navigation";
import { PageHeader, FilterTabs, StatusBadge } from "@/components/admin/ui";
import { DuplicateReviews } from "@/components/admin/DuplicateReviews";

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

// ADR 0052 — « Doublons » est un onglet de cette barre, plus une page à part :
// le même ticket y apparaissait deux fois (ici avec le badge « Doublon
// possible », et sur sa propre page), et le valider depuis ici contournait la
// comparaison côte à côte en laissant la ligne `duplicate_reviews` en attente.
const STATUS_FILTER = ["flagged", "duplicates", "pending", "validated", "rejected", "all"] as const;
type Filter = (typeof STATUS_FILTER)[number];

const REJECT_REASONS = [
  "Ticket illisible ou photo floue",
  "Montant ne correspond pas au ticket",
  "Numéro de commande invalide ou déjà utilisé",
  "Commande déjà soumise (doublon)",
  "Ce ticket ne vient pas de cet établissement",
  "Autre (préciser ci-dessous)",
];

// Motifs de signalement — des ÉTIQUETTES DESCRIPTIVES, pas cinq niveaux
// d'alerte. Elles portaient six couleurs (rouge, orange, ambre, violet,
// fuchsia…) qui ne disaient rien de plus : la carte est déjà bordée selon son
// statut (validée / rejetée / hors SLA / en attente), et un ticket qui affiche
// une étiquette est de toute façon à regarder. Une seule teinte neutre, et le
// regard va là où il doit — la bordure et le délai d'attente.
const FLAG_LABELS: Record<string, string> = {
  high_amount:             "> €200",
  low_confidence:          "OCR < 70%",
  unreadable_bestelnummer: "N° illisible",
  amount_mismatch:         "Écart > 5%",
  no_restaurant_header:    "Hors restaurant",
  too_many_today:          "3+/jour",
  frequent_submitter:      "Envois fréquents (6+/7 j)",
  // ADR 0019 : no_order_key remplace no_bestelnummer — les deux restent
  // mappés pour les commandes historiques.
  no_order_key:            "Sans n° de ticket",
  no_bestelnummer:         "Sans n° de ticket",
  no_receipt:              "Sans photo",
  ocr_failed:              "OCR en échec",
  // ADR 0052 — empreinte proche d'un ticket déjà en base sans certitude : ni
  // crédité, ni rejeté. Les deux tickets sont à comparer côte à côte.
  duplicate_review:        "Doublon possible",
  // La photo ressemble à une affiche/QR du programme, pas à un ticket — mais
  // un numéro a été tapé à la main : à vérifier sur l'image.
  looks_like_poster:       "Photo d'affiche ?",
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
    order.status === "validated" ? "border-good/30" :
    order.status === "rejected"  ? "border-danger/30"   :
    overSLA                      ? "border-danger/50"   : "border-warn/30";

  return (
    <div
      ref={cardRef}
      className={`bg-white rounded-xl border-2 p-4 select-none ${borderColor} ${selected ? "ring-2 ring-brand-red/40" : ""}`}
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
              className="mt-0.5 shrink-0 h-4 w-4 accent-brand-red"
            />
          )}
          <div className="min-w-0">
            {/* Member */}
            <div className="flex items-center gap-1.5 flex-wrap">
              {/* ADR 0034 — un membre sans équipe envoie ses tickets comme les autres */}
              <span className="text-base shrink-0" title={order.teams?.name ?? "Sans équipe"}>
                {order.teams?.flag_emoji ?? "—"}
              </span>
              <span className="font-semibold text-ink text-sm">
                {order.profiles?.display_name ?? "—"}
              </span>
              <span className="text-xs text-ink-faint truncate">{order.profiles?.email}</span>
            </div>

            {/* Amount row */}
            <div className="flex items-baseline gap-2 mt-0.5">
              <p className="text-xl font-black text-ink">
                {Number(order.amount).toLocaleString("fr-BE", { style: "currency", currency: "EUR" })}
              </p>
              {order.ocr_amount !== null && (
                <p className={`text-xs font-medium ${
                  Math.abs(order.ocr_amount - order.amount) / order.amount > 0.05
                    ? "text-danger"
                    : "text-ink-muted"
                }`}>
                  OCR {Number(order.ocr_amount).toLocaleString("fr-BE", { style: "currency", currency: "EUR" })}
                </p>
              )}
              {order.ocr_confidence !== null && (
                <p className={`text-xs font-medium ${order.ocr_confidence < 70 ? "text-danger" : "text-ink-faint"}`}>
                  {order.ocr_confidence}%
                </p>
              )}
            </div>

            {/* Order number + date */}
            <p className="text-xs text-ink-muted mt-0.5">
              {order.order_number
                ? <span className="font-mono text-ink-body">{order.order_number}</span>
                : <span className="italic text-ink-faint">N° non extrait</span>
              }
              {" · "}
              {new Date(order.order_date + "T00:00:00Z").toLocaleDateString("fr-BE", { timeZone: "UTC" })}
              {" · "}
              {new Date(order.submitted_at).toLocaleTimeString("fr-BE", { hour: "2-digit", minute: "2-digit" })}
            </p>

            {/* SLA + flags */}
            <div className="flex flex-wrap gap-1 mt-1.5">
              {order.status === "pending" && overSLA && (
                <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-danger/12 text-danger">
                  ⏱ {Math.floor(hoursOld)}h d&apos;attente
                </span>
              )}
              {flags.map(flag => {
                const label = FLAG_LABELS[flag];
                return label ? (
                  <StatusBadge key={flag} tone="neutral">{label}</StatusBadge>
                ) : null;
              })}
              {order.rejection_reason && (
                <span className="text-xs text-danger mt-0.5 w-full">Rejet : {order.rejection_reason}</span>
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
              className="w-12 h-16 rounded-lg overflow-hidden border border-paper-border shrink-0 bg-paper"
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
                ? "bg-good/12 text-good"
                : "bg-danger/12 text-danger"
            }`}>
              {order.status === "validated" ? "Validée" : "Rejetée"}
            </span>
          ) : !batchMode ? (
            <div className="flex flex-col gap-1.5">
              <button
                onClick={onValidate}
                disabled={busy}
                className="px-3 py-1.5 bg-good text-white rounded-lg text-xs font-semibold hover:bg-good disabled:opacity-50 whitespace-nowrap"
              >
                {busy ? "…" : "Valider"}
              </button>
              <button
                onClick={onReject}
                disabled={busy}
                className="px-3 py-1.5 bg-danger/12 text-danger rounded-lg text-xs font-semibold hover:bg-danger/20 disabled:opacity-50"
              >
                Rejeter
              </button>
            </div>
          ) : null}
        </div>
      </div>

      {/* Swipe hint (mobile, pending only) */}
      {order.status === "pending" && !batchMode && (
        <p className="text-center text-xs text-ink-faint mt-2 md:hidden">
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
  // Remonté par l'onglet Doublons une fois sa file chargée (0 tant qu'on ne
  // l'a pas ouvert : on n'appelle pas une deuxième API au chargement de la
  // page pour un compteur).
  const [duplicateCount, setDuplicateCount] = useState(0);
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
  // Un ticket en cours d'arbitrage vit dans l'onglet « Doublons » et nulle
  // part ailleurs : le valider depuis « Suspectes » sautait la comparaison
  // côte à côte et laissait sa ligne `duplicate_reviews` en attente.
  const inDuplicateReview = (o: AdminOrder) =>
    Array.isArray(o.flag_reasons) && o.flag_reasons.includes("duplicate_review");

  // Sort pending/flagged by age (oldest first), others by recency (newest first)
  const filtered = orders
    .filter(o => {
      if (filter === "all")     return true;
      if (filter === "flagged") return isFlagged(o) && o.status === "pending" && !inDuplicateReview(o);
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
    flagged:   orders.filter(o => isFlagged(o) && o.status === "pending" && !inDuplicateReview(o)).length,
    duplicates: duplicateCount,
    pending:   orders.filter(o => o.status === "pending").length,
    validated: orders.filter(o => o.status === "validated").length,
    rejected:  orders.filter(o => o.status === "rejected").length,
    all:       orders.length,
  };

  const pendingOverSLA = orders.filter(o => o.status === "pending" && waitHours(o.submitted_at) > 2).length;

  return (
    <div className="space-y-4">
      {actionError && (
        <div className="bg-danger/10 border border-danger/30 rounded-xl p-3 text-sm text-danger flex items-start justify-between gap-2">
          <span className="flex items-start gap-2">
            <TriangleAlert size={15} strokeWidth={1.8} className="shrink-0 mt-0.5" aria-hidden="true" />
            {actionError}
          </span>
          <button onClick={() => setActionError(null)} className="text-danger/60 hover:text-danger shrink-0" aria-label="Fermer">
            <X size={15} strokeWidth={2} aria-hidden="true" />
          </button>
        </div>
      )}
      {/* Header */}
      <div className="flex items-start justify-between gap-2">
        <PageHeader
          title={<>Commandes suspectes</>}
          subtitle={<>Glisser droite = valider · Glisser gauche = rejeter</>}
        />
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
                className="text-xs font-semibold px-3 py-2 rounded-lg border bg-white text-ink-body border-paper-border hover:border-ink-faint transition-colors"
              >
                Tout sélectionner
              </button>
            )}
            <button
              onClick={() => { setBatchMode(b => !b); setSelected(new Set()); }}
              className={`text-xs font-semibold px-3 py-2 rounded-lg border transition-colors ${
                batchMode
                  ? "bg-ink text-white border-ink"
                  : "bg-white text-ink-body border-paper-border hover:border-ink-faint"
              }`}
            >
              {batchMode ? "Annuler" : "Sélection"}
            </button>
          </div>
        )}
      </div>

      {/* SLA alert */}
      {pendingOverSLA > 0 && (
        <div className="bg-danger/10 border border-danger/40 rounded-xl p-3 flex items-center gap-2">
          <span className="text-lg">⏱</span>
          <p className="text-danger text-sm font-semibold">
            {pendingOverSLA} commande{pendingOverSLA > 1 ? "s" : ""} en attente depuis plus de 2h
          </p>
        </div>
      )}

      {/* Filtres — l'onglet « Suspectes » ne crie que s'il a de quoi
          (FilterTabs, tone danger) : vide, c'est un onglet comme un autre. */}
      <FilterTabs
        value={filter}
        onChange={setFilter}
        tabs={STATUS_FILTER.map(f => ({
          key: f,
          label:
            f === "flagged"    ? "Suspectes" :
            f === "duplicates" ? "Doublons" :
            f === "all"        ? "Toutes" :
            f === "pending"    ? "En attente" :
            f === "validated"  ? "Validées" : "Rejetées",
          count: counts[f],
          tone: f === "flagged" ? ("danger" as const) : undefined,
        }))}
      />

      {/* Onglet Doublons — sa propre file (table `duplicate_reviews`), servie
          par son API : ce ne sont pas des lignes de `orders` à filtrer, mais
          des PAIRES à comparer. */}
      {filter === "duplicates" ? (
        <DuplicateReviews restaurantId={restaurantId} onCountChange={setDuplicateCount} />
      ) : loading ? (
        <div className="space-y-3">
          {[1, 2, 3].map(i => (
            <div key={i} className="bg-white rounded-xl h-28 animate-pulse border border-paper-border" />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div className="bg-white rounded-xl border border-paper-border p-8 text-center">
          <p className="text-ink-faint">Aucune commande dans cette catégorie.</p>
          <p className="text-xs text-ink-faint mt-1 max-w-sm mx-auto">
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
                <div className="mt-2 bg-danger/10 border border-danger/30 rounded-xl p-4 space-y-3">
                  <p className="text-sm font-semibold text-danger">Motif du rejet</p>
                  <select
                    value={rejectPreset}
                    onChange={e => setRejectPreset(e.target.value)}
                    className="w-full px-3 py-2 border border-danger/30 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-danger/50"
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
                      className="w-full px-3 py-2 border border-danger/30 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-danger/50"
                    />
                  )}
                  <div className="flex gap-2">
                    <button
                      onClick={() => handleAction(order.id, "reject", rejectReason)}
                      disabled={!rejectReason.trim() || busy === order.id}
                      className="flex-1 px-4 py-2 bg-danger text-white rounded-lg text-sm font-semibold disabled:opacity-50 hover:bg-danger"
                    >
                      {busy === order.id ? "…" : "Confirmer le rejet"}
                    </button>
                    <button
                      onClick={() => setRejectId(null)}
                      className="px-4 py-2 border border-paper-border rounded-lg text-sm text-ink-body hover:bg-paper"
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
        <div className="fixed bottom-0 left-0 right-0 bg-white border-t border-paper-border shadow-xl p-4 flex gap-3 z-40 safe-bottom">
          <button
            onClick={handleBatchValidate}
            disabled={batchBusy}
            className="flex-1 py-3 bg-good text-white rounded-xl font-semibold text-sm hover:bg-good disabled:opacity-50"
          >
            {batchBusy ? "Validation…" : `Valider ${selected.size} commande${selected.size > 1 ? "s" : ""}`}
          </button>
          <button
            onClick={() => { setSelected(new Set()); setBatchMode(false); }}
            className="px-5 py-3 border border-paper-border rounded-xl text-sm text-ink-body hover:bg-paper"
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
