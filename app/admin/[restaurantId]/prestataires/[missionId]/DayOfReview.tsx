"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ExternalLink } from "lucide-react";
import { Card, SectionLabel } from "@/components/admin/ui";
import { formatDuration, linkHost } from "@/lib/mission-dayof";

// ADR 0084 §5 — le jour J, côté restaurateur : relire le compte-rendu (le confirmer ou le contester, avec
// une raison), voir la livraison (la destination de chaque lien est dite AVANT de cliquer), la valider.

async function post(url: string, body: unknown): Promise<{ ok: boolean; data: Record<string, unknown> }> {
  const res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  return { ok: res.ok, data: await res.json().catch(() => ({})) };
}

const primary = "w-full inline-flex items-center justify-center min-h-[44px] px-5 rounded-xl bg-boost-olive text-white text-[14px] font-semibold shadow-[inset_0_-3px_0_#4F5C2D] hover:brightness-95 disabled:opacity-60";

export type ReportView = { arrival: string; end: string; durationMinutes: number | null; missing: string[]; note: string; overrunMinutes: number };

export function ReportReview({
  restaurantId,
  missionId,
  providerName,
  report,
  state,
  contestNote,
}: {
  restaurantId: string;
  missionId: string;
  providerName: string;
  report: ReportView;
  state: "pending" | "confirmed" | "contested";
  contestNote: string | null;
}) {
  const router = useRouter();
  const [contesting, setContesting] = useState(false);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function answer(contest: boolean) {
    setBusy(true);
    setError(null);
    try {
      const r = await post(`/api/admin/missions/${missionId}/report-response`, { restaurantId, contest, note });
      if (r.ok) return router.refresh();
      setError((r.data.error as string) ?? "Impossible pour le moment. Réessaie.");
    } catch {
      setError("Pas de connexion. Réessaie dans un instant.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card className="space-y-4">
      <SectionLabel>Compte-rendu du tournage</SectionLabel>
      <dl className="grid grid-cols-2 gap-3 text-[14px]">
        <div>
          <dt className="text-ink-faint text-[12px]">Arrivée de {providerName}</dt>
          <dd className="text-ink font-semibold">{report.arrival}</dd>
        </div>
        <div>
          <dt className="text-ink-faint text-[12px]">Fin</dt>
          <dd className="text-ink font-semibold">{report.end}</dd>
        </div>
        {report.durationMinutes !== null && (
          <div className="col-span-2">
            <dt className="text-ink-faint text-[12px]">Durée sur place</dt>
            <dd className="text-ink font-semibold">{formatDuration(report.durationMinutes)}</dd>
          </div>
        )}
      </dl>
      {report.missing.length > 0 && (
        <div>
          <p className="text-[12px] text-ink-faint">Ce qui a manqué</p>
          <ul className="list-disc pl-5 text-[14px] text-ink">
            {report.missing.map((m) => (
              <li key={m}>{m}</li>
            ))}
          </ul>
        </div>
      )}
      {report.note && <p className="text-[14px] text-ink whitespace-pre-line">{report.note}</p>}

      {state === "confirmed" && <p className="text-[13.5px] text-good font-semibold">Tu as confirmé ce compte-rendu.</p>}
      {state === "contested" && (
        <div className="space-y-1">
          <p className="text-[13.5px] text-warn font-semibold">Tu as contesté ce compte-rendu : Boosteats a été prévenu et te recontacte.</p>
          {contestNote && <p className="text-[13.5px] text-ink-muted whitespace-pre-line">Ta version : {contestNote}</p>}
        </div>
      )}

      {state === "pending" && (
        <div className="space-y-3 border-t border-paper-border pt-4">
          {error && (
            <p role="alert" className="text-danger text-[13px] font-semibold">
              {error}
            </p>
          )}
          {!contesting ? (
            <>
              <button type="button" disabled={busy} onClick={() => answer(false)} className={primary}>
                {busy ? "…" : "C'est exact, je confirme"}
              </button>
              <button type="button" onClick={() => setContesting(true)} className="text-[13.5px] font-semibold text-ink underline underline-offset-2 min-h-[44px]">
                Ce n&apos;est pas exact
              </button>
            </>
          ) : (
            <div className="space-y-3">
              <label htmlFor="contest" className="block text-[14px] font-semibold text-ink">Qu&apos;est-ce qui n&apos;est pas exact ?</label>
              <textarea
                id="contest"
                value={note}
                onChange={(e) => setNote(e.target.value)}
                rows={3}
                maxLength={1000}
                placeholder="Par exemple : il est arrivé à 10 h 15, pas à 9 h 30."
                className="w-full border border-paper-border rounded-xl px-3 py-2.5 text-[14px] text-ink bg-white focus:outline-none focus-visible:ring-2 focus-visible:ring-boost-olive"
              />
              <div className="flex gap-3">
                <button type="button" onClick={() => setContesting(false)} className="min-h-[44px] px-4 rounded-lg border border-paper-border bg-white text-[14px] font-semibold text-ink">
                  Annuler
                </button>
                <button type="button" disabled={busy} onClick={() => answer(true)} className="flex-1 min-h-[44px] px-4 rounded-lg bg-ink text-white text-[14px] font-semibold disabled:opacity-60">
                  {busy ? "…" : "Envoyer ma version"}
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </Card>
  );
}

export function DeliveryReview({
  restaurantId,
  missionId,
  providerName,
  links,
  message,
  version,
  canValidate,
  validated,
  superseded,
}: {
  restaurantId: string;
  missionId: string;
  providerName: string;
  links: string[];
  message: string | null;
  /** 1, 2 ou 3 : la version livrée. */
  version?: number;
  canValidate: boolean;
  validated: boolean;
  /** Une version plus récente a été livrée : celle-ci n'est plus à valider. */
  superseded?: boolean;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function validate() {
    setBusy(true);
    setError(null);
    try {
      const r = await post(`/api/admin/missions/${missionId}/validate`, { restaurantId });
      if (r.ok) return router.refresh();
      setError((r.data.error as string) ?? "Impossible pour le moment. Réessaie.");
    } catch {
      setError("Pas de connexion. Réessaie dans un instant.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card className="space-y-4">
      <SectionLabel>{version && version > 1 ? `Version ${version} de ${providerName}` : `La livraison de ${providerName}`}{superseded ? " · remplacée" : ""}</SectionLabel>
      <ul className="space-y-2">
        {links.map((l) => (
          <li key={l}>
            <a href={l} target="_blank" rel="noopener noreferrer nofollow" className="flex items-center gap-2 min-h-[44px] px-3 rounded-xl border border-paper-border bg-white text-[14px] text-ink hover:bg-paper-subtle">
              <ExternalLink className="w-4 h-4 shrink-0 text-ink-muted" aria-hidden />
              <span className="flex-1 min-w-0">
                <span className="block font-semibold">Télécharger</span>
                <span className="block text-[12.5px] text-ink-muted truncate">{linkHost(l)}</span>
              </span>
            </a>
          </li>
        ))}
      </ul>
      {message && <p className="text-[14px] text-ink whitespace-pre-line">{message}</p>}
      {superseded ? null : validated ? (
        <p className="text-[13.5px] text-good font-semibold">Tu as validé cette livraison.</p>
      ) : canValidate ? (
        <div className="space-y-3 border-t border-paper-border pt-4">
          <p className="text-[13.5px] text-ink-muted">Regarde tout avant de valider. Si quelque chose ne va pas, demande une retouche plus bas : toutes tes remarques en un seul envoi.</p>
          {error && (
            <p role="alert" className="text-danger text-[13px] font-semibold">
              {error}
            </p>
          )}
          <button type="button" disabled={busy} onClick={validate} className={primary}>
            {busy ? "…" : "Je valide la livraison"}
          </button>
        </div>
      ) : null}
    </Card>
  );
}
