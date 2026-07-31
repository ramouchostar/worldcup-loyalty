"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import type { TeamType } from "@/types";

type TargetKind = "all" | "types" | "teams";
type Team = { id: string; name: string; type: TeamType; flag_emoji: string };
type Result = { targeted: number; sent: number; skipped: number };
type Scheduled = {
  id: string;
  message: string;
  send_on: string;
  promo_on: string | null;
  sent_at: string | null;
  result: Result | null;
};

const fmtDate = (iso: string) =>
  new Date(`${iso}T00:00:00Z`).toLocaleDateString("fr-BE", {
    weekday: "long",
    day: "numeric",
    month: "long",
    timeZone: "UTC",
  });

const TYPE_OPTIONS: { value: TeamType; label: string }[] = [
  { value: "ecole", label: "🎓 Écoles" },
  { value: "entreprise", label: "🏢 Entreprises" },
  { value: "rue_quartier", label: "🏘️ Rues / quartiers" },
  { value: "taxis", label: "🚕 Taxis" },
  { value: "autre", label: "👥 Autres" },
];

export default function AdminBroadcastPage() {
  const { restaurantId } = useParams<{ restaurantId: string }>();
  const [message, setMessage] = useState("");
  const [kind, setKind] = useState<TargetKind>("all");
  const [types, setTypes] = useState<TeamType[]>([]);
  const [teamIds, setTeamIds] = useState<string[]>([]);
  const [teams, setTeams] = useState<Team[]>([]);
  const [sending, setSending] = useState(false);
  const [result, setResult] = useState<Result | null>(null);
  const [scheduledOk, setScheduledOk] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  // ADR 0023 — envoi programmé (annonce de promo à J-1/J-2)
  const [sendOn, setSendOn] = useState("");
  const [promoOn, setPromoOn] = useState("");
  const [scheduled, setScheduled] = useState<Scheduled[]>([]);

  const loadScheduled = () =>
    fetch(`/api/admin/broadcast?restaurantId=${restaurantId}`).then(async (r) => {
      if (r.ok) setScheduled(await r.json());
    });

  useEffect(() => {
    fetch(`/api/teams?restaurantId=${restaurantId}`).then(async (r) => { if (r.ok) setTeams(await r.json()); });
    loadScheduled();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [restaurantId]);

  // Pré-rempli par la page Opportunités (?prefill=…&sendOn=…&promoOn=…) — lu
  // via window.location pour rester compatible avec le prérendu client.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const prefill = params.get("prefill");
    if (prefill) setMessage(prefill.slice(0, 280));
    const dateRe = /^\d{4}-\d{2}-\d{2}$/;
    const so = params.get("sendOn");
    const po = params.get("promoOn");
    if (so && dateRe.test(so)) setSendOn(so);
    if (po && dateRe.test(po)) setPromoOn(po);
    // Pré-ciblage sur un type d'équipe (cartes Opportunités, ADR 0022)
    const tt = params.get("targetType");
    if (tt && TYPE_OPTIONS.some((o) => o.value === tt)) {
      setKind("types");
      setTypes([tt as TeamType]);
    }
  }, []);

  function toggle<T>(list: T[], v: T): T[] {
    return list.includes(v) ? list.filter((x) => x !== v) : [...list, v];
  }

  async function send() {
    setError(null);
    setResult(null);
    setScheduledOk(null);

    let target: unknown;
    if (kind === "all") target = { kind: "all" };
    else if (kind === "types") target = { kind: "types", types };
    else target = { kind: "teams", teamIds };

    if (kind === "types" && types.length === 0) { setError("Choisis au moins un type."); return; }
    if (kind === "teams" && teamIds.length === 0) { setError("Choisis au moins une équipe."); return; }
    const confirmText = sendOn
      ? `Programmer ce broadcast pour le ${fmtDate(sendOn)} ?`
      : "Envoyer ce broadcast ? Les membres ciblés seront notifiés.";
    if (!window.confirm(confirmText)) return;

    setSending(true);
    const res = await fetch("/api/admin/broadcast", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        restaurantId,
        message,
        target,
        ...(sendOn ? { sendOn, promoOn: promoOn || undefined } : {}),
      }),
    });
    const body = await res.json();
    if (res.ok && body.scheduled) {
      setScheduledOk(body.sendOn);
      setMessage("");
      setSendOn("");
      setPromoOn("");
      loadScheduled();
    } else if (res.ok) {
      setResult(body);
      setMessage("");
    } else setError(body.error ?? "Échec de l'envoi.");
    setSending(false);
  }

  async function cancelScheduled(id: string) {
    if (!window.confirm("Annuler cette annonce programmée ?")) return;
    const res = await fetch(`/api/admin/broadcast?restaurantId=${restaurantId}&id=${id}`, { method: "DELETE" });
    if (res.ok) loadScheduled();
  }

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Broadcasts</h1>
        <p className="text-gray-500 text-sm mt-1">
          Envoie une notification à tes équipes — par exemple un menu étudiant aux écoles, ou un service
          de nuit aux taxis. Push gratuit, WhatsApp en secours.
        </p>
      </div>

      {/* Message */}
      <div className="bg-white rounded-xl border border-gray-100 p-5 space-y-2">
        <label className="text-sm font-semibold text-gray-900">Message</label>
        <textarea
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          maxLength={280}
          rows={3}
          placeholder="Ex. Menu étudiant à 8,90 € ce midi sur présentation de l'app 🎓"
          className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm"
        />
        <p className="text-xs text-gray-400 text-right">{message.length}/280</p>
      </div>

      {/* Cible */}
      <div className="bg-white rounded-xl border border-gray-100 p-5 space-y-3">
        <p className="text-sm font-semibold text-gray-900">Destinataires</p>

        <div className="flex flex-wrap gap-2">
          {([["all", "Toutes les équipes"], ["types", "Par type"], ["teams", "Par équipe"]] as [TargetKind, string][]).map(
            ([value, label]) => (
              <button
                key={value}
                onClick={() => setKind(value)}
                className={`px-3 py-1.5 rounded-lg text-sm font-medium border ${
                  kind === value ? "bg-brand-dark text-white border-brand-dark" : "bg-white text-gray-700 border-gray-200 hover:bg-gray-50"
                }`}
              >
                {label}
              </button>
            )
          )}
        </div>

        {kind === "types" && (
          <div className="flex flex-wrap gap-2 pt-1">
            {TYPE_OPTIONS.map((o) => (
              <button
                key={o.value}
                onClick={() => setTypes((prev) => toggle(prev, o.value))}
                className={`px-3 py-1.5 rounded-full text-sm border ${
                  types.includes(o.value) ? "bg-brand-gold/20 border-brand-gold/50 text-amber-800" : "bg-white border-gray-200 text-gray-600"
                }`}
              >
                {o.label}
              </button>
            ))}
          </div>
        )}

        {kind === "teams" && (
          <div className="pt-1 max-h-60 overflow-y-auto space-y-1">
            {teams.length === 0 ? (
              <p className="text-sm text-gray-400">Aucune équipe pour l&apos;instant.</p>
            ) : (
              teams.map((t) => (
                <label key={t.id} className="flex items-center gap-2 p-2 rounded-lg hover:bg-gray-50 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={teamIds.includes(t.id)}
                    onChange={() => setTeamIds((prev) => toggle(prev, t.id))}
                  />
                  <span>{t.flag_emoji}</span>
                  <span className="text-sm text-gray-800">{t.name}</span>
                </label>
              ))
            )}
          </div>
        )}
      </div>

      {/* Envoi programmé (ADR 0023) */}
      <div className="bg-white rounded-xl border border-gray-100 p-5 space-y-2">
        <label className="text-sm font-semibold text-gray-900">📆 Programmer l&apos;envoi (optionnel)</label>
        <p className="text-xs text-gray-500">
          Laisse vide pour envoyer maintenant. Pour annoncer une promo, programme l&apos;envoi la veille
          ou l&apos;avant-veille du jour de la promo — jamais plus tôt, sinon les membres reportent leurs
          commandes des autres jours.
        </p>
        <div className="flex flex-wrap items-center gap-3">
          <input
            type="date"
            value={sendOn}
            onChange={(e) => setSendOn(e.target.value)}
            className="border border-gray-200 rounded-lg px-3 py-2 text-sm"
          />
          {sendOn && (
            <button onClick={() => { setSendOn(""); setPromoOn(""); }} className="text-xs text-gray-400 underline">
              Envoyer maintenant à la place
            </button>
          )}
        </div>
        {sendOn && promoOn && (
          <p className="text-xs text-amber-700">
            Promo du {fmtDate(promoOn)} — annonce le {fmtDate(sendOn)}, envoyée en début de soirée.
          </p>
        )}
      </div>

      {error && <div className="bg-red-50 border border-red-200 rounded-xl p-3 text-sm text-red-700">{error}</div>}
      {result && (
        <div className="bg-green-50 border border-green-200 rounded-xl p-3 text-sm text-green-800">
          Envoyé à {result.sent} membre(s) sur {result.targeted} ciblé(s).
          {result.skipped > 0 && ` ${result.skipped} ignoré(s) (quota hebdo atteint).`}
        </div>
      )}
      {scheduledOk && (
        <div className="bg-green-50 border border-green-200 rounded-xl p-3 text-sm text-green-800">
          Annonce programmée pour le {fmtDate(scheduledOk)} — elle partira en début de soirée.
        </div>
      )}

      <button
        onClick={send}
        disabled={sending || message.trim().length < 3}
        className="px-5 py-2.5 bg-brand-red text-white rounded-lg text-sm font-semibold hover:bg-brand-red/85 disabled:opacity-50"
      >
        {sending ? "Envoi en cours…" : sendOn ? "Programmer le broadcast" : "Envoyer le broadcast"}
      </button>

      {/* Annonces programmées */}
      {scheduled.length > 0 && (
        <div className="bg-white rounded-xl border border-gray-100 p-5 space-y-3">
          <p className="text-sm font-semibold text-gray-900">Annonces programmées</p>
          {scheduled.map((s) => (
            <div key={s.id} className="flex items-start justify-between gap-3 border-b border-gray-50 pb-2 last:border-0 last:pb-0">
              <div className="min-w-0">
                <p className="text-sm text-gray-800 truncate">{s.message}</p>
                <p className="text-xs text-gray-400">
                  {s.sent_at
                    ? `Envoyée le ${fmtDate(s.send_on)}${s.result ? ` — ${s.result.sent}/${s.result.targeted} membres` : ""}`
                    : `Prévue le ${fmtDate(s.send_on)}${s.promo_on ? ` (promo du ${fmtDate(s.promo_on)})` : ""}`}
                </p>
              </div>
              {!s.sent_at && (
                <button onClick={() => cancelScheduled(s.id)} className="text-xs text-red-500 underline shrink-0">
                  Annuler
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
