"use server";

import { revalidatePath } from "next/cache";
import { createServerSupabaseClient, createAdminClient } from "@/lib/supabase";
import { sanitizeZones } from "@/lib/zones";
import { recordConsents } from "@/lib/consent";
import { recordOptOut, removeOptOut } from "@/lib/message-log";
import { MEMBER_SEQUENCE_KEYS } from "@/lib/message-catalog";

function ageFromISO(d: string): number | null {
  const dt = new Date(d);
  if (isNaN(dt.getTime())) return null;
  const now = new Date();
  let age = now.getFullYear() - dt.getFullYear();
  const m = now.getMonth() - dt.getMonth();
  if (m < 0 || (m === 0 && now.getDate() < dt.getDate())) age--;
  return age;
}

// ADR 0047 — « Mon profil » : le port d'attache des infos DIFFÉRÉES de
// l'inscription (prénom, zones, date de naissance). Tout est facultatif —
// chaque champ est demandé là où il sert, jamais exigé en bloc.
export async function updateMemberProfile(
  _prev: { error?: string; success?: string } | null,
  formData: FormData
): Promise<{ error?: string; success?: string }> {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Non authentifié. Reconnecte-toi puis réessaie." };

  const displayName = ((formData.get("display_name") as string) ?? "").trim().slice(0, 60);
  const zones = sanitizeZones(formData.getAll("zones"));
  const birthDate = ((formData.get("birth_date") as string) ?? "").trim();
  const parentalEmail = ((formData.get("parental_email") as string) ?? "").trim();

  let isMinor: boolean | null = null;
  if (birthDate !== "") {
    const age = ageFromISO(birthDate);
    if (age === null || age < 0 || age > 120) return { error: "Indique une date de naissance valide." };
    isMinor = age < 13;
    // ADR 0025 — moins de 13 ans : consentement parental requis dès que
    // la date le révèle.
    if (isMinor && !parentalEmail) {
      return { error: "Un email d'un parent est requis pour les moins de 13 ans." };
    }
  }

  const admin = createAdminClient();
  const { error } = await admin
    .from("profiles")
    .update({
      display_name: displayName, // NOT NULL DEFAULT '' (m2) : un prénom effacé reste ''
      zones,
      birth_date: birthDate || null,
      ...(isMinor !== null
        ? {
            is_minor: isMinor,
            parental_consent_status: isMinor ? "pending" : "none",
            parental_email: isMinor ? parentalEmail : null,
          }
        : {}),
    })
    .eq("id", user.id);
  if (error) return { error: "Erreur lors de l'enregistrement. Réessaie." };

  // Consentement « zones » (ADR 0022) acté à la première déclaration —
  // c'est le moment où la donnée existe, pas avant.
  if (zones.length > 0) {
    try {
      await recordConsents(user.id, { zones: true }, "profile", admin);
    } catch {}
  }

  revalidatePath("/compte");
  return { success: "Profil enregistré." };
}

// ADR 0063 §2 — « Mes e-mails » : le membre coupe ou rallume chaque rappel du
// programme lui-même, sans quitter le programme. Seules les séquences membres
// se règlent ici ; les informations de service (cadeau prêt, qui expire)
// partent toujours (ADR 0039).
export async function setEmailSequence(messageKey: string, enabled: boolean): Promise<{ ok: boolean }> {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false };
  if (!MEMBER_SEQUENCE_KEYS.includes(messageKey)) return { ok: false };
  const ok = enabled
    ? await removeOptOut(user.id, messageKey)
    : await recordOptOut(user.id, messageKey, "compte");
  revalidatePath("/compte");
  return { ok };
}
