"use client";

import { useState, useTransition, type ReactNode } from "react";
import { attachAction, confirmPaymentAction, identityAction, invoiceAction, launchAction, prepareAction, sendBackAction, syncNowAction, type PubActionResult } from "./actions";

const INPUT = "rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-950 px-2.5 py-2 text-sm";
const DARK = "rounded-lg bg-gray-900 dark:bg-white px-3.5 py-2 text-sm font-semibold text-white dark:text-gray-900 disabled:opacity-50";
const LIGHT = "rounded-lg border border-gray-300 dark:border-gray-700 px-3.5 py-2 text-sm font-semibold disabled:opacity-50";

function useAction() {
  const [pending, start] = useTransition();
  const [res, setRes] = useState<PubActionResult | null>(null);
  const run = (fn: () => Promise<PubActionResult>) => start(async () => setRes(await fn()));
  const feedback: ReactNode = res ? (
    <p className={`text-xs ${res.ok ? (res.warning ? "text-amber-700" : "text-emerald-700") : "text-red-700"}`}>{res.ok ? (res.warning ?? "Fait.") : res.error}</p>
  ) : null;
  return { pending, run, feedback };
}

export function ConfirmPayment({ noticeId, expectedEuros, today }: { noticeId: string; expectedEuros: string; today: string }) {
  const [amount, setAmount] = useState(expectedEuros);
  const [day, setDay] = useState(today);
  const { pending, run, feedback } = useAction();
  return (
    <div className="space-y-1">
      <div className="flex flex-wrap items-end gap-2">
        <label className="text-xs">Reçu (€)<input value={amount} onChange={(e) => setAmount(e.target.value)} className={`${INPUT} block w-24`} /></label>
        <label className="text-xs">Le<input type="date" value={day} onChange={(e) => setDay(e.target.value)} className={`${INPUT} block`} /></label>
        <button type="button" disabled={pending} className={`${DARK} flex-1`} onClick={() => run(() => confirmPaymentAction(noticeId, amount, day))}>
          {pending ? "Création chez Meta…" : "Virement reçu"}
        </button>
      </div>
      {feedback}
    </div>
  );
}

export function LaunchControls({ requestId, canLaunch }: { requestId: string; canLaunch: boolean }) {
  const [reason, setReason] = useState("");
  const [asking, setAsking] = useState(false);
  const { pending, run, feedback } = useAction();
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-2">
        <button type="button" disabled={pending || !canLaunch} className="rounded-lg bg-emerald-700 px-3.5 py-2 text-sm font-semibold text-white disabled:opacity-50" onClick={() => run(() => launchAction(requestId))}>
          Lancer
        </button>
        <button type="button" disabled={pending} className={LIGHT} onClick={() => setAsking((a) => !a)}>Renvoyer…</button>
      </div>
      {asking && (
        <div className="flex gap-2">
          <input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Motif, lu par le restaurateur" className={`${INPUT} flex-1`} />
          <button type="button" disabled={pending} className={DARK} onClick={() => run(() => sendBackAction(requestId, reason))}>Envoyer</button>
        </div>
      )}
      {feedback}
    </div>
  );
}

export function PrepareButton({ requestId }: { requestId: string }) {
  const { pending, run, feedback } = useAction();
  return (
    <div className="space-y-1">
      <button type="button" disabled={pending} className={LIGHT} onClick={() => run(() => prepareAction(requestId))}>{pending ? "…" : "Préparer chez Meta"}</button>
      {feedback}
    </div>
  );
}

export function InvoiceForm({ noticeId }: { noticeId: string }) {
  const [num, setNum] = useState("");
  const { pending, run, feedback } = useAction();
  return (
    <div className="space-y-1">
      <div className="flex gap-2">
        <input value={num} onChange={(e) => setNum(e.target.value)} placeholder="N° Accountable" className={`${INPUT} flex-1`} />
        <button type="button" disabled={pending} className={DARK} onClick={() => run(() => invoiceAction(noticeId, num))}>Émise</button>
      </div>
      {feedback}
    </div>
  );
}

export function AttachForm({ campaignId, restaurants }: { campaignId: string; restaurants: { id: string; name: string; clientCode: string }[] }) {
  const [rid, setRid] = useState(restaurants[0]?.id ?? "");
  const { pending, run, feedback } = useAction();
  return (
    <div className="space-y-1">
      <div className="flex gap-2">
        <select value={rid} onChange={(e) => setRid(e.target.value)} className={`${INPUT} flex-1`}>
          {restaurants.map((r) => <option key={r.id} value={r.id}>{r.clientCode} · {r.name}</option>)}
        </select>
        <button type="button" disabled={pending || !rid} className={LIGHT} onClick={() => run(() => attachAction(campaignId, rid))}>Rattacher</button>
      </div>
      {feedback}
    </div>
  );
}

export function IdentityForm({ restaurantId, pages, instagram, currentPage, currentIg }: { restaurantId: string; pages: { id: string; name: string }[]; instagram: { id: string; username: string }[]; currentPage: string | null; currentIg: string | null }) {
  const findPage = pages.find((p) => p.name === currentPage);
  const findIg = instagram.find((i) => i.username === currentIg);
  const [page, setPage] = useState(findPage ? `${findPage.id}|${findPage.name}` : "");
  const [ig, setIg] = useState(findIg ? `${findIg.id}|${findIg.username}` : "");
  const { pending, run, feedback } = useAction();
  return (
    <div className="space-y-1">
      <div className="flex flex-wrap gap-2">
        <select value={page} onChange={(e) => setPage(e.target.value)} className={`${INPUT} flex-1`} aria-label="Page Facebook">
          <option value="">Page Facebook…</option>
          {pages.map((p) => <option key={p.id} value={`${p.id}|${p.name}`}>{p.name}</option>)}
        </select>
        <select value={ig} onChange={(e) => setIg(e.target.value)} className={`${INPUT} flex-1`} aria-label="Compte Instagram">
          <option value="">Sans Instagram</option>
          {instagram.map((i) => <option key={i.id} value={`${i.id}|${i.username}`}>@{i.username}</option>)}
        </select>
        <button type="button" disabled={pending || !page} className={LIGHT} onClick={() => run(() => identityAction(restaurantId, page, ig))}>Enregistrer</button>
      </div>
      {feedback}
    </div>
  );
}

export function SyncNow() {
  const { pending, run, feedback } = useAction();
  return (
    <div className="flex items-center gap-2">
      <button type="button" disabled={pending} className={LIGHT} onClick={() => run(syncNowAction)}>{pending ? "Lecture…" : "Lire Meta maintenant"}</button>
      {feedback}
    </div>
  );
}
