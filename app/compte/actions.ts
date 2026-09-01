"use server";

import { revalidatePath } from "next/cache";
import { createServerSupabaseClient, createAdminClient } from "@/lib/supabase";
import { sanitizeZones } from "@/lib/zones";
import { recordConsents } from "@/lib/consent";

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
      display_name: displayName || null,
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
