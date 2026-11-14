"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { superAdminId } from "@/lib/hubrise/guard";
import { belpeopleConnection, disconnectBelpeople, saveBelpeopleCredentials, syncBelpeople } from "@/lib/belpeople/store";
import { belpeopleConfig } from "@/lib/belpeople/api";
import { todayInBrussels } from "@/lib/qr-funnel";

// ADR 0103 — actions Belpeople de /platform/ca. Chaque action revérifie le
// super-admin (une Server Action n'est pas protégée par le layout).

async function guard(): Promise<string> {
  const id = await superAdminId();
  if (!id) redirect("/join?reason=platform-required");
  return id;
}

function back(params: Record<string, string>): never {
  revalidatePath("/platform/ca");
  redirect(`/platform/ca?${new URLSearchParams(params)}#belpeople`);
}

const field = (f: FormData, k: string, max = 200) => String(f.get(k) ?? "").trim().slice(0, max);

export async function belpeopleSave(formData: FormData) {
  const userId = await guard();
  const r = field(formData, "r", 80);
  if (!belpeopleConfig()) back({ r, bperreur: "Belpeople n'est pas configuré : BELPEOPLE_SUPABASE_URL et BELPEOPLE_ANON_KEY manquent dans Vercel." });
  const storeRef = field(formData, "store_ref", 20);
  const email = field(formData, "email", 200);
  const password = field(formData, "password", 200);
  if (!/^\d{1,8}$/.test(storeRef)) back({ r, bperreur: "Identifiant du magasin (store_id) manquant — ex. 223 pour Kraainem." });
  if (!email || !password) back({ r, bperreur: "E-mail et mot de passe requis." });
  try {
    await saveBelpeopleCredentials({ restaurantId: r, userId, storeRef, email, password });
  } catch (e) {
    back({ r, bperreur: `Accès pas enregistré : ${(e as Error).message}` });
  }
  // Première lecture tout de suite, pour voir si l'accès marche.
  try {
    const found = await belpeopleConnection(r);
    if (!found.missing && found.connection) await syncBelpeople(found.connection, todayInBrussels());
  } catch (e) {
    back({ r, bperreur: `Accès enregistré, mais la première lecture a échoué : ${(e as Error).message}` });
  }
  back({ r, belpeople: "ok" });
}

export async function belpeopleSyncNow(formData: FormData) {
  await guard();
  const r = field(formData, "r", 80);
  const found = await belpeopleConnection(r);
  if (found.missing || !found.connection) back({ r, bperreur: "Aucun accès Belpeople pour cet établissement." });
  // redirect() (back) lève NEXT_REDIRECT : jamais dans un try, sinon le succès
  // est pris pour une erreur. On garde le résultat et on redirige après.
  let days: number;
  try {
    days = (await syncBelpeople(found.connection, todayInBrussels())).days;
  } catch (e) {
    back({ r, bperreur: `Lecture Belpeople impossible : ${(e as Error).message}` });
  }
  back({ r, belpeople: `relu-${days}` });
}

export async function belpeopleDisconnect(formData: FormData) {
  await guard();
  const r = field(formData, "r", 80);
  const found = await belpeopleConnection(r);
  if (!found.missing && found.connection) await disconnectBelpeople(found.connection.id);
  back({ r, belpeople: "deconnecte" });
}
