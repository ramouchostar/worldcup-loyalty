"use client";

import { useState, useEffect } from "react";

interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

export function InstallBanner() {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);

  useEffect(() => {
    const handler = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
    };
    window.addEventListener("beforeinstallprompt", handler);

    const onInstalled = () => setDeferredPrompt(null);
    window.addEventListener("appinstalled", onInstalled);

    return () => {
      window.removeEventListener("beforeinstallprompt", handler);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  async function install() {
    if (!deferredPrompt) return;
    await deferredPrompt.prompt();
    setDeferredPrompt(null);
  }

  if (!deferredPrompt) return null;

  return (
    <div className="bg-brand-dark border border-gray-700 rounded-xl p-4 flex items-center gap-3">
      <span className="text-2xl shrink-0">📲</span>
      <div className="flex-1 min-w-0">
        <p className="font-semibold text-white text-sm">Ajouter à l&apos;écran d&apos;accueil</p>
        <p className="text-xs text-gray-400 mt-0.5">Accès rapide + notifications push</p>
      </div>
      <div className="flex items-center gap-2 shrink-0">
        <button
          onClick={install}
          className="bg-brand-gold text-brand-dark text-xs font-bold px-3 py-2 rounded-lg hover:opacity-90 transition-opacity"
        >
          Installer
        </button>
        <button
          onClick={() => setDeferredPrompt(null)}
          aria-label="Fermer"
          className="text-gray-500 hover:text-gray-300 text-xl leading-none px-1"
        >
          ×
        </button>
      </div>
    </div>
  );
}
