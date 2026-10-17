"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { BellRing, ChevronDown, Download, MessageCircle, MoreVertical, Plus, Printer, Trophy } from "lucide-react";
import { readJsonSafe, describeHttpFailure } from "@/lib/fetch-json";
import type { StaffStats } from "@/lib/staff-codes";
import { joinNames, sortStaff, staffBadgeWhatsappUrl, staffStatus, staffToNudge, type StaffStatus } from "@/lib/staff-status";

// ADR 0053 — « Équipe en salle » : qui apporte des clients, prénom par prénom.
// Caissier ou serveur : AUCUNE distinction de poste (décision du porteur) —
// juste le prénom. Le badge de chacun est une page publique à envoyer par
// WhatsApp : il l'affiche depuis son téléphone ou l'imprime (planche A4).
//
// Ordre de la section (maquette validée le 2026-10-03) : trois chiffres, les
// deux gestes (imprimer, ajouter), le coup de pouce s'il y a quelqu'un à
// relancer (lib/staff-status.ts), puis une ligne par personne.

const STATUS_CHIP: Record<Exclude<StaffStatus, "desactive">, { label: string; className: string } | null> = {
  top: { label: "Meilleur ce mois-ci", className: "bg-good/10 text-good" },
  actif: { label: "Actif", className: "bg-good/10 text-good" },
  nouveau: { label: "Nouveau", className: "bg-paper-subtle text-ink-muted" },
  a_relancer: { label: "À relancer", className: "bg-warn/10 text-warn" },
};

function plural(n: number, one: string, many: string) {
  return `${n} ${n > 1 ? many : one}`;
}

export function StaffCodesSection({
  restaurantId,
  restaurantName,
  initialStats,
  migrationMissing,
  autoFocus = false,
  nowIso,
  appUrl,
}: {
  restaurantId: string;
  restaurantName: string;
  initialStats: StaffStats[];
  migrationMissing: boolean;
  /** Arrivée depuis la tâche « Crée le QR de chaque personne en salle » de
   *  l'accueil (ADR 0064) : le formulaire est ouvert, curseur dans le champ. */
  autoFocus?: boolean;
  /** « Maintenant » du serveur : mêmes états au rendu serveur et client. */
  nowIso: string;
  /** Origine publique des liens de badge (NEXT_PUBLIC_APP_URL côté serveur). */
  appUrl: string;
}) {
  const [stats, setStats] = useState<StaffStats[]>(initialStats);
  const [showForm, setShowForm] = useState(autoFocus || initialStats.length === 0);
  const [showInactive, setShowInactive] = useState(false);
  const [label, setLabel] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const now = useMemo(() => new Date(nowIso), [nowIso]);
  const sorted = useMemo(() => sortStaff(stats), [stats]);
  const active = sorted.filter((s) => s.isActive);
  const inactive = sorted.filter((s) => !s.isActive);
  const nudge = staffToNudge(active, now);
  const maxLandings = Math.max(1, ...active.map((s) => s.landings30d));
  const best = active.find((s) => staffStatus(s, active, now) === "top") ?? null;

  if (migrationMissing) {
    return (
      <div className="bg-warn/10 border border-warn/30 rounded-xl p-4 text-sm text-warn">
        La mesure « Équipe en salle » attend la migration{" "}
        <code className="bg-warn/12 px-1 rounded">20260910-1430-codes-personnel-salle.sql</code>{" "}
        (éditeur SQL Supabase). Rien d&apos;autre n&apos;est bloqué.
      </div>
    );
  }

  function badgeUrl(code: string) {
    return `${appUrl}/badge/${code}`;
  }

  function whatsappHref(s: StaffStats) {
    return staffBadgeWhatsappUrl(s.label, restaurantName, badgeUrl(s.code));
  }

  async function creer(e: React.FormEvent) {
    e.preventDefault();
    if (!label.trim() || busy) return;
    setBusy(true);
    setError(null);
    const res = await fetch("/api/admin/staff-codes", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ restaurantId, label: label.trim() }),
    });
    const { data } = await readJsonSafe<{ id: string; code: string; label: string; error?: string }>(res);
    if (res.status === 201 && data) {
      setStats((s) => [
        ...s,
        { id: data.id, code: data.code, label: data.label, isActive: true, createdAt: new Date().toISOString(), landings30d: 0, signupsTotal: 0, signups30d: 0, withTicket: 0 },
      ]);
      setLabel("");
    } else {
      setError(describeHttpFailure(res.status, data?.error));
    }
    setBusy(false);
  }

  async function basculer(codeId: string, isActive: boolean) {
    const res = await fetch("/api/admin/staff-codes", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ restaurantId, codeId, isActive }),
    });
    if (res.ok) {
      setStats((s) => s.map((c) => (c.id === codeId ? { ...c, isActive } : c)));
    } else {
      setError("Mise à jour impossible. Réessaie dans un instant.");
    }
  }

  async function copierBadge(id: string, code: string) {
    try {
      await navigator.clipboard.writeText(badgeUrl(code));
      setCopiedId(id);
      setTimeout(() => setCopiedId(null), 2000);
    } catch {}
  }

  const landings30d = active.reduce((n, s) => n + s.landings30d, 0);
  const signups30d = active.reduce((n, s) => n + s.signups30d, 0);

  return (
    <div className="space-y-4">
      {active.length > 0 && (
        <div className="grid grid-cols-3 gap-2.5">
          {[
            { value: active.length, label: "QR actifs dans l'équipe" },
            { value: landings30d, label: "scans de leurs QR · 30 j" },
            { value: signups30d, label: "clients inscrits grâce à eux · 30 j" },
          ].map((t) => (
            <div key={t.label} className="bg-white border border-paper-border rounded-xl px-3.5 py-3 min-w-0">
              <p className="font-display font-bold text-2xl text-ink tabular-nums">{t.value}</p>
              <p className="text-[12px] text-ink-muted leading-snug">{t.label}</p>
            </div>
          ))}
        </div>
      )}

      <div className="flex flex-wrap gap-2">
        {active.length > 0 && (
          <Link
            href={`/admin/${restaurantId}/qr/print/equipe`}
            className="inline-flex items-center gap-2 bg-ink text-white text-sm font-bold px-4 py-2.5 rounded-xl hover:opacity-90 transition-opacity"
          >
            <Printer size={15} strokeWidth={1.8} aria-hidden="true" />
            Imprimer toute l&apos;équipe (A4)
          </Link>
        )}
        {!showForm && (
          <button
            type="button"
            onClick={() => setShowForm(true)}
            className="inline-flex items-center gap-2 bg-white border border-paper-border text-ink text-sm font-bold px-4 py-2.5 rounded-xl hover:border-ink-faint transition-colors"
          >
            <Plus size={15} strokeWidth={2} aria-hidden="true" />
            Ajouter une personne
          </button>
        )}
      </div>

      {showForm && (
        <form onSubmit={creer} className="flex gap-2">
          <input
            type="text"
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            placeholder="Prénom (ex. Sofia)"
            aria-label="Prénom de la personne"
            autoFocus={autoFocus}
            maxLength={40}
            className="flex-1 min-w-0 border border-paper-border rounded-xl px-3 py-2 text-sm bg-white focus:border-ink"
          />
          <button
            type="submit"
            disabled={busy || !label.trim()}
            className="bg-ink text-white text-sm font-bold px-4 py-2 rounded-xl hover:opacity-90 disabled:opacity-50 transition-opacity"
          >
            {busy ? "…" : "Créer son QR"}
          </button>
        </form>
      )}
      {error && <p className="text-danger text-xs bg-danger/10 px-3 py-2 rounded-lg">{error}</p>}

      {/* Le coup de pouce : seulement s'il y a quelqu'un à relancer. */}
      {nudge.length > 0 && (
        <div className="bg-warn/10 border border-warn/30 rounded-xl px-4 py-3.5 space-y-2.5">
          <p className="flex items-center gap-2 font-semibold text-ink text-[14.5px]">
            <BellRing size={16} strokeWidth={1.8} className="text-warn shrink-0" aria-hidden="true" />
            {joinNames(nudge.map((s) => s.label))} {nudge.length > 1 ? "n'ont" : "n'a"} presque pas de scans
          </p>
          <p className="text-[13px] text-ink-body">
            {nudge.length > 1 ? "Leur QR existe" : "Son QR existe"}{" "}
            depuis plus de 7 jours mais a été scanné moins de 3 fois en 30 jours. D&apos;habitude, c&apos;est que le
            client ne le voit pas.
          </p>
          <ol className="list-decimal pl-5 text-[13px] text-ink-body space-y-0.5">
            <li>Donne-{nudge.length > 1 ? "leur leur" : "lui sa"} carte imprimée, à poser près de la caisse.</li>
            <li>Renvoie-{nudge.length > 1 ? "leur" : "lui"} le badge sur WhatsApp, avec la phrase à dire.</li>
            {best && (
              <li>
                Montre-{nudge.length > 1 ? "leur" : "lui"} le classement : {best.label} en est à{" "}
                {plural(best.signups30d, "inscription", "inscriptions")} ce mois-ci.
              </li>
            )}
          </ol>
          <div className="flex flex-wrap gap-2">
            {nudge.map((s) => (
              <a
                key={s.id}
                href={whatsappHref(s)}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 bg-white border border-paper-border text-ink text-xs font-bold px-3 py-1.5 rounded-lg hover:border-ink-faint"
              >
                <MessageCircle size={14} strokeWidth={1.8} aria-hidden="true" />
                Renvoyer à {s.label}
              </a>
            ))}
          </div>
        </div>
      )}

      {active.length > 0 && (
        <div className="bg-white rounded-xl border border-paper-border overflow-hidden divide-y divide-paper-border">
          {active.map((s) => {
            const status = staffStatus(s, active, now) as Exclude<StaffStatus, "desactive">;
            const chip = STATUS_CHIP[status];
            const warn = status === "a_relancer";
            return (
              <div key={s.id} className="grid grid-cols-[36px_minmax(0,1fr)] sm:grid-cols-[36px_minmax(0,1fr)_auto] gap-x-3 gap-y-2 items-center px-4 py-3">
                <span
                  className={`w-9 h-9 rounded-full flex items-center justify-center font-bold text-sm ${
                    status === "top" ? "bg-ink text-white" : "bg-paper-subtle text-ink"
                  }`}
                  aria-hidden="true"
                >
                  {status === "top" ? <Trophy size={16} strokeWidth={1.8} /> : s.label.charAt(0).toUpperCase()}
                </span>
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-semibold text-ink text-[14.5px] truncate">{s.label}</span>
                    {chip && <span className={`text-[11px] font-bold px-2 py-0.5 rounded-full ${chip.className}`}>{chip.label}</span>}
                  </div>
                  <p className="text-[12.5px] text-ink-muted tabular-nums mt-0.5">
                    <strong className="text-ink">{s.landings30d}</strong> {s.landings30d > 1 ? "scans" : "scan"}
                    <span className="text-ink-faint"> → </span>
                    <strong className="text-ink">{s.signups30d}</strong> {s.signups30d > 1 ? "inscrits" : "inscrit"}
                    <span className="text-ink-faint"> → </span>
                    <strong className="text-ink">{s.withTicket}</strong> avec un ticket
                    {s.signupsTotal > s.signups30d && <span className="text-ink-faint"> · {s.signupsTotal} au total</span>}
                  </p>
                  <div className="h-[5px] bg-paper-subtle rounded-full mt-1.5 max-w-[260px] overflow-hidden" aria-hidden="true">
                    <div
                      className={`h-full rounded-full ${warn ? "bg-warn" : "bg-ink"}`}
                      style={{ width: `${Math.max(2, Math.round((s.landings30d / maxLandings) * 100))}%` }}
                    />
                  </div>
                </div>
                <div className="col-start-2 sm:col-start-auto flex items-center gap-1.5">
                  <a
                    href={whatsappHref(s)}
                        target="_blank"
                    rel="noopener noreferrer"
                    title="Envoyer son badge sur WhatsApp"
                    aria-label={`Envoyer le badge de ${s.label} sur WhatsApp`}
                    className="w-9 h-9 rounded-lg border border-paper-border flex items-center justify-center text-ink-body hover:border-ink-faint hover:text-ink"
                  >
                    <MessageCircle size={16} strokeWidth={1.8} aria-hidden="true" />
                  </a>
                  <a
                    href={`/api/admin/staff-codes/qr?restaurantId=${encodeURIComponent(restaurantId)}&codeId=${s.id}`}
                    download
                    title="Télécharger son QR (PNG)"
                    aria-label={`Télécharger le QR de ${s.label}`}
                    className="w-9 h-9 rounded-lg border border-paper-border flex items-center justify-center text-ink-body hover:border-ink-faint hover:text-ink"
                  >
                    <Download size={16} strokeWidth={1.8} aria-hidden="true" />
                  </a>
                  <details className="relative">
                    <summary
                      title="Plus d'actions"
                      aria-label={`Plus d'actions pour ${s.label}`}
                      className="list-none [&::-webkit-details-marker]:hidden w-9 h-9 rounded-lg border border-paper-border flex items-center justify-center text-ink-body hover:border-ink-faint hover:text-ink cursor-pointer"
                    >
                      <MoreVertical size={16} strokeWidth={1.8} aria-hidden="true" />
                    </summary>
                    <div className="absolute right-0 z-10 mt-1 w-48 bg-white border border-paper-border rounded-xl shadow-lg py-1 text-sm">
                      <a href={`/badge/${s.code}`} target="_blank" rel="noopener noreferrer" className="block px-3 py-2 text-ink hover:bg-paper">
                        Voir son badge
                      </a>
                      <button type="button" onClick={() => void copierBadge(s.id, s.code)} className="block w-full text-left px-3 py-2 text-ink hover:bg-paper">
                        {copiedId === s.id ? "Lien copié" : "Copier le lien du badge"}
                      </button>
                      <button type="button" onClick={() => void basculer(s.id, false)} className="block w-full text-left px-3 py-2 text-ink-muted hover:bg-paper">
                        Désactiver (départ)
                      </button>
                    </div>
                  </details>
                </div>
              </div>
            );
          })}
          <div className="flex items-center justify-between gap-2 flex-wrap px-4 py-2.5 text-[12.5px] text-ink-faint">
            <span>Trié par inscriptions sur 30 jours</span>
            {inactive.length > 0 && (
              <button type="button" onClick={() => setShowInactive((v) => !v)} className="inline-flex items-center gap-1 hover:text-ink-body">
                {plural(inactive.length, "QR désactivé", "QR désactivés")}
                <ChevronDown size={13} strokeWidth={1.8} className={showInactive ? "rotate-180" : ""} aria-hidden="true" />
              </button>
            )}
          </div>
          {showInactive &&
            inactive.map((s) => (
              <div key={s.id} className="flex items-center justify-between gap-3 px-4 py-2.5 text-sm opacity-60">
                <span className="text-ink truncate">
                  {s.label} <span className="text-[12px] text-ink-faint">· {s.signupsTotal} inscrits au total</span>
                </span>
                <button type="button" onClick={() => void basculer(s.id, true)} className="text-xs font-semibold text-ink-body hover:text-ink shrink-0">
                  Réactiver
                </button>
              </div>
            ))}
        </div>
      )}

      {active.length === 0 && inactive.length > 0 && (
        <button type="button" onClick={() => setShowInactive((v) => !v)} className="text-xs text-ink-faint hover:text-ink-body">
          {plural(inactive.length, "QR désactivé", "QR désactivés")} — {showInactive ? "masquer" : "afficher"}
        </button>
      )}
      {active.length === 0 && showInactive && inactive.map((s) => (
        <div key={s.id} className="flex items-center justify-between gap-3 text-sm">
          <span className="text-ink-muted">{s.label}</span>
          <button type="button" onClick={() => void basculer(s.id, true)} className="text-xs font-semibold text-ink-body hover:text-ink">Réactiver</button>
        </div>
      ))}

      <p className="text-xs text-ink-faint">
        Chacun montre son badge depuis son téléphone (envoie-le par WhatsApp) ou garde sa carte imprimée près de la caisse.
        La phrase à dire est sur le badge.
      </p>
    </div>
  );
}
