// ADR 0111 §3 — qui peut agir sur les articles depuis la console. Serveur uniquement.
// Deux portes, dans l'ordre : être gérant ou manager de CET établissement (la plateforme ne fait que lire), puis
// l'espace de commande ouvert (mêmes portes que la commande, ADR 0099 §8) : fermé = 404.

import { NextResponse } from "next/server";
import { getAdminAccess } from "../admin-guard";
import { createServerSupabaseClient } from "../supabase";
import { siteOrdersAvailable } from "../site-orders/access";
import { readPublicMenu } from "../site-orders/menu-db";
import { PostsUnavailableError, type Failure } from "./service";
import { canWritePosts } from "./states";

export const postsError = (error: string, status: number) => NextResponse.json({ error }, { status });
export const postsFailure = (f: Failure) => NextResponse.json({ error: f.error, ...(f.issues ? { issues: f.issues } : {}) }, { status: f.status });

/** Écrire, publier, retirer, supprimer. */
export async function requirePostWriter(restaurantId: string): Promise<{ ok: true; userId: string } | { ok: false; response: NextResponse }> {
  if (!restaurantId) return { ok: false, response: postsError("Requête invalide.", 400) };
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, response: postsError("Non authentifié.", 401) };
  const access = await getAdminAccess(user.id, restaurantId);
  if (!canWritePosts(access)) {
    const why = access.isSuperAdmin
      ? "La plateforme peut seulement masquer un article : seul le restaurant écrit et publie."
      : "Réservé aux gérants et managers.";
    return { ok: false, response: postsError(why, 403) };
  }
  if (!(await siteOrdersAvailable(restaurantId))) return { ok: false, response: postsError("Introuvable.", 404) };
  return { ok: true, userId: user.id };
}

/** Le corps JSON d'une requête, plafonné ; `null` s'il est absent, trop gros ou n'est pas un objet. */
export async function readJsonBody(req: Request, maxChars: number): Promise<Record<string, unknown> | null> {
  const text = await req.text().catch(() => "");
  if (text.length === 0 || text.length > maxChars) return null;
  try {
    const parsed: unknown = JSON.parse(text);
    return typeof parsed === "object" && parsed !== null && !Array.isArray(parsed) ? (parsed as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

/** L'erreur d'une route d'articles, dite simplement ; le détail va au journal. */
export function postsCatch(e: unknown, where: string): NextResponse {
  if (e instanceof PostsUnavailableError) return postsError(e.message, 503);
  console.error(`[blog] ${where} :`, e);
  return postsError("Un souci de notre côté. Réessaie dans un instant.", 500);
}

/** La carte d'aujourd'hui, pour le contrôle des plats ; `null` si elle ne se lit pas (le contrôle le dira). */
export async function readDishIds(restaurantId: string): Promise<Set<string> | null> {
  try {
    const menu = await readPublicMenu(restaurantId);
    return menu ? new Set(menu.categories.flatMap((c) => c.items).map((i) => i.id)) : null;
  } catch (e) {
    console.error("[blog] carte illisible :", (e as Error).message);
    return null;
  }
}
