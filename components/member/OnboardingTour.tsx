"use client";

import { useEffect } from "react";
import { driver } from "driver.js";
import "driver.js/dist/driver.css";

const TOUR_KEY = "tour_done";

export function OnboardingTour() {
  useEffect(() => {
    if (localStorage.getItem(TOUR_KEY)) return;

    const driverObj = driver({
      popoverClass: "belchicken-popover",
      allowClose: false,
      showProgress: true,
      progressText: "{{current}} / {{total}}",
      nextBtnText: "Suivant →",
      prevBtnText: "← Retour",
      doneBtnText: "C'est parti ! 🔥",
      onDestroyStarted: () => {
        localStorage.setItem(TOUR_KEY, "true");
        driverObj.destroy();
      },
      steps: [
        {
          element: "#tour-nav-commande",
          popover: {
            title: "Scanne ton ticket 📸",
            description: "Après chaque visite, prends ton ticket en photo ici.",
            side: "top",
            align: "center",
          },
        },
        {
          element: "#tour-nav-actions",
          popover: {
            title: "Gagne des jetons ⭐",
            description: "Laisse un avis Google, suis-nous sur les réseaux. Chaque action = un jeton.",
            side: "top",
            align: "center",
          },
        },
        {
          element: "#tour-nav-recompenses",
          popover: {
            title: "Tes cadeaux 🎁",
            description: "Retrouve ici ce que tu gagnes sur ta prochaine visite.",
            side: "top",
            align: "center",
          },
        },
        {
          element: "#tour-community-progress",
          popover: {
            title: "La force de ton équipe ⚡",
            description: "Plus votre équipe commande, plus vos cadeaux grossissent.",
            side: "top",
            align: "center",
          },
        },
        {
          element: "#tour-nav-classement",
          popover: {
            title: "Qui mène la course ? 🏆",
            description: "Vois le score de toutes les communautés en temps réel.",
            side: "top",
            align: "center",
          },
        },
      ],
    });

    // Léger délai pour que le DOM soit prêt (nav fixe rendu côté client)
    const t = setTimeout(() => driverObj.drive(), 600);
    return () => clearTimeout(t);
  }, []);

  return null;
}
