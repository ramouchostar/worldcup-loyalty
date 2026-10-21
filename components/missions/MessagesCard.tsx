"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Lock, Send } from "lucide-react";
import { Card, SectionLabel } from "@/components/admin/ui";
import { MAX_BODY, type Sender } from "@/lib/mission-messages";
import { useT } from "@/components/i18n/I18nProvider";
import { LOCALE_TAG, type Locale } from "@/lib/i18n/core";

// ADR 0084 — la messagerie d'une mission : restaurateur et prestataire s'écrivent ICI, pas par téléphone. Tout est gardé.
// Tant que le travail n'a pas commencé, les numéros, e-mails et liens de messagerie sont masqués (l'écran le dit avant
// d'écrire). Pas de temps réel : le fil se recharge à l'envoi, et un e-mail prévient l'autre (sans le contenu).

export type ThreadMessage = { id: string; sender: Sender; body: string; at: string; masked: boolean };

const whenIn = (iso: string, locale: Locale) => new Date(iso).toLocaleString(LOCALE_TAG[locale], { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "Europe/Brussels" });

export function MessagesCard({
  me,
  otherName,
  messages,
  sendUrl,
  readUrl,
  extra,
  canWrite,
  contactsLocked,
  studio = false,
  unread,
}: {
  me: "restaurant" | "provider";
  otherName: string;
  messages: ThreadMessage[];
  sendUrl: string;
  readUrl: string;
  /** Champs ajoutés aux requêtes (le restaurateur y met son établissement). */
  extra?: Record<string, unknown>;
  canWrite: boolean;
  contactsLocked: boolean;
  /** Design, impression : pas de tournage, donc rien à dire du contact sur place. */
  studio?: boolean;
  unread: number;
}) {
  const router = useRouter();
  const tr = useT();
  const { t, locale } = tr;
  const when = (iso: string) => whenIn(iso, locale);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const end = useRef<HTMLDivElement>(null);

  // Le fil est lu : plus de « non lu », plus d'e-mail de relance. Un échec n'est pas grave (le fil est affiché quand même).
  useEffect(() => {
    if (messages.length === 0) return;
    fetch(readUrl, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...extra }) }).catch(() => undefined);
    end.current?.scrollIntoView({ block: "nearest" });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [messages.length]);

  async function send() {
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const res = await fetch(sendUrl, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...extra, body: text }) });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        setText("");
        if (data.masked) setNotice(t("msg.maskedNotice"));
        router.refresh();
        return;
      }
      setError(tr.err(data, "err.generic"));
    } catch {
      setError(t("err.network"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card className="space-y-4">
      <div>
        <SectionLabel>
          {t("msg.title")}{unread > 0 ? <span className="ml-2 inline-flex items-center rounded-full bg-boost-olive text-white text-[11px] font-bold px-2 py-0.5">{tr.tp("msg.new", unread)}</span> : null}
        </SectionLabel>
        <p className="text-[13px] text-ink-muted mt-1">{t("msg.intro", { name: otherName })}</p>
      </div>

      {messages.length === 0 ? (
        <p className="text-[13.5px] text-ink-muted">{t("msg.empty")}</p>
      ) : (
        <ol className="space-y-3 max-h-[420px] overflow-y-auto pr-1" aria-live="polite">
          {messages.map((m) => {
            const mine = m.sender === me;
            return (
              <li key={m.id} className={`flex flex-col ${mine ? "items-end" : "items-start"}`}>
                <div className={`max-w-[88%] rounded-2xl px-3.5 py-2.5 text-[14px] whitespace-pre-line break-words ${mine ? "bg-boost-olive text-white" : m.sender === "platform" ? "bg-ink text-white" : "bg-paper-subtle text-ink border border-paper-border"}`}>{m.body}</div>
                <span className="text-[11.5px] text-ink-faint mt-1">
                  {mine ? t("msg.you") : m.sender === "platform" ? t("msg.platform") : otherName} · {when(m.at)}
                  {m.masked ? ` · ${t("msg.masked")}` : ""}
                </span>
              </li>
            );
          })}
          <div ref={end} />
        </ol>
      )}

      {canWrite ? (
        <div className="space-y-2">
          {contactsLocked && (
            <p className="text-[12.5px] text-ink-muted inline-flex items-start gap-1.5">
              <Lock className="w-3.5 h-3.5 mt-0.5 shrink-0" aria-hidden /> {t(studio ? "msg.locked.studio" : "msg.locked")}
            </p>
          )}
          <label htmlFor="msg-body" className="sr-only">
            {t("msg.label")}
          </label>
          <textarea id="msg-body" value={text} onChange={(e) => setText(e.target.value)} rows={3} maxLength={MAX_BODY} placeholder={t("msg.placeholder", { name: otherName })} className="w-full border border-paper-border rounded-xl px-3 py-2.5 text-[14px] text-ink bg-white focus:outline-none focus-visible:ring-2 focus-visible:ring-boost-olive" />
          {notice && (
            <p role="status" className="text-warn text-[13px] font-semibold">
              {notice}
            </p>
          )}
          {error && (
            <p role="alert" className="text-danger text-[13px] font-semibold">
              {error}
            </p>
          )}
          <button type="button" disabled={busy || text.trim().length === 0} onClick={send} className="inline-flex items-center justify-center gap-1.5 min-h-[44px] px-5 rounded-xl bg-boost-olive text-white text-[14px] font-semibold shadow-[inset_0_-3px_0_#4F5C2D] hover:brightness-95 disabled:opacity-50">
            <Send className="w-4 h-4" aria-hidden /> {busy ? t("msg.sending") : t("msg.send")}
          </button>
        </div>
      ) : (
        <p className="text-[13px] text-ink-muted">{t("msg.closed")}</p>
      )}
    </Card>
  );
}
