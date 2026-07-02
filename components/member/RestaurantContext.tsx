"use client";

import { createContext, useContext } from "react";

// ADR 0015 §8 (nuance technique) — le nom affiché doit être celui de
// l'établissement consulté, plus jamais un "Belchicken" codé en dur.
// Fourni par app/r/[restaurantId]/layout.tsx (serveur), consommé par les
// pages client via useRestaurantInfo().
type RestaurantContextValue = { id: string; name: string };

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
