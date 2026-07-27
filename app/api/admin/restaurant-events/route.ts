import { NextResponse, type NextRequest } from "next/server";
import { requireAdmin } from "@/lib/admin-guard";
import { createAdminClient } from "@/lib/supabase";

// Événements locaux ajoutés par le restaurateur (ADR 0027 §6) : braderie,
// concert, fermeture… Signaux L1 du forecast. Écriture ADMIN gardée ; la
// suppression est bornée au restaurant appelant (discipline sécurité F1).

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export async function POST(request: NextRequest) {
  const body = (await request.json().catch(() => null)) as {
    restaurantId?: string;
    label?: string;
    starts_on?: string;
    ends_on?: string;
    expected_effect?: string;
  } | null;

  const restaurantId = body?.restaurantId;
  if (typeof restaurantId !== "string" || !restaurantId) {
    return NextResponse.json({ error: "restaurantId requis." }, { status: 400 });
  }

  const guard = await requireAdmin(restaurantId);
  if (!guard.ok) return guard.response;

  const label = String(body?.label ?? "").trim().slice(0, 120);
  const startsOn = String(body?.starts_on ?? "");
  const endsOn = String(body?.ends_on ?? "") || startsOn;
  const effect = body?.expected_effect === "down" ? "down" : "up";

  if (!label) {
    return NextResponse.json({ error: "Libellé requis." }, { status: 400 });
  }
  if (!DATE_RE.test(startsOn) || !DATE_RE.test(endsOn)) {
    return NextResponse.json({ error: "Dates invalides (attendu AAAA-MM-JJ)." }, { status: 400 });
  }
  if (endsOn < startsOn) {
    return NextResponse.json({ error: "La fin est avant le début." }, { status: 400 });
  }

  const admin = createAdminClient();
  const { error } = await admin.from("restaurant_events").insert({
    restaurant_id: restaurantId,
    label,
    starts_on: startsOn,
    ends_on: endsOn,
    expected_effect: effect,
    created_by: guard.userId,
  });

  if (error) return NextResponse.json({ error: "Enregistrement impossible." }, { status: 500 });
  return NextResponse.json({ ok: true });
}

export async function DELETE(request: NextRequest) {
  const restaurantId = request.nextUrl.searchParams.get("restaurantId");
  const id = request.nextUrl.searchParams.get("id");
  if (!restaurantId || !id) {
    return NextResponse.json({ error: "restaurantId et id requis." }, { status: 400 });
  }

  const guard = await requireAdmin(restaurantId);
  if (!guard.ok) return guard.response;

  const admin = createAdminClient();
  const { error } = await admin
    .from("restaurant_events")
    .delete()
    .eq("id", id)
    .eq("restaurant_id", restaurantId); // borné au resto — jamais supprimer l'événement d'un autre

  if (error) return NextResponse.json({ error: "Suppression impossible." }, { status: 500 });
  return NextResponse.json({ ok: true });
}
