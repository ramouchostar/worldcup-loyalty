import { NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase";
import { getRestaurantId } from "@/lib/restaurant";

export async function GET() {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Non authentifié." }, { status: 401 });

  const { data, error } = await supabase
    .from("pending_rewards")
    .select("*")
    .eq("user_id", user.id)
    .eq("restaurant_id", getRestaurantId())
    .order("created_at", { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data ?? []);
}
