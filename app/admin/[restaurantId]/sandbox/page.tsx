"use client";

import { useEffect, useState, useCallback } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";

type Member = {
  id: string;
  display_name: string;
  email: string | null;
  team_id: string | null;
  teams: { name: string; flag_emoji: string } | null;
};

type ScoreRow = {
  team_id: string;
  member_count: number;
  total_spent: number;
  score: number;
  teams: { name: string; flag_emoji: string } | null;
};

type Result = { ok?: boolean; error?: string; [k: string]: unknown };

function StatusBadge({ result }: { result: Result | null }) {
  if (!result) return null;
  const isOk = result.ok;
  return (
    <p className={`text-xs font-mono mt-2 ${isOk ? "text-green-700" : "text-red-600"}`}>
      {isOk
        ? `✓ ${JSON.stringify(Object.fromEntries(Object.entries(result).filter(([k]) => k !== "ok")))}`
        : `✗ ${result.error}`}
    </p>
  );
}

export default function SandboxPage() {
  const { restaurantId } = useParams<{ restaurantId: string }>();
  const [members, setMembers] = useState<Member[]>([]);
  const [scores, setScores] = useState<ScoreRow[]>([]);
  const [loading, setLoading] = useState(true);

  // Commande test
  const [userId, setUserId] = useState("");
  const [amount, setAmount] = useState("25");
  const [orderBusy, setOrderBusy] = useState(false);
  const [orderResult, setOrderResult] = useState<Result | null>(null);

  // Score
  const [scoreTeamId, setScoreTeamId] = useState("__all__");
  const [memberCount, setMemberCount] = useState("5");
  const [totalSpent, setTotalSpent] = useState("200");
  const [scoreBusy, setScoreBusy] = useState(false);
  const [scoreResult, setScoreResult] = useState<Result | null>(null);

  // Crons
  const [cronBusy, setCronBusy] = useState<"notif" | null>(null);
  const [cronResult, setCronResult] = useState<Result | null>(null);

  // Reset test
  const [resetTestBusy, setResetTestBusy] = useState(false);
  const [resetTestResult, setResetTestResult] = useState<Result | null>(null);

  // Reset
  const [resetConfirm, setResetConfirm] = useState(false);
  const [resetBusy, setResetBusy] = useState(false);
  const [resetResult, setResetResult] = useState<Result | null>(null);

  const fetchData = useCallback(async () => {
    const res = await fetch(`/api/admin/sandbox?restaurantId=${restaurantId}`);
    if (res.ok) {
      const d = await res.json();
      setMembers(d.members ?? []);
      setScores(d.scores ?? []);
    }
    setLoading(false);
  }, [restaurantId]);

  useEffect(() => { fetchData(); }, [fetchData]);

  async function post(body: Record<string, unknown>) {
    const res = await fetch("/api/admin/sandbox", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ restaurantId, ...body }),
    });
    return res.json() as Promise<Result>;
  }

  async function createOrder() {
    if (!userId) return;
    setOrderBusy(true);
    setOrderResult(null);
    try {
      const r = await post({ action: "test_order", user_id: userId, amount: Number(amount) });
      setOrderResult(r);
      if (r.ok) fetchData();
    } catch (err: unknown) {
      setOrderResult({ error: err instanceof Error ? err.message : String(err) });
    } finally {
      setOrderBusy(false);
    }
  }

  async function applyScore() {
    setScoreBusy(true);
    setScoreResult(null);
    try {
      const r = await post({
        action:       "set_score",
        team_id:      scoreTeamId === "__all__" ? undefined : scoreTeamId,
        member_count: Number(memberCount),
        total_spent:  Number(totalSpent),
      });
      setScoreResult(r);
      if (r.ok) fetchData();
    } catch (err: unknown) {
      setScoreResult({ error: err instanceof Error ? err.message : String(err) });
    } finally {
      setScoreBusy(false);
    }
  }

  async function resetTest() {
    if (!userId) { setResetTestResult({ error: "Sélectionne un membre d'abord." }); return; }
    setResetTestBusy(true);
    setResetTestResult(null);
    try {
      const r = await post({ action: "reset_test", user_id: userId });
      setResetTestResult(r);
    } catch (err: unknown) {
      setResetTestResult({ error: err instanceof Error ? err.message : String(err) });
    } finally {
      setResetTestBusy(false);
    }
  }

  async function triggerCron() {
    setCronBusy("notif");
    setCronResult(null);
    try {
      const r = await post({ action: "trigger_notifications" });
      setCronResult(r);
    } catch (err: unknown) {
      setCronResult({ error: err instanceof Error ? err.message : String(err) });
    } finally {
      setCronBusy(null);
    }
  }

  async function resetScores() {
    setResetBusy(true);
    setResetResult(null);
    const r = await post({ action: "reset_scores" });
    setResetResult(r);
    if (r.ok) { fetchData(); setResetConfirm(false); }
    setResetBusy(false);
  }

  const previewScore = Number(memberCount) * Number(totalSpent);
  const selectedMember = members.find((m) => m.id === userId);

  return (
    <div className="space-y-5">
      <div>
        {/* ADR 0030 §5 — hors sidebar admin : retour explicite au dashboard */}
        <Link
          href={`/admin/${restaurantId}`}
          className="inline-block text-xs text-gray-400 hover:text-gray-600 mb-1"
        >
          ← Retour au dashboard
        </Link>
        <h1 className="text-2xl font-bold text-gray-900">🧪 Sandbox</h1>
        <p className="text-gray-500 text-sm mt-1">
          Simule des commandes, scores et notifications sans passer par l&apos;OCR.
          Données réelles en base — utilise un compte de test.
        </p>
      </div>

      {/* ── Section 1 : Commande test ───────────────────────────────────────── */}
      <div className="bg-white border border-gray-200 rounded-xl p-5 space-y-4">
        <div>
          <h2 className="font-semibold text-gray-900">Commande test</h2>
          <p className="text-xs text-gray-500 mt-0.5">
            Crée une commande validée instantanément pour n&apos;importe quel montant.
            Déclenche les récompenses pendantes et met à jour le score.
          </p>
        </div>

        {loading ? (
          <div className="h-10 bg-gray-100 rounded-lg animate-pulse" />
        ) : (
          <div className="space-y-3">
            <div className="grid grid-cols-[1fr_auto] gap-3">
              <select
                value={userId}
                onChange={(e) => setUserId(e.target.value)}
                className="border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-red"
              >
                <option value="">— Sélectionner un membre —</option>
                {members.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.teams?.flag_emoji} {m.display_name} {m.email ? `(${m.email})` : ""}
                  </option>
                ))}
              </select>

              <div className="flex items-center gap-1 border border-gray-200 rounded-lg px-3 py-2 text-sm">
                <span className="text-gray-400">€</span>
                <input
                  type="number"
                  min="1"
                  max="500"
                  step="0.01"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  className="w-20 focus:outline-none"
                />
              </div>
            </div>

            {selectedMember?.teams && (
              <p className="text-xs text-gray-500">
                Équipe : {selectedMember.teams.flag_emoji} {selectedMember.teams.name}
                {Number(amount) >= 60 && " · Palier solo : Chef's Combo"}
                {Number(amount) >= 40 && Number(amount) < 60 && " · Palier solo : Menu 4 Tenders"}
                {Number(amount) >= 25 && Number(amount) < 40 && " · Palier solo : Finest burger"}
                {Number(amount) >= 15 && Number(amount) < 25 && " · Palier solo : Churros 6 pcs"}
                {Number(amount) < 15 && " · Palier solo : aucun (< 15€)"}
              </p>
            )}

            <button
              onClick={createOrder}
              disabled={!userId || orderBusy}
              className="w-full bg-brand-red text-white py-2.5 rounded-lg text-sm font-semibold hover:bg-brand-red/85 disabled:opacity-50 transition-colors"
            >
              {orderBusy ? "Création..." : "✅ Créer commande validée"}
            </button>
          </div>
        )}
        <StatusBadge result={orderResult} />
      </div>

      {/* ── Section 2 : Score communautaire ────────────────────────────────── */}
      <div className="bg-white border border-gray-200 rounded-xl p-5 space-y-4">
        <div>
          <h2 className="font-semibold text-gray-900">Score communautaire</h2>
          <p className="text-xs text-gray-500 mt-0.5">
            Fixe directement member_count et total_spent. Score = member_count × total_spent.
          </p>
        </div>

        <div className="space-y-3">
          <select
            value={scoreTeamId}
            onChange={(e) => setScoreTeamId(e.target.value)}
            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-red"
          >
            <option value="__all__">Toutes les équipes</option>
            {scores.map((s) => (
              <option key={s.team_id} value={s.team_id}>
                {s.teams?.flag_emoji} {s.teams?.name} — score actuel{" "}
                {Number(s.score).toLocaleString("fr-BE", { maximumFractionDigits: 0 })} pts
              </option>
            ))}
          </select>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-gray-500 mb-1 block">Membres</label>
              <input
                type="number"
                min="0"
                value={memberCount}
                onChange={(e) => setMemberCount(e.target.value)}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-red"
              />
            </div>
            <div>
              <label className="text-xs text-gray-500 mb-1 block">Total dépensé (€)</label>
              <input
                type="number"
                min="0"
                step="0.01"
                value={totalSpent}
                onChange={(e) => setTotalSpent(e.target.value)}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-red"
              />
            </div>
          </div>

          <div className="bg-gray-50 rounded-lg px-3 py-2 text-sm text-gray-700">
            Score résultant :{" "}
            <strong className="text-brand-dark">
              {previewScore.toLocaleString("fr-BE", { maximumFractionDigits: 0 })} pts
            </strong>
            {scoreTeamId === "__all__" && (
              <span className="text-xs text-gray-400 ml-2">(appliqué à toutes les équipes)</span>
            )}
          </div>

          <button
            onClick={applyScore}
            disabled={scoreBusy}
            className="w-full bg-blue-600 text-white py-2.5 rounded-lg text-sm font-semibold hover:bg-blue-700 disabled:opacity-50 transition-colors"
          >
            {scoreBusy ? "Application..." : "📊 Appliquer le score"}
          </button>
        </div>
        <StatusBadge result={scoreResult} />
      </div>

      {/* ── Section 3 : Scores actuels ─────────────────────────────────────── */}
      {scores.length > 0 && (
        <div className="bg-white border border-gray-200 rounded-xl p-5">
          <h2 className="font-semibold text-gray-900 mb-3">Scores actuels (top 10)</h2>
          <div className="space-y-1.5">
            {scores.slice(0, 10).map((s, i) => (
              <div key={s.team_id} className="flex items-center gap-3 text-sm">
                <span className="text-gray-400 w-5 text-right text-xs">{i + 1}</span>
                <span>{s.teams?.flag_emoji}</span>
                <span className="flex-1 text-gray-700">{s.teams?.name}</span>
                <span className="text-xs text-gray-500">{s.member_count}m · {Number(s.total_spent).toFixed(0)}€</span>
                <span className="font-semibold text-gray-900 w-24 text-right">
                  {Number(s.score).toLocaleString("fr-BE", { maximumFractionDigits: 0 })} pts
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Section 4 : Crons ──────────────────────────────────────────────── */}
      <div className="bg-white border border-gray-200 rounded-xl p-5 space-y-3">
        <div>
          <h2 className="font-semibold text-gray-900">Déclenchement crons</h2>
          <p className="text-xs text-gray-500 mt-0.5">
            Lance les jobs planifiés immédiatement sans attendre cron-job.org.
          </p>
        </div>
        <button
          onClick={resetTest}
          disabled={resetTestBusy || !userId}
          className="w-full bg-purple-600 text-white py-2.5 rounded-lg text-sm font-semibold hover:bg-purple-700 disabled:opacity-50 transition-colors"
        >
          {resetTestBusy ? "Reset..." : "🔄 Reset test — log + last_notified_at + orders → -7h"}
        </button>
        {resetTestResult && (
          <p className={`text-xs font-mono ${resetTestResult.ok ? "text-green-700" : "text-red-600"}`}>
            {resetTestResult.ok ? `✓ ${resetTestResult.reset}` : `✗ ${resetTestResult.error}`}
          </p>
        )}

        <button
          onClick={triggerCron}
          disabled={cronBusy === "notif"}
          className="w-full bg-amber-500 text-white py-2.5 rounded-lg text-sm font-semibold hover:bg-amber-600 disabled:opacity-50 transition-colors"
        >
          {cronBusy === "notif" ? "Envoi..." : "🔔 Déclencher les notifications"}
        </button>
        {cronResult && (
          <pre className={`text-xs font-mono p-2 rounded-lg bg-gray-50 overflow-x-auto ${cronResult.ok ? "text-green-700" : "text-red-600"}`}>
            {JSON.stringify(cronResult, null, 2)}
          </pre>
        )}
      </div>

      {/* ── Section 5 : Membres inscrits ───────────────────────────────────── */}
      {members.length > 0 && (
        <div className="bg-white border border-gray-200 rounded-xl p-5">
          <h2 className="font-semibold text-gray-900 mb-3">
            Membres ({members.length})
          </h2>
          <div className="space-y-1.5">
            {members.map((m) => (
              <div key={m.id} className="flex items-center gap-3 text-sm">
                <span>{m.teams?.flag_emoji ?? "🏳️"}</span>
                <span className="flex-1 text-gray-700">{m.display_name}</span>
                <span className="text-xs text-gray-400">{m.email ?? "—"}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Section 6 : Zone dangereuse ─────────────────────────────────────── */}
      <div className="bg-red-50 border border-red-200 rounded-xl p-5 space-y-3">
        <div>
          <h2 className="font-semibold text-red-900">Zone dangereuse</h2>
          <p className="text-xs text-red-600 mt-0.5">
            Remet tous les scores communautaires à zéro (member_count et total_spent).
            Les commandes et récompenses existantes restent en base.
          </p>
        </div>
        {!resetConfirm ? (
          <button
            onClick={() => setResetConfirm(true)}
            className="bg-red-100 text-red-700 px-4 py-2 rounded-lg text-sm font-semibold hover:bg-red-200 transition-colors"
          >
            🗑️ Reset tous les scores à 0
          </button>
        ) : (
          <div className="flex gap-3 items-center">
            <p className="text-sm text-red-700 font-medium">Confirmer le reset ?</p>
            <button
              onClick={resetScores}
              disabled={resetBusy}
              className="bg-red-600 text-white px-4 py-2 rounded-lg text-sm font-semibold hover:bg-red-700 disabled:opacity-50"
            >
              {resetBusy ? "Reset..." : "Oui, reset"}
            </button>
            <button
              onClick={() => setResetConfirm(false)}
              className="border border-gray-200 text-gray-600 px-4 py-2 rounded-lg text-sm hover:bg-gray-50"
            >
              Annuler
            </button>
          </div>
        )}
        <StatusBadge result={resetResult} />
      </div>
    </div>
  );
}
