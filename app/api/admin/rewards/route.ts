import { NextResponse, type NextRequest } from "next/server";
import { requireAdmin } from "@/lib/admin-guard";
import { createAdminClient } from "@/lib/supabase";

export async function GET(request: NextRequest) {
  const restaurantId = request.nextUrl.searchParams.get("restaurantId");
  if (!restaurantId) return NextResponse.json({ error: "restaurantId requis." }, { status: 400 });

  const guard = await requireAdmin(restaurantId);
  if (!guard.ok) return guard.response;

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("rewards")
    .select("*")
    .eq("restaurant_id", restaurantId)
    .order("level");

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}

export async function POST(req: Request) {
  const body = await req.json();
  const restaurantId = body?.restaurant_id;
  if (typeof restaurantId !== "string" || !restaurantId) {
    return NextResponse.json({ error: "restaurant_id requis." }, { status: 400 });
  }

  const guard = await requireAdmin(restaurantId);
  if (!guard.ok) return guard.response;

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("rewards")
    .insert({ ...body, restaurant_id: restaurantId })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data, { status: 201 });
}

export async function PATCH(req: Request) {
  const { id, restaurantId, ...updates } = await req.json();
  if (typeof restaurantId !== "string" || !restaurantId) {
    return NextResponse.json({ error: "restaurantId requis." }, { status: 400 });
  }

  const guard = await requireAdmin(restaurantId);
  if (!guard.ok) return guard.response;

  if (!id) return NextResponse.json({ error: "id requis." }, { status: 400 });

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("rewards")
    .update({ ...updates, updated_at: new Date().toISOString() })
    .eq("id", id)
    .eq("restaurant_id", restaurantId)
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}
