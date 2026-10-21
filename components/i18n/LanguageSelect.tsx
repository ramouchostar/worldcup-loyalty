"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { LOCALES, LOCALE_LABEL, type Locale } from "@/lib/i18n/core";
import { useT } from "./I18nProvider";

// ADR 0084 §5 terdecies — l'utilisateur choisit sa langue ; elle est enregistrée (fiche du prestataire, profil du restaurateur) et vaut aussi pour ses e-mails.
// `tone` : « dark » sur l'en-tête sombre du prestataire, « light » dans la console du restaurateur.
export function LanguageSelect({ current, endpoint, tone = "light" }: { current: Locale; endpoint: string; tone?: "dark" | "light" }) {
  const router = useRouter();
  const { t } = useT();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);

  async function change(locale: string) {
    setBusy(true);
    setError(false);
    try {
      const res = await fetch(endpoint, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ locale }) });
      if (res.ok) router.refresh();
      else setError(true);
    } catch {
      setError(true);
    } finally {
      setBusy(false);
    }
  }

  const select = tone === "dark" ? "bg-white/10 text-white border-white/20" : "bg-white text-ink border-paper-border";
  return (
    <span className="inline-flex flex-col items-end">
      <label className="sr-only" htmlFor="user-locale">
        {t("lang.label")}
      </label>
      <select id="user-locale" value={current} disabled={busy} onChange={(e) => change(e.target.value)} className={`min-h-[44px] rounded-lg text-[13px] px-2 border ${select}`}>
        {LOCALES.map((l) => (
          <option key={l} value={l} className="text-ink">
            {LOCALE_LABEL[l]}
          </option>
        ))}
      </select>
      {error && (
        <span role="alert" className={`text-[11px] ${tone === "dark" ? "text-white/80" : "text-danger"}`}>
          {t("lang.error")}
        </span>
      )}
    </span>
  );
}
