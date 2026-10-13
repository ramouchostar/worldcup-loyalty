"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Check, Copy } from "lucide-react";
import { Card, SectionLabel } from "@/components/admin/ui";
import { whatsappShareUrl } from "@/lib/mission-team-message";
import type { TeamNoticeState } from "@/lib/mission-dates";

// ADR 0084 §5 — « Prévenir mon équipe » : le message est prêt à partager, et le restaurateur confirme
// quand c'est fait (l'heure est gardée). Une semaine à l'avance : les étudiants ne travaillent pas
// toute la semaine, à deux jours c'est trop tard — l'écran le dit quand on y est presque ou qu'on y est.

const NOTICE: Record<TeamNoticeState, { text: string; tone: string }> = {
  early: { text: "Tu as jusqu'à 7 jours avant le tournage pour prévenir ton équipe. Plus tôt, c'est mieux.", tone: "text-ink-muted" },
  due: { text: "C'est le moment : le tournage est dans 7 jours. Prévenir ton équipe aujourd'hui, c'est laisser le temps aux étudiants de s'organiser.", tone: "text-warn font-semibold" },
  late: { text: "Ton équipe doit être prévenue au plus vite : à moins de 7 jours, certains ne seront peut-être pas disponibles.", tone: "text-danger font-semibold" },
  notified: { text: "Ton équipe est prévenue.", tone: "text-good font-semibold" },
};

export function TeamNotice({ restaurantId, missionId, message, state }: { restaurantId: string; missionId: string; message: string; state: TeamNoticeState }) {
  const router = useRouter();
  const [copied, setCopied] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function confirm() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/missions/${missionId}/team-notified`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ restaurantId }) });
      const body = await res.json().catch(() => ({}));
      if (res.ok) {
        router.refresh();
        return;
      }
      setError(body.error ?? "Impossible pour le moment. Réessaie.");
    } catch {
      setError("Pas de connexion. Réessaie dans un instant.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card className="space-y-4">
      <SectionLabel>Prévenir mon équipe</SectionLabel>
      <p className={`text-[13.5px] ${NOTICE[state].tone}`}>{NOTICE[state].text}</p>
      <pre className="whitespace-pre-wrap font-sans text-[13.5px] text-ink bg-paper-subtle rounded-xl p-3 border border-paper-border">{message}</pre>
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => {
            navigator.clipboard?.writeText(message);
            setCopied(true);
          }}
          className="inline-flex items-center gap-1.5 min-h-[44px] px-4 rounded-lg border border-paper-border bg-white text-[14px] font-semibold text-ink"
        >
          {copied ? <Check className="w-4 h-4" aria-hidden /> : <Copy className="w-4 h-4" aria-hidden />} {copied ? "Copié" : "Copier"}
        </button>
        <a href={whatsappShareUrl(message)} target="_blank" rel="noopener noreferrer" className="inline-flex items-center min-h-[44px] px-4 rounded-lg bg-[#25D366] text-white text-[14px] font-semibold">
          Partager par WhatsApp
        </a>
      </div>
      {state !== "notified" && (
        <>
          {error && (
            <p role="alert" className="text-danger text-[13px] font-semibold">
              {error}
            </p>
          )}
          <button type="button" disabled={busy} onClick={confirm} className="w-full min-h-[44px] px-4 rounded-xl bg-ink text-white text-[14px] font-semibold disabled:opacity-60">
            {busy ? "…" : "J'ai prévenu mon équipe"}
          </button>
        </>
      )}
    </Card>
  );
}
