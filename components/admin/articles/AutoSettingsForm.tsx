"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import type { KindChoice } from "@/lib/restaurant-posts/auto/overview";
import { ACCEPTANCE_TEXT, KIND_LABEL, type AutoKind } from "@/lib/restaurant-posts/auto/types";
import { readJsonSafe } from "@/lib/fetch-json";
import { ghostBtn, primaryBtn } from "./ui";

// Le réglage de la publication automatique (ADR 0112, maquette) : les occasions, ce qui ne change pas, la phrase qu'on
// accepte une fois, « Activer » ; ensuite, régler ou tout arrêter.

const box = "h-6 w-6 shrink-0 accent-boost-olive";
const row = "flex min-h-[48px] items-start gap-3 py-2 text-[15px] text-ink";

export function AutoSettingsForm({ restaurantId, active, activeSince, initial, choices }: {
  restaurantId: string;
  active: boolean;
  activeSince: string | null;
  initial: AutoKind[];
  choices: KindChoice[];
}) {
  const router = useRouter();
  const [kinds, setKinds] = useState<AutoKind[]>(() => choices.filter((c) => c.available && (active ? initial.includes(c.kind) : true)).map((c) => c.kind));
  const [accepted, setAccepted] = useState(false);
  const [busy, setBusy] = useState<null | "save" | "stop">(null);
  const [confirmStop, setConfirmStop] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const base = `/admin/${restaurantId}/articles`;
  const ready = kinds.length > 0 && (active || accepted) && busy === null;

  async function send(what: "save" | "stop") {
    setBusy(what);
    setError(null);
    try {
      const res =
        what === "stop"
          ? await fetch(`/api/admin/restaurant-posts/auto?restaurantId=${encodeURIComponent(restaurantId)}`, { method: "DELETE" })
          : await fetch("/api/admin/restaurant-posts/auto", {
              method: "POST",
              headers: { "content-type": "application/json" },
              body: JSON.stringify({ restaurantId, kinds, accepted }),
            });
      if (!res.ok) {
        const { data } = await readJsonSafe<{ error?: string }>(res);
        setError(data?.error ?? "Ça n'a pas marché. Réessaie.");
        setBusy(null);
        return;
      }
      router.push(base);
      router.refresh();
    } catch {
      setError("Ça n'a pas marché. Vérifie ta connexion et réessaie.");
      setBusy(null);
    }
  }

  const toggle = (kind: AutoKind, on: boolean) => setKinds((all) => (on ? [...all, kind] : all.filter((k) => k !== kind)));

  return (
    <div className="space-y-4">
      {active && activeSince && <p className="rounded-lg bg-boost-olive/10 px-4 py-3 text-[15px] text-ink"><b className="font-semibold">Activée</b> depuis le {activeSince}.</p>}

      <fieldset className="rounded-lg border border-paper-border bg-white px-4 py-3">
        <legend className="float-left mb-1 w-full text-[15px] font-semibold text-ink">À quelles occasions ?</legend>
        <div className="clear-left">
          {choices.map((c) => (
            <label key={c.kind} className={`${row} ${c.available ? "cursor-pointer" : "cursor-not-allowed"}`}>
              <input type="checkbox" className={box} disabled={!c.available} checked={kinds.includes(c.kind)} onChange={(e) => toggle(c.kind, e.target.checked)} />
              <span>
                <span className={c.available ? "" : "text-ink-muted"}>{KIND_LABEL[c.kind]}</span>
                {c.note && <span className="block text-[13px] text-ink-muted">{c.note}</span>}
              </span>
            </label>
          ))}
        </div>
      </fieldset>

      <div className="space-y-1 rounded-lg bg-paper-subtle px-4 py-3 text-[13px] text-ink">
        <p className="text-[15px] font-semibold">Ce qui ne change pas</p>
        <p>Un article par jour au plus, trois par semaine.</p>
        <p>Les articles n&apos;utilisent que l&apos;occasion, ta carte et les infos de ta page.</p>
        <p>Le message de la veille part à l&apos;adresse e-mail de ton compte. S&apos;il n&apos;arrive pas, rien n&apos;est publié.</p>
        <p>Tu peux retirer un article, ou tout arrêter, à tout moment.</p>
      </div>

      {!active && (
        <label className={`${row} cursor-pointer`}>
          <input type="checkbox" className={box} checked={accepted} onChange={(e) => setAccepted(e.target.checked)} />
          <span>{ACCEPTANCE_TEXT}</span>
        </label>
      )}

      {error && <p role="alert" className="rounded-lg bg-danger/10 px-3 py-2 text-[15px] text-danger">{error}</p>}

      <button type="button" onClick={() => void send("save")} disabled={!ready} className={primaryBtn}>
        {busy === "save" ? "Un instant..." : active ? "Enregistrer" : "Activer"}
      </button>
      {!active ? (
        <Link href={base} className={ghostBtn}>Pas maintenant</Link>
      ) : confirmStop ? (
        <div className="space-y-2 rounded-lg border border-paper-border bg-white p-3">
          <p className="text-[15px] text-ink">Arrêter ? Les articles prévus ne seront pas publiés. Ceux qui sont en ligne le restent.</p>
          <button type="button" onClick={() => void send("stop")} disabled={busy !== null} className={`${ghostBtn} !border-danger !text-danger`}>
            {busy === "stop" ? "Un instant..." : "Oui, arrêter"}
          </button>
          <button type="button" onClick={() => setConfirmStop(false)} disabled={busy !== null} className={ghostBtn}>Garder la publication automatique</button>
        </div>
      ) : (
        <button type="button" onClick={() => setConfirmStop(true)} className={ghostBtn}>Arrêter la publication automatique</button>
      )}
    </div>
  );
}
