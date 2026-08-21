import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin-guard";
import {
  sendBroadcast,
  scheduleBroadcast,
  listScheduledBroadcasts,
  cancelScheduledBroadcast,
  todayInBrussels,
  type BroadcastTarget,
  type BroadcastNature,
} from "@/lib/broadcast";
import { isTeamType } from "@/lib/teams";
import { getEntitlement, ensureTrialStarted } from "@/lib/entitlements";

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const dayDiff = (a: string, b: string) =>
  Math.round((new Date(`${b}T00:00:00Z`).getTime() - new Date(`${a}T00:00:00Z`).getTime()) / 86_400_000);

// POST /api/admin/broadcast — envoie (ADR 0014) ou programme (ADR 0023) une
// notification ciblée.
// Body : { restaurantId, message, target, sendOn?, promoOn? }
// - sans sendOn : envoi immédiat (comportement historique) ;
// - avec sendOn (≥ aujourd'hui) : programmé, envoyé par le cron du soir ;
// - avec promoOn : l'annonce doit partir à J-1 ou J-2 de la promo — jamais
//   plus tôt (une annonce précoce fait reporter les commandes des jours
//   pleins), jamais le jour même (le cron du soir arriverait trop tard).
export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  const restaurantId = body?.restaurantId;
  if (typeof restaurantId !== "string" || !restaurantId) {
    return NextResponse.json({ error: "restaurantId requis." }, { status: 400 });
  }

  const guard = await requireAdmin(restaurantId);
  if (!guard.ok) return guard.response;

  const message = typeof body?.message === "string" ? body.message.trim() : "";
  if (message.length < 3 || message.length > 280) {
    return NextResponse.json({ error: "Message de 3 à 280 caractères." }, { status: 400 });
  }

  const kind = body?.target?.kind;
  let target: BroadcastTarget;
  if (kind === "all") {
    target = { kind: "all" };
  } else if (kind === "teams") {
    const teamIds = Array.isArray(body.target.teamIds)
      ? body.target.teamIds.filter((x: unknown): x is string => typeof x === "string")
      : [];
    if (teamIds.length === 0) return NextResponse.json({ error: "Aucune équipe sélectionnée." }, { status: 400 });
    target = { kind: "teams", teamIds };
  } else if (kind === "types") {
    const types = Array.isArray(body.target.types) ? body.target.types.filter(isTeamType) : [];
    if (types.length === 0) return NextResponse.json({ error: "Aucun type sélectionné." }, { status: 400 });
    target = { kind: "types", types };
  } else {
    return NextResponse.json({ error: "Cible invalide." }, { status: 400 });
  }

  // ADR 0039 — nature du message. Défaut `promo` : c'est le comportement
  // historique, et c'est le plus restrictif des deux (consentement exigé).
  const nature: BroadcastNature = body?.nature === "service" ? "service" : "promo";

  const sendOn = typeof body?.sendOn === "string" && DATE_RE.test(body.sendOn) ? body.sendOn : null;
  const promoOn = typeof body?.promoOn === "string" && DATE_RE.test(body.promoOn) ? body.promoOn : null;

  if (sendOn) {
    // ADR 0029 — la PROGRAMMATION est une fonction Croissance (le broadcast
    // manuel immédiat reste Gratuit). Essai 30 j à la 1re utilisation, puis
    // paywall doux : on refuse avec un message clair, jamais silencieusement.
    await ensureTrialStarted(restaurantId, "broadcast_scheduled");
    const ent = await getEntitlement(restaurantId, "broadcast_scheduled");
    if (!ent.allowed) {
      return NextResponse.json(
        {
          error:
            "La programmation de broadcasts fait partie du plan Croissance — ton essai gratuit est terminé. L'envoi immédiat reste disponible.",
          paywall: true,
        },
        { status: 403 }
      );
    }
    const today = todayInBrussels();
    if (dayDiff(today, sendOn) < 0) {
      return NextResponse.json({ error: "La date d'envoi est déjà passée." }, { status: 400 });
    }
    if (promoOn) {
      const lead = dayDiff(sendOn, promoOn);
      if (lead < 1 || lead > 2) {
        return NextResponse.json(
          { error: "L'annonce d'une promo part la veille ou l'avant-veille du jour de la promo — pas plus tôt, pas le jour même." },
          { status: 400 }
        );
      }
    }
    const row = await scheduleBroadcast(message, target, restaurantId, sendOn, promoOn, guard.userId, nature);
    return NextResponse.json({ ok: true, scheduled: true, id: row.id, sendOn: row.send_on, promoOn: row.promo_on });
  }

  const result = await sendBroadcast(message, target, restaurantId, nature);
  return NextResponse.json({ ok: true, ...result });
}

// GET /api/admin/broadcast?restaurantId=… — broadcasts programmés (20 derniers).
export async function GET(req: Request) {
  const restaurantId = new URL(req.url).searchParams.get("restaurantId") ?? "";
  if (!restaurantId) return NextResponse.json({ error: "restaurantId requis." }, { status: 400 });

  const guard = await requireAdmin(restaurantId);
  if (!guard.ok) return guard.response;

  return NextResponse.json(await listScheduledBroadcasts(restaurantId));
}

// DELETE /api/admin/broadcast?restaurantId=…&id=… — annule un programmé non envoyé.
export async function DELETE(req: Request) {
  const url = new URL(req.url);
  const restaurantId = url.searchParams.get("restaurantId") ?? "";
  const id = url.searchParams.get("id") ?? "";
  if (!restaurantId || !id) return NextResponse.json({ error: "restaurantId et id requis." }, { status: 400 });

  const guard = await requireAdmin(restaurantId);
  if (!guard.ok) return guard.response;

  const cancelled = await cancelScheduledBroadcast(id, restaurantId);
  if (!cancelled) return NextResponse.json({ error: "Introuvable ou déjà envoyé." }, { status: 404 });
  return NextResponse.json({ ok: true });
}
