"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createServerSupabaseClient } from "@/lib/supabase";
import { isEstablishmentAdmin } from "@/lib/admin-guard";
import { saveConsoleEntry } from "@/lib/daily-revenue";
import { CHANNELS, isEditableDay, parseEntry, type ChannelKey } from "@/lib/daily-revenue-entry";
import { todayInBrussels } from "@/lib/qr-funnel";

// ADR 0087 §1-2 — le restaurateur note son CA du jour. Une Server Action n'est
// pas protégée par le layout : elle revérifie l'accès console elle-même.

const text = (v: FormDataEntryValue | null, max = 40): string => String(v ?? "").trim().slice(0, max);

export async function saveCaDay(formData: FormData) {
  const restaurantId = text(formData.get("r"), 80);
  const day = text(formData.get("jour"), 10);
  const page = `/admin/${restaurantId}/ca/${day}`;

  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login?reason=login-required");
  if (!restaurantId || !(await isEstablishmentAdmin(user.id, restaurantId))) redirect("/join");
  if (!isEditableDay(day, todayInBrussels())) redirect(`/admin/${restaurantId}`);

  const channels: Partial<Record<ChannelKey, string>> = {};
  for (const c of CHANNELS) channels[c.key] = text(formData.get(`canal_${c.key}`));
  const parsed = parseEntry({
    closed: formData.get("ferme") === "1",
    channels,
    total: text(formData.get("total")),
    orders: text(formData.get("commandes"), 10),
  });
  if (!parsed.ok) redirect(`${page}?${new URLSearchParams({ modifier: "1", erreur: parsed.error })}`);

  try {
    await saveConsoleEntry(
      restaurantId,
      day,
      parsed.closed ? { closed: true } : { closed: false, amount: parsed.amount, tickets: parsed.tickets, channels: parsed.channels },
      user.id,
    );
  } catch (e) {
    console.error("[ca-du-jour] enregistrement refusé :", (e as Error).message);
    redirect(`${page}?${new URLSearchParams({ modifier: "1", erreur: "Pas enregistré : réessaie dans un instant. Si ça recommence, préviens-nous." })}`);
  }

  revalidatePath(`/admin/${restaurantId}`);
  redirect(`${page}?ok=1`);
}
