"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { deleteCallback, revokeToken } from "@/lib/hubrise/api";
import { superAdminId } from "@/lib/hubrise/guard";
import { activeConnection, closeConnection, journal, readToken, saveReference, syncDay } from "@/lib/hubrise/store";
import { addDays, isDay, parseAmount } from "@/lib/daily-revenue-model";
import { todayInBrussels } from "@/lib/qr-funnel";

// ADR 0102 — actions HubRise de /platform/ca. Une Server Action n'est pas
// protégée par le layout : chacune revérifie le super-admin.

async function guard(): Promise<string> {
  const id = await superAdminId();
  if (!id) redirect("/join?reason=platform-required");
  return id;
}

function back(params: Record<string, string>): never {
  revalidatePath("/platform/ca");
  redirect(`/platform/ca?${new URLSearchParams(params)}#hubrise`);
}

const field = (f: FormData, k: string, max = 80) => String(f.get(k) ?? "").trim().slice(0, max);

/** Relit aujourd'hui et les deux jours précédents (pratique pendant le pilote). */
export async function hubriseSyncNow(formData: FormData) {
  await guard();
  const r = field(formData, "r");
  const found = await activeConnection(r);
  if (found.missing || !found.connection) back({ r, erreur: "Aucune connexion HubRise active pour cet établissement." });
  const today = todayInBrussels();
  let seen = 0;
  let missed = 0;
  try {
    for (const d of [addDays(today, -2), addDays(today, -1), today]) {
      const res = await syncDay(found.connection, d);
      seen += res.seen;
      missed += res.missedByCallback;
    }
  } catch (e) {
    back({ r, erreur: `Relecture HubRise impossible : ${(e as Error).message}` });
  }
  back({ r, hubrise: `relu-${seen}-${missed}` });
}

export async function hubriseDisconnect(formData: FormData) {
  await guard();
  const r = field(formData, "r");
  const found = await activeConnection(r);
  if (found.missing || !found.connection) back({ r });
  const conn = found.connection;
  // Côté HubRise d'abord (best-effort : un jeton déjà révoqué ne bloque pas).
  try {
    const token = await readToken(conn.id);
    if (token) {
      await deleteCallback(token).catch(() => undefined);
      await revokeToken(token).catch(() => undefined);
    }
  } catch {
    /* le coffre peut déjà être vide */
  }
  await closeConnection(conn.id);
  await journal("disconnected", {}, conn.id);
  back({ r, hubrise: "deconnecte" });
}

/** Chiffre de référence d'un canal pour un jour (relevé Uber Eats Manager…). */
export async function hubriseSaveReference(formData: FormData) {
  const userId = await guard();
  const r = field(formData, "r");
  const day = field(formData, "jour", 10);
  const channel = field(formData, "canal", 20);
  const amount = parseAmount(field(formData, "montant", 30));
  if (!isDay(day) || !["uber", "deliveroo", "takeaway"].includes(channel)) back({ r, erreur: "Jour ou canal manquant." });
  if (amount === null) back({ r, erreur: "Montant illisible : tape par exemple 266,40." });
  try {
    await saveReference({ restaurantId: r, day, channel, amount, source: field(formData, "source", 60) || "relevé", userId });
  } catch (e) {
    back({ r, erreur: `Référence pas enregistrée : ${(e as Error).message}` });
  }
  back({ r, hubrise: "reference" });
}
