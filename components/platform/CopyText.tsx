"use client";

import { useState } from "react";

// Bouton « Copier » d'un message WhatsApp de /platform/ca. Le presse-papiers
// peut être refusé (navigateur, iframe) : on sélectionne alors le texte pour
// une copie à la main, jamais d'échec muet.
export function CopyText({ targetId, label = "Copier" }: { targetId: string; label?: string }) {
  const [state, setState] = useState<"idle" | "copied" | "selected">("idle");

  function selectTarget(el: HTMLElement) {
    const range = document.createRange();
    range.selectNodeContents(el);
    const sel = window.getSelection();
    sel?.removeAllRanges();
    sel?.addRange(range);
    setState("selected");
  }

  async function copy() {
    const el = document.getElementById(targetId);
    if (!el) return;
    try {
      await navigator.clipboard.writeText(el.innerText);
      setState("copied");
    } catch {
      selectTarget(el);
    }
    setTimeout(() => setState("idle"), 1600);
  }

  return (
    <button
      type="button"
      onClick={copy}
      className="rounded-lg border border-gray-300 dark:border-gray-700 font-semibold text-xs px-3 py-2 text-gray-700 dark:text-gray-200"
    >
      {state === "copied" ? "Copié" : state === "selected" ? "Sélectionné, copie-le" : label}
    </button>
  );
}
