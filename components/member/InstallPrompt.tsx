"use client";

import { useEffect, useState } from "react";

interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  readonly userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

const DISMISSED_KEY = "pwa_install_dismissed";

export function InstallPrompt() {
  const [promptEvent, setPromptEvent] = useState<BeforeInstallPromptEvent | null>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    // Already installed (standalone mode) → hide
    if (window.matchMedia("(display-mode: standalone)").matches) return;
    // Already dismissed → hide
    if (sessionStorage.getItem(DISMISSED_KEY)) return;

    function handler(e: Event) {
      e.preventDefault();
      setPromptEvent(e as BeforeInstallPromptEvent);
      setVisible(true);
    }

    window.addEventListener("beforeinstallprompt", handler);
    window.addEventListener("appinstalled", () => setVisible(false));

    return () => window.removeEventListener("beforeinstallprompt", handler);
  }, []);

  async function install() {
    if (!promptEvent) return;
    await promptEvent.prompt();
    const { outcome } = await promptEvent.userChoice;
    if (outcome === "accepted") setVisible(false);
  }

  function dismiss() {
    sessionStorage.setItem(DISMISSED_KEY, "1");
    setVisible(false);
  }

  if (!visible) return null;

  return (
    <div className="bg-brand-dark text-white px-4 py-3 flex items-center gap-3 border-b border-white/10">
      <span className="text-xl shrink-0">📲</span>
      <p className="text-sm flex-1 min-w-0">
        <strong>Installer l&apos;app</strong> pour un accès rapide et les notifications.
      </p>
      <button
        onClick={install}
        className="shrink-0 bg-brand-red text-white text-xs font-bold px-3 py-1.5 rounded-lg hover:bg-red-700 transition-colors"
      >
        Installer
      </button>
      <button
        onClick={dismiss}
        className="shrink-0 text-gray-400 hover:text-white text-xl leading-none transition-colors"
        aria-label="Fermer"
      >
        ×
      </button>
    </div>
  );
}
