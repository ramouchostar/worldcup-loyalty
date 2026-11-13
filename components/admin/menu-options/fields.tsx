"use client";

import { useEffect, useState, type ReactNode } from "react";

// Deux petits champs de l'écran « Options de mes plats » (ADR 0100).

/**
 * Une bulle d'explication : au survol, au clavier (Tab) et au doigt (appui sur le « ? »). Sans l'enfant, elle pose
 * elle-même le petit « ? » ; avec un enfant (un champ, un bouton), elle l'entoure et s'ouvre quand il a le focus.
 */
export function Tip({ text, children, align = "left" }: { text: string; children?: ReactNode; align?: "left" | "right" }) {
  return (
    <span className="group relative inline-flex min-w-0 max-w-full items-center">
      {children ?? (
        <button
          type="button"
          aria-label="Explication"
          className="ml-1 inline-flex h-5 w-5 items-center justify-center rounded-full border border-ink-faint text-[11px] text-ink-muted hover:border-ink hover:text-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-ink"
        >
          ?
        </button>
      )}
      <span
        role="tooltip"
        style={{ maxWidth: "min(270px, 70vw)" }}
        className={`pointer-events-none absolute top-full z-30 mt-1.5 hidden w-max rounded-lg bg-ink px-2.5 py-2 text-left text-[12px] font-normal leading-snug text-white group-hover:block group-focus-within:block ${align === "right" ? "right-0" : "left-0"}`}
      >
        {text}
      </span>
    </span>
  );
}

/** Un texte saisi à la main : la valeur est prise quand on quitte le champ (une modification = un seul changement compté). */
export function TextField({ value, onCommit, ariaLabel, className = "", placeholder, disabled = false }: {
  value: string; onCommit: (v: string) => void; ariaLabel: string; className?: string; placeholder?: string; disabled?: boolean;
}) {
  const [text, setText] = useState(value);
  useEffect(() => setText(value), [value]);
  return (
    <input
      aria-label={ariaLabel}
      placeholder={placeholder}
      disabled={disabled}
      value={text}
      onChange={(e) => setText(e.target.value)}
      onBlur={() => { if (text !== value) onCommit(text); }}
      onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }}
      className={`rounded-lg border border-paper-border bg-white px-2.5 py-1.5 text-[15px] text-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-ink ${className}`}
    />
  );
}

/**
 * Un nombre saisi à la main. Le texte reste ce que la personne tape (« 1, » ou « 1,5 » ne sont pas réécrits à chaque
 * lettre) ; la valeur est prise quand elle quitte le champ ou appuie sur Entrée. La virgule décimale est acceptée.
 * Vide = `null` (« pas encore de prix », « sans limite »).
 */
export function NumberField({
  value, onCommit, ariaLabel, placeholder, className = "", integer = false, min = 0, max,
}: {
  value: number | null;
  onCommit: (v: number | null) => void;
  ariaLabel: string;
  placeholder?: string;
  className?: string;
  integer?: boolean;
  min?: number;
  max?: number;
}) {
  const show = (v: number | null) => (v === null ? "" : String(v).replace(".", ","));
  const [text, setText] = useState(show(value));
  useEffect(() => setText(show(value)), [value]);

  const commit = () => {
    const t = text.replace(/\s/g, "").replace(",", ".");
    if (t === "") { onCommit(null); return; }
    const n = Number(t);
    if (!Number.isFinite(n)) { setText(show(value)); return; }
    let v = integer ? Math.floor(n) : Math.round(n * 100) / 100;
    v = Math.max(min, max === undefined ? v : Math.min(max, v));
    setText(show(v));
    onCommit(v);
  };

  return (
    <input
      inputMode={integer ? "numeric" : "decimal"}
      aria-label={ariaLabel}
      placeholder={placeholder}
      value={text}
      onChange={(e) => setText(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }}
      className={`rounded-lg border border-paper-border bg-white px-2 py-1.5 text-[15px] text-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-ink ${className}`}
    />
  );
}
