import { NextResponse, type NextRequest } from "next/server";
import { checkIpRateLimit, hashIp } from "@/lib/rate-limit";
import { createServerSupabaseClient } from "@/lib/supabase";
import { supabaseOrdersDb } from "@/lib/site-orders/db";
import { siteOrdersAvailable } from "@/lib/site-orders/access";
import { LOGIN_REQUIRED } from "@/lib/site-orders/account";
import { ensureSiteMembership } from "@/lib/site-orders/membership";
import { placeSiteOrder } from "@/lib/site-orders/service";

// ADR 0099 §2 — une commande du site : retrait au comptoir, paiement au comptoir. FERMÉE par défaut : sans
// SITE_ORDER_RESTAURANTS qui liste l'établissement ET un forfait Pro actif (Nina, ADR 0099 §8), la route répond 404 comme si elle n'existait pas (la caisse certifiée
// et le RGPD doivent être tranchés avant d'ouvrir à un vrai restaurant, ADR 0099).
//
// POST /api/site-orders  { restaurantId, firstName, phone?, lines: [{ articleId, qty, selection }] }
//   → 201 { number, totalCents, points }   ou   4xx/5xx { error, code }
// Le navigateur n'envoie JAMAIS un prix ni un nom de plat : le serveur recalcule tout (lib/site-orders/order.ts).
//
// ADR 0108 §2 — il faut un COMPTE pour envoyer : sans session, 401 `connexion`, AVANT la limite par adresse (une personne
// qui doit se connecter n'a rien envoyé) et sans rien enregistrer sauf le compteur de la trace. Le compte vient de la session,
// jamais du corps de la demande : le navigateur ne dit pas qui il est.

const MAX_BODY = 64 * 1024;
const NOT_FOUND = () => NextResponse.json({ error: "Introuvable." }, { status: 404 });

export async function POST(req: NextRequest) {
  const text = await req.text().catch(() => "");
  if (text.length === 0 || text.length > MAX_BODY) return NextResponse.json({ error: "Commande illisible. Recharge la page et réessaie.", code: "forme" }, { status: 400 });
  let body: Record<string, unknown> | null = null;
  try {
    const parsed: unknown = JSON.parse(text);
    body = typeof parsed === "object" && parsed !== null && !Array.isArray(parsed) ? (parsed as Record<string, unknown>) : null;
  } catch {
    body = null;
  }
  const restaurantId = typeof body?.restaurantId === "string" ? body.restaurantId : "";
  if (!restaurantId || !(await siteOrdersAvailable(restaurantId))) return NOT_FOUND();

  const db = supabaseOrdersDb();

  let memberId: string | null = null;
  try {
    const supabase = await createServerSupabaseClient();
    const { data: { user } } = await supabase.auth.getUser();
    memberId = user?.id ?? null;
  } catch {
    memberId = null; // une panne de lecture de la session se lit « pas connecté » : jamais une commande sans compte
  }
  if (memberId === null) {
    await db.recordRefusal(restaurantId, LOGIN_REQUIRED.reason);
    return NextResponse.json({ error: LOGIN_REQUIRED.message, code: LOGIN_REQUIRED.code }, { status: 401 });
  }

  // Une adresse ne passe pas plus de 6 commandes en 10 minutes (abus, erreur de boucle). L'adresse n'est jamais stockée en clair.
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || req.headers.get("x-real-ip") || "inconnue";
  if (!(await checkIpRateLimit(hashIp(ip), "site_order", 6, 600))) {
    await db.recordRefusal(restaurantId, "limite");
    return NextResponse.json({ error: "Trop de commandes en peu de temps. Réessaie dans quelques minutes, ou appelle le restaurant.", code: "limite" }, { status: 429 });
  }

  const result = await placeSiteOrder(db, restaurantId, body, new Date(), memberId);
  if (!result.ok) {
    await db.recordRefusal(restaurantId, result.code);
    return NextResponse.json({ error: result.message, code: result.code }, { status: result.status });
  }
  // ADR 0108 §2 — commander, c'est rejoindre le restaurant : après l'enregistrement, jamais avant, et sans jamais le faire échouer.
  await ensureSiteMembership(memberId, restaurantId);
  console.info(`[site-orders] restaurant=${restaurantId} numero=${result.number} total_cents=${result.totalCents} compte=${result.linked ? "lie" : "non_lie"}`);
  // `points` : la commande est liée à un compte, donc sa remise rapportera des points (ADR 0108 §5). Faux si la migration
  // `member_id` n'est pas appliquée : la page ne promet alors rien.
  return NextResponse.json({ number: result.number, totalCents: result.totalCents, points: result.linked }, { status: 201 });
}
