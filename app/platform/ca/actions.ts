"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createServerSupabaseClient } from "@/lib/supabase";
import { deleteDailyEntry, saveDailyEntry } from "@/lib/daily-revenue";
import { OUTCOMES, isDay, outcomeHasAmount, outcomeWasAsked, parseAmount, parseTime, type Outcome } from "@/lib/daily-revenue-model";

// Même garde locale que app/platform/crm/actions.ts : une Server Action n'est
// pas protégée par le layout, elle revérifie le super-admin elle-même.
async function guard() {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const { data: profile } = await supabase.from("profiles").select("is_super_admin").eq("id", user.id).single();
  if (!profile?.is_super_admin) redirect("/join?reason=platform-required");
  return user;
}

function back(params: Record<string, string>): never {
  revalidatePath("/platform/ca");
  redirect(`/platform/ca?${new URLSearchParams(params)}`);
}

const text = (v: FormDataEntryValue | null, max = 300): string | null => {
  const s = String(v ?? "").trim();
  return s ? s.slice(0, max) : null;
};

export async function saveDay(formData: FormData) {
  const user = await guard();
  const r = text(formData.get("r"), 80) ?? "";
  const day = text(formData.get("jour"), 10);
  const outcome = text(formData.get("issue"), 20) as Outcome | null;
  if (!r || !isDay(day) || !outcome || !OUTCOMES.includes(outcome)) back({ r, erreur: "Jour ou issue manquant." });

  const withAmount = outcomeHasAmount(outcome);
  const amount = withAmount ? parseAmount(text(formData.get("montant"))) : null;
  if (withAmount && amount === null) back({ r, jour: day, erreur: "Montant illisible : tape par exemple 1240 ou 1 240,50." });
  const ticketsRaw = withAmount ? Number(text(formData.get("tickets")) ?? "") : NaN;

  try {
    await saveDailyEntry(
      r,
      {
        sales_day: day,
        outcome,
        amount,
        tickets: Number.isInteger(ticketsRaw) && ticketsRaw > 0 ? ticketsRaw : null,
        asked_at: outcomeWasAsked(outcome) ? parseTime(text(formData.get("envoye"))) : null,
        replied_at: withAmount && outcome !== "historique" ? parseTime(text(formData.get("repondu"))) : null,
        note: text(formData.get("note")),
      },
      user.id,
    );
  } catch (e) {
    const msg = (e as Error).message;
    // Fail-open : sans la migration 20261008-1000, la base refuse « De lui-même ».
    if (outcome === "spontane" && /check constraint/i.test(msg)) {
      back({ r, jour: day, erreur: "« De lui-même » pas encore accepté par la base : appliquer docs/migrations/20261008-1000-ca-du-jour-de-lui-meme.sql dans Supabase." });
    }
    back({ r, jour: day, erreur: `Pas enregistré : ${msg}` });
  }
  back({ r, jour: day, ok: "1" });
}

export async function deleteDay(formData: FormData) {
  await guard();
  const r = text(formData.get("r"), 80) ?? "";
  const day = text(formData.get("jour"), 10);
  if (!r || !isDay(day)) back({ r });
  try {
    await deleteDailyEntry(r, day);
  } catch (e) {
    back({ r, erreur: `Pas supprimé : ${(e as Error).message}` });
  }
  back({ r, supprime: day });
}
