"use client";

import { useEffect } from "react";
import { setMemberStatus, type MemberStatus } from "@/lib/analytics";
import { flushEvents } from "@/lib/analytics-pending";

/**
 * À monter dans un layout qui a déjà résolu la session — sa présence à l'écran
 * vaut donc preuve d'authentification.
 *
 * Deux effets : elle qualifie le visiteur (`member_status`) pour tous les
 * événements suivants, et elle libère l'événement `sign_up` / `login` mis en
 * attente par le formulaire (voir lib/analytics-pending.ts).
 *
 * `status` reste volontairement grossier — c'est une dimension de segmentation,
 * jamais un identifiant (ADR 0025 : aucun identifiant de membre n'est
 * transmis à Google).
 */
export function AnalyticsIdentity({ status }: { status: MemberStatus }) {
  useEffect(() => {
    setMemberStatus(status);
    flushEvents();
  }, [status]);

  return null;
}
