"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

// ADR 0068 §4 — tant qu'un audit tourne, la page se relit toutes les 5 secondes.
export function AutoRefresh({ active }: { active: boolean }) {
  const router = useRouter();
  useEffect(() => {
    if (!active) return;
    const t = setInterval(() => router.refresh(), 5000);
    return () => clearInterval(t);
  }, [active, router]);
  return null;
}
