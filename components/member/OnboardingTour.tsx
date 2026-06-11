"use client";

import { useState, useEffect } from "react";

const STORAGE_KEY = "onboarding_v1_done";

const SLIDES = [
  {
    emoji: "🏆",
    title: "Bienvenue dans WorldCup Loyalty !",
    body: "Commande directement chez Belchicken et gagne des cadeaux à chaque visite. On t'explique comment ça marche en 4 étapes.",
  },
  {
    emoji: "🧾",
    title: "Soumets ton ticket",
    body: "Après chaque commande, prends en photo ton ticket de caisse depuis l'onglet Commande. On valide automatiquement grâce au numéro Bestelnummer.",
  },
  {
    emoji: "👥",
    title: "Ta communauté, ton équipe",
    body: "Tu soutiens une équipe de la Coupe du Monde. Plus votre communauté commande ensemble, plus les bonus augmentent pour tout le monde.",
  },
  {
    emoji: "🎁",
    title: "Récupère tes cadeaux au comptoir",
    body: "Chaque commande validée débloque des cadeaux selon 3 niveaux : ton cadeau solo, le bonus de ta communauté, et le bonus si ton équipe avance.",
  },
  {
    emoji: "⭐",
    title: "Gagne encore plus avec les jetons",
    body: "Suis-nous sur Instagram, TikTok et Facebook, ou parraine tes amis via WhatsApp. 4 jetons = une portion de 12 Churros offerte !",
  },
];

export function OnboardingTour() {
  const [visible, setVisible] = useState(false);
  const [step, setStep] = useState(0);

  useEffect(() => {
    if (!localStorage.getItem(STORAGE_KEY)) setVisible(true);
  }, []);

  function dismiss() {
    localStorage.setItem(STORAGE_KEY, "1");
    setVisible(false);
  }

  function next() {
    if (step < SLIDES.length - 1) setStep(step + 1);
    else dismiss();
  }

  function prev() {
    if (step > 0) setStep(step - 1);
  }

  if (!visible) return null;

  const slide = SLIDES[step];
  const isLast = step === SLIDES.length - 1;

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="bg-white rounded-3xl w-full max-w-sm shadow-2xl overflow-hidden">
        {/* Progress bar */}
        <div className="flex gap-1 p-4 pb-0">
          {SLIDES.map((_, i) => (
            <div
              key={i}
              className={`h-1 flex-1 rounded-full transition-all duration-300 ${
                i <= step ? "bg-brand-red" : "bg-gray-200"
              }`}
            />
          ))}
        </div>

        {/* Content */}
        <div className="px-6 pt-6 pb-4 text-center min-h-[220px] flex flex-col items-center justify-center">
          <span className="text-6xl mb-4 block">{slide.emoji}</span>
          <h2 className="text-lg font-bold text-gray-900 mb-3 leading-tight">
            {slide.title}
          </h2>
          <p className="text-sm text-gray-600 leading-relaxed">{slide.body}</p>
        </div>

        {/* Actions */}
        <div className="px-6 pb-6 flex items-center gap-3">
          {step > 0 ? (
            <button
              onClick={prev}
              className="px-4 py-3 text-sm font-medium text-gray-500 hover:text-gray-700 transition-colors"
            >
              ← Précédent
            </button>
          ) : (
            <button
              onClick={dismiss}
              className="px-4 py-3 text-sm font-medium text-gray-400 hover:text-gray-600 transition-colors"
            >
              Passer
            </button>
          )}

          <button
            onClick={next}
            className="flex-1 bg-brand-red text-white py-3 rounded-xl font-semibold text-sm hover:bg-red-700 transition-colors"
          >
            {isLast ? "C'est parti ! 🚀" : "Suivant →"}
          </button>
        </div>

        {/* Step indicator */}
        <p className="text-center text-xs text-gray-300 pb-4">
          {step + 1} / {SLIDES.length}
        </p>
      </div>
    </div>
  );
}
