import { NextResponse, type NextRequest } from "next/server";
import { createServerSupabaseClient, createAdminClient } from "@/lib/supabase";

export async function GET(request: NextRequest) {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json(null);

  const restaurantId = request.nextUrl.searchParams.get("restaurantId");
  if (!restaurantId) return NextResponse.json(null);

  const admin = createAdminClient();
  const since = new Date(Date.now() - 24 * 3_600_000).toISOString();

  const { data } = await admin
    .from("notification_log")
    .select("id, message_body, trigger_type, sent_at")
    .eq("user_id", user.id)
    .eq("restaurant_id", restaurantId)
    .gte("sent_at", since)
    .order("sent_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  return NextResponse.json(data ?? null);
}
