"use client";

import { useEffect, useState } from "react";
import { track } from "@/lib/analytics";

// ADR 0040 — tour de bienvenue visiteur : 3 écrans, montrés UNE fois par
// établissement (localStorage), passables d'un tap. Les cadeaux cités sont
// les vrais paliers du resto (lib/visitor-tour.ts) ; jamais d'euros (ADR 0007).
const seenKey = (restaurantId: string) => `bs_tour_seen:${restaurantId}`;

export function VisitorTour({
  restaurantId,
  restaurantName,
  firstGift,
  bigGift,
}: {
  restaurantId: string;
  restaurantName: string;
  firstGift: string | null;
  bigGift: string | null;
}) {
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState(0);

  useEffect(() => {
    try {
      if (!localStorage.getItem(seenKey(restaurantId))) {
        setOpen(true);
        track("visitor_tour_viewed", { restaurant_id: restaurantId });
      }
    } catch {
      // localStorage indisponible (navigation privée) → pas de tour, pas d'erreur
    }
  }, [restaurantId]);

  function close(completed: boolean) {
    try {
      localStorage.setItem(seenKey(restaurantId), "1");
    } catch {}
    setOpen(false);
    track(completed ? "visitor_tour_completed" : "visitor_tour_skipped", {
      restaurant_id: restaurantId,
    });
  }

  if (!open) return null;

  const slides = [
    {
      emoji: "🎁",
      title: firstGift ? `Gagne un ${firstGift}` : "Gagne des cadeaux",
      text: `…et plein d'autres cadeaux, simplement en commandant chez ${restaurantName} comme d'habitude.`,
    },
    {
      emoji: "⭐",
      title: "Accumule des points",
      text: bigGift
        ? `Chaque ticket scanné fait grandir tes points — de quoi viser un ${bigGift}.`
        : "Chaque ticket scanné fait grandir tes points et ceux de ton équipe.",
    },
    {
      emoji: "🧾",
      title: "Un ticket suffit",
      text: "Prends ton ticket en photo pour commencer. Ton compte ? Seulement au moment de l'envoyer, pour garder tes points.",
    },
  ];
  const last = step === slides.length - 1;
  const s = slides[step];

  return (
    <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-5">
      <div className="w-full max-w-sm bg-white rounded-3xl p-6 text-center shadow-2xl">
        <p className="text-6xl mb-4" aria-hidden="true">{s.emoji}</p>
        <h2 className="text-2xl font-black text-gray-900 mb-2">{s.title}</h2>
        <p className="text-gray-600 text-sm leading-relaxed mb-6">{s.text}</p>

        <div className="flex justify-center gap-1.5 mb-6" aria-hidden="true">
          {slides.map((_, i) => (
            <span
              key={i}
              className={`h-1.5 rounded-full transition-all ${
                i === step ? "w-6 bg-brand-red" : "w-1.5 bg-gray-200"
              }`}
            />
          ))}
        </div>

        <button
          onClick={() => (last ? close(true) : setStep(step + 1))}
          className="w-full bg-brand-red text-white py-3.5 rounded-2xl font-bold text-lg hover:bg-brand-red/85 transition-colors"
        >
          {last ? "C'est parti 🎉" : "Suivant"}
        </button>
        {!last && (
          <button
            onClick={() => close(false)}
            className="mt-3 text-xs text-gray-400 hover:text-gray-600 underline"
          >
            Passer
          </button>
        )}
      </div>
    </div>
  );
}
