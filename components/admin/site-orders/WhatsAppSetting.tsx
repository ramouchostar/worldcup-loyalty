"use client";

import { useEffect, useState } from "react";
import { Card } from "@/components/admin/ui";
import { readJsonSafe } from "@/lib/fetch-json";
import { TEST_MESSAGE, whatsAppLink } from "@/lib/site-orders/whatsapp";

// ADR 0107 §10 — le numéro WhatsApp de commande : celui où un client envoie sa commande quand le site ne peut pas la prendre.
// Le restaurateur le choisit (le téléphone de sa fiche Google peut être un fixe) et sait qu'il sera MONTRÉ aux clients, à ce
// moment-là seulement. « Tester » ouvre WhatsApp vers ce numéro avec un message d'essai : si WhatsApp s'y ouvre, il est bon.

type View = { number: string | null; display: string | null };

const btn = "min-h-[44px] rounded-lg px-4 py-2 text-[15px] font-semibold focus-visible:outline focus-visible:outline-2 focus-visible:outline-ink";
const ghost = `${btn} border border-paper-border bg-white text-ink hover:border-ink-faint`;
const primary = `${btn} bg-ink text-white hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50`;
const field = "block min-h-[44px] w-full min-w-0 rounded-lg border border-paper-border bg-white px-3 py-2 text-[15px] text-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-ink";

export function WhatsAppSetting({ restaurantId }: { restaurantId: string }) {
  const [saved, setSaved] = useState<View | null>(null);
  const [hidden, setHidden] = useState(false);
  const [value, setValue] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ tone: "good" | "danger"; text: string } | null>(null);

  useEffect(() => {
    let live = true;
    (async () => {
      try {
        const res = await fetch(`/api/admin/site-orders/whatsapp?restaurantId=${encodeURIComponent(restaurantId)}`, { cache: "no-store" });
        const { data } = await readJsonSafe<View>(res);
        if (!live) return;
        if (!res.ok) { setHidden(true); return; } // fermé (404) ou illisible : la page des commandes le dit déjà
        setSaved(data ?? { number: null, display: null });
        setValue(data?.display ?? "");
      } catch {
        if (live) setHidden(true);
      }
    })();
    return () => { live = false; };
  }, [restaurantId]);

  async function save() {
    setBusy(true);
    setMessage(null);
    try {
      const res = await fetch("/api/admin/site-orders/whatsapp", {
        method: "PUT", headers: { "content-type": "application/json" },
        body: JSON.stringify({ restaurantId, number: value }),
      });
      const { data } = await readJsonSafe<View & { error?: string }>(res);
      if (!res.ok || !data) { setMessage({ tone: "danger", text: data?.error ?? "Le numéro n'a pas pu être enregistré. Réessaie." }); return; }
      setSaved({ number: data.number, display: data.display });
      setValue(data.display ?? "");
      setMessage({ tone: "good", text: data.number ? `Enregistré : ${data.display}.` : "Numéro effacé : le secours WhatsApp n'est plus proposé à tes clients." });
    } catch {
      setMessage({ tone: "danger", text: "Le numéro n'a pas pu être enregistré. Vérifie ta connexion et réessaie." });
    } finally {
      setBusy(false);
    }
  }

  if (hidden || saved === null) return null;
  const testLink = whatsAppLink(saved.number, TEST_MESSAGE);
  const changed = value.trim() !== (saved.display ?? "");

  return (
    <Card>
      <h2 className="text-[17px] font-semibold text-ink">Ton numéro WhatsApp de commande</h2>
      <p className="mt-1 text-[13px] text-ink-muted">
        Si l&apos;envoi du site échoue, tes clients t&apos;envoient leur commande à ce numéro, par un message WhatsApp ordinaire. Il leur est montré à ce moment-là seulement.
        {saved.number === null && " Sans numéro, ils sont invités à appeler le restaurant."}
      </p>
      <div className="mt-3 flex flex-wrap items-end gap-2">
        <div className="min-w-[200px] flex-1">
          <label htmlFor="wa-num" className="mb-1 block text-[15px] font-semibold text-ink">Numéro</label>
          <input id="wa-num" type="tel" inputMode="tel" autoComplete="off" value={value} maxLength={24} placeholder="0470 12 34 56" onChange={(e) => { setValue(e.target.value); setMessage(null); }} className={field} />
        </div>
        <button type="button" disabled={busy || !changed} onClick={() => void save()} className={primary}>{busy ? "Enregistrement…" : "Enregistrer"}</button>
        {testLink && !changed && <a href={testLink} target="_blank" rel="noopener noreferrer" className={`${ghost} inline-flex items-center`}>Tester</a>}
      </div>
      {message && <p role={message.tone === "danger" ? "alert" : "status"} className={`mt-2 text-[15px] ${message.tone === "danger" ? "text-danger" : "text-good"}`}>{message.text}</p>}
      {saved.number !== null && !message && !changed && <p className="mt-2 text-[13px] text-ink-muted">Enregistré : {saved.display}. « Tester » ouvre WhatsApp avec un message d&apos;essai.</p>}
    </Card>
  );
}
