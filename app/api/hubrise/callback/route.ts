import { NextResponse } from "next/server";
import { exchangeCode, hubriseCredentials, setCallback } from "@/lib/hubrise/api";
import { readState } from "@/lib/hubrise/model";
import { superAdminId, webhookUrl } from "@/lib/hubrise/guard";
import { activeConnection, journal, markFailed, openConnection, setCallbackUrl, syncDay } from "@/lib/hubrise/store";
import { todayInBrussels } from "@/lib/qr-funnel";
import { addDays } from "@/lib/daily-revenue-model";

// ADR 0102 §1 — retour de l'autorisation HubRise : échange du code contre un
// jeton (rangé dans Vault), pose du rappel, première lecture d'aujourd'hui et
// d'hier. Toute étape ratée est DITE sur /platform/ca, jamais tue.
export async function GET(request: Request) {
  const url = new URL(request.url);
  const cred = hubriseCredentials();
  const state = cred ? readState(url.searchParams.get("state"), cred.clientSecret) : null;
  const r = state?.r ?? "";
  const back = (params: Record<string, string>) =>
    NextResponse.redirect(new URL(`/platform/ca?${new URLSearchParams({ r, ...params })}`, url.origin));

  if (!cred) return back({ erreur: "HubRise n'est pas configuré dans Vercel." });
  if (!state) return back({ erreur: "Lien de connexion HubRise expiré ou modifié : relance la connexion." });
  const userId = await superAdminId();
  if (!userId || userId !== state.u) return back({ erreur: "Connexion HubRise refusée : relance-la depuis ton compte super-admin." });

  const denied = url.searchParams.get("error");
  if (denied) return back({ erreur: `HubRise a refusé l'accès (${denied}).` });
  const code = url.searchParams.get("code");
  if (!code) return back({ erreur: "HubRise n'a pas renvoyé de code d'autorisation." });

  try {
    const t = await exchangeCode(code);
    const connectionId = await openConnection({
      restaurantId: state.r,
      userId,
      accountId: t.account_id ?? null,
      accountName: t.account_name ?? null,
      locationId: t.location_id as string,
      locationName: t.location_name ?? null,
      token: t.access_token,
    });
    await journal("connected", { location_id: t.location_id, location_name: t.location_name ?? null }, connectionId);
    try {
      const hook = webhookUrl();
      await setCallback(t.access_token, hook);
      await setCallbackUrl(connectionId, hook);
    } catch (e) {
      await markFailed(connectionId, `Rappel non posé : ${(e as Error).message}`);
      return back({ erreur: `Connecté, mais le rappel HubRise n'a pas pu être posé : ${(e as Error).message}` });
    }
  } catch (e) {
    console.error("[hubrise/callback]", (e as Error).message);
    return back({ erreur: `Connexion HubRise impossible : ${(e as Error).message}` });
  }

  // Première lecture : ce qui est déjà arrivé depuis le branchement.
  try {
    const found = await activeConnection(state.r);
    if (!found.missing && found.connection) {
      const today = todayInBrussels();
      await syncDay(found.connection, addDays(today, -1));
      await syncDay(found.connection, today);
    }
  } catch (e) {
    return back({ hubrise: "connecte", erreur: `Connecté, mais la première lecture a échoué : ${(e as Error).message}` });
  }
  return back({ hubrise: "connecte" });
}
