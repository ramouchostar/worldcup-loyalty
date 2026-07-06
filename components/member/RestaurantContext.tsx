"use client";

import { createContext, useContext } from "react";

// ADR 0015 §8 (nuance technique) — le nom affiché doit être celui de
// l'établissement consulté, plus jamais un "Belchicken" codé en dur.
// Idem pour les liens sociaux (micro-récompenses) : ceux de l'établissement,
// jamais les variables d'env globales. Fourni par
// app/r/[restaurantId]/layout.tsx (serveur), consommé via useRestaurantInfo().
type RestaurantContextValue = {
  id: string;
  name: string;
  google_maps_url: string | null;
  instagram_url: string | null;
  tiktok_url: string | null;
  facebook_url: string | null;
};

const RestaurantContext = createContext<RestaurantContextValue | null>(null);

export function RestaurantProvider({
  value,
  children,
}: {
  value: RestaurantContextValue;
  children: React.ReactNode;
}) {
  return <RestaurantContext.Provider value={value}>{children}</RestaurantContext.Provider>;
}

export function useRestaurantInfo(): RestaurantContextValue {
  const ctx = useContext(RestaurantContext);
  if (!ctx) throw new Error("useRestaurantInfo doit être utilisé sous RestaurantProvider (/r/[restaurantId])");
  return ctx;
}
