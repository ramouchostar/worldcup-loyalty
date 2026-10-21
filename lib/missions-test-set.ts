import { createAdminClient } from "./supabase";
import { isMissingTable } from "./audit/store";
import { todayInBrussels } from "./qr-funnel";
import { createProvider, createProviderInvite, listProviders, type InviteInfo } from "./providers";
import { loadTemplate, logEvent } from "./missions";
import { rulesKindOf, rulesVersionFor } from "./mission-rules";
import { recordRestaurantAcceptance } from "./missions-rules";
import { aliasEmail, isTestName, TEST_PREFIX, TEST_PROVIDERS, testAnswers } from "./mission-test-set";

// ============================================================
// Réserver un prestataire (ADR 0084 §5 quindecies) — le jeu de test, côté base. Super-admin seulement (l'appelant le garde).
//
// Génère : 4 prestataires « [TEST] » (un par métier, invités — le lien sert à entrer dans leur espace) et une mission ENVOYÉE chez
// chacun, sur un établissement de démonstration. Efface : uniquement ce qui porte le marqueur (prestataires « [TEST] » et leurs missions,
// pièces jointes du stockage comprises). Rien ne touche un prestataire sans marqueur.
// ============================================================

type DbError = { code?: string; message?: string } | null;

export type TestSetState = {
  providers: { id: string; name: string; email: string; status: string; metiers: string[]; invite: InviteInfo | null }[];
  missions: { id: string; restaurantId: string; restaurantName: string | null; metier: string; status: string; providerId: string | null }[];
};

export async function listDemoRestaurants(): Promise<{ id: string; name: string }[]> {
  try {
    const { data, error } = await createAdminClient().from("restaurants").select("id, name").eq("is_demo", true).order("name");
    if (error) throw error;
    return (data ?? []) as { id: string; name: string }[];
  } catch (e) {
    console.error("[test-set] listDemoRestaurants failed:", (e as Error).message);
    return [];
  }
}

export async function testSetState(): Promise<TestSetState | { unavailable: true }> {
  const listed = await listProviders();
  if (!listed.ok) return { unavailable: true };
  const providers = listed.providers.filter((p) => isTestName(p.display_name)).map((p) => ({ id: p.id, name: p.display_name, email: p.email, status: p.status, metiers: p.metiers as string[], invite: p.invite }));
  if (providers.length === 0) return { providers, missions: [] };
  try {
    const { data, error } = await createAdminClient()
      .from("missions")
      .select("id, restaurant_id, metier, status, provider_id, restaurants(name)")
      .in("provider_id", providers.map((p) => p.id))
      .order("created_at");
    if (error) throw error;
    type Row = { id: string; restaurant_id: string; metier: string; status: string; provider_id: string | null; restaurants: { name: string } | { name: string }[] | null };
    return {
      providers,
      missions: ((data ?? []) as Row[]).map((m) => ({ id: m.id, restaurantId: m.restaurant_id, restaurantName: (Array.isArray(m.restaurants) ? m.restaurants[0]?.name : m.restaurants?.name) ?? null, metier: m.metier, status: m.status, providerId: m.provider_id })),
    };
  } catch (e) {
    console.error("[test-set] testSetState failed:", (e as Error).message);
    return { unavailable: true };
  }
}

export type SeedResult = { ok: true; created: number } | { ok: false; error: string };

export async function seedTestSet(input: { userId: string; userEmail: string | null; restaurantId: string }): Promise<SeedResult> {
  const admin = createAdminClient();
  const { data: restaurant } = await admin.from("restaurants").select("id, is_demo").eq("id", input.restaurantId).maybeSingle();
  if (!restaurant) return { ok: false, error: "Établissement introuvable." };
  // Une mission de test ne doit JAMAIS apparaître dans la console d'un vrai client.
  if ((restaurant as { is_demo: boolean }).is_demo !== true) return { ok: false, error: "Choisis un établissement de démonstration : un jeu de test n'a rien à faire chez un vrai client." };

  const state = await testSetState();
  if ("unavailable" in state) return { ok: false, error: "Le module n'est pas encore disponible : applique d'abord les migrations." };
  if (state.providers.length > 0) return { ok: false, error: "Un jeu de test existe déjà : efface-le d'abord." };

  const today = todayInBrussels();
  let created = 0;
  for (const spec of TEST_PROVIDERS) {
    const email = aliasEmail(input.userEmail, spec.metier);
    if (!email) return { ok: false, error: "Ton adresse e-mail n'est pas exploitable pour fabriquer les alias de test." };

    const provider = await createProvider({ email, displayName: spec.name, metiers: [spec.metier], createdBy: input.userId, locale: spec.locale });
    if (!provider.ok) return { ok: false, error: `${spec.name} : ${provider.error}` };
    const invite = await createProviderInvite(provider.provider.id, input.userId);
    if (!invite.ok) return { ok: false, error: `${spec.name} : ${invite.error}` };

    const tpl = await loadTemplate(spec.metier);
    if (!tpl) continue;
    const now = new Date().toISOString();
    const { data, error } = await admin
      .from("missions")
      .insert({ restaurant_id: input.restaurantId, provider_id: provider.provider.id, metier: spec.metier, status: "envoye", template_id: tpl.id, brief: testAnswers(tpl.template, today), brief_locked_at: now, requested_by: input.userId })
      .select("id")
      .single();
    if (error || !data) {
      if (!isMissingTable(error as DbError)) console.error("[test-set] insert mission failed:", error?.message);
      return { ok: false, error: `${spec.name} : la mission n'a pas pu être créée.` };
    }
    const missionId = (data as { id: string }).id;
    await recordRestaurantAcceptance(missionId, input.restaurantId, input.userId, rulesVersionFor(rulesKindOf(spec.metier)));
    await logEvent(missionId, { kind: "status", from: "brief", to: "envoye", actorKind: "restaurant", actorId: input.userId, meta: { providerId: provider.provider.id, testSet: true } });
    created++;
  }
  return { ok: true, created };
}

export type ClearResult = { ok: true; providers: number; missions: number; files: number } | { ok: false; error: string };

export async function clearTestSet(): Promise<ClearResult> {
  const state = await testSetState();
  if ("unavailable" in state) return { ok: false, error: "Le module n'est pas encore disponible." };
  const providerIds = state.providers.map((p) => p.id);
  const missionIds = state.missions.map((m) => m.id);
  if (providerIds.length === 0) return { ok: true, providers: 0, missions: 0, files: 0 };
  const admin = createAdminClient();
  let files = 0;
  try {
    if (missionIds.length > 0) {
      // Les pièces jointes du stockage d'abord : une ligne supprimée sans son fichier laisserait un orphelin.
      const { data: atts, error: ae } = await admin.from("mission_attachments").select("storage_path").in("mission_id", missionIds);
      if (ae && !isMissingTable(ae)) throw ae;
      const paths = ((atts ?? []) as { storage_path: string }[]).map((a) => a.storage_path);
      if (paths.length > 0) {
        const { error: se } = await admin.storage.from("mission-files").remove(paths);
        if (se) throw se;
        files = paths.length;
      }
      const { error: me } = await admin.from("missions").delete().in("id", missionIds);
      if (me) throw me;
    }
    const { error: pe } = await admin.from("providers").delete().in("id", providerIds);
    if (pe) throw pe;
    return { ok: true, providers: providerIds.length, missions: missionIds.length, files };
  } catch (e) {
    console.error("[test-set] clearTestSet failed:", (e as Error).message);
    return { ok: false, error: `Effacement interrompu : ${(e as Error).message}. Relance « Tout effacer ».` };
  }
}

export { TEST_PREFIX };
