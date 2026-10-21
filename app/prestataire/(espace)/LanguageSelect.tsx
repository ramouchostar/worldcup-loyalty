"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { LOCALES, LOCALE_LABEL, type Locale } from "@/lib/i18n/core";
import { useT } from "@/components/i18n/I18nProvider";

// ADR 0084 §5 terdecies — le prestataire choisit sa langue ; elle est enregistrée sur sa fiche et vaut aussi pour ses e-mails.
export function LanguageSelect({ current }: { current: Locale }) {
  const router = useRouter();
  const { t } = useT();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);

  async function change(locale: string) {
    setBusy(true);
    setError(false);
    try {
      const res = await fetch("/api/prestataire/langue", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ locale }) });
      if (res.ok) router.refresh();
      else setError(true);
    } catch {
      setError(true);
    } finally {
      setBusy(false);
    }
  }

  return (
    <span className="inline-flex flex-col items-end">
      <label className="sr-only" htmlFor="provider-locale">
        {t("lang.label")}
      </label>
      <select
        id="provider-locale"
        value={current}
        disabled={busy}
        onChange={(e) => change(e.target.value)}
        className="min-h-[44px] rounded-lg bg-white/10 text-white text-[13px] px-2 border border-white/20"
      >
        {LOCALES.map((l) => (
          <option key={l} value={l} className="text-ink">
            {LOCALE_LABEL[l]}
          </option>
        ))}
      </select>
      {error && (
        <span role="alert" className="text-[11px] text-white/80">
          {t("lang.error")}
        </span>
      )}
    </span>
  );
}
