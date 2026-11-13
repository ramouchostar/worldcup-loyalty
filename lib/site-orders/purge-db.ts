// ADR 0099 §7 — la purge côté base (service role). Une table absente (migration pas appliquée) se dit « rien à purger ».

import { createAdminClient } from "../supabase";
import { ERASED_NAME, type PurgeDb } from "./purge";

const isMissingTable = (error: { code?: string; message?: string } | null) =>
  !!error && (error.code === "PGRST205" || error.code === "42P01" || (/site_orders/.test(error.message ?? "") && /(does not exist|Could not find the table)/i.test(error.message ?? "")));

/** Une commande « porte encore » des données si son téléphone existe ou si son prénom n'est pas déjà effacé. */
const STILL_HOLDS = `phone.not.is.null,first_name.neq.${ERASED_NAME}`;

export function supabasePurgeDb(): PurgeDb {
  const admin = createAdminClient();
  return {
    async count(cutoffIso) {
      const { count, error } = await admin.from("site_orders").select("id", { count: "exact", head: true }).lt("created_at", cutoffIso).or(STILL_HOLDS);
      if (error) {
        if (isMissingTable(error)) return null;
        throw new Error(`site_orders (purge, compte) : ${error.message}`);
      }
      return count ?? 0;
    },
    async erase(cutoffIso) {
      const { data, error } = await admin.from("site_orders").update({ first_name: ERASED_NAME, phone: null }).lt("created_at", cutoffIso).or(STILL_HOLDS).select("id");
      if (error) {
        if (isMissingTable(error)) return null;
        throw new Error(`site_orders (purge, effacement) : ${error.message}`);
      }
      return (data ?? []).length;
    },
  };
}
