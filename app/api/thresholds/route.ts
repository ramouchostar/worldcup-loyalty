import { NextRequest, NextResponse } from "next/server";
import { isRestaurantThresholdUnlocked } from "@/lib/thresholds";

export async function GET(request: NextRequest) {
  const restaurantId = request.nextUrl.searchParams.get("restaurantId");
  if (!restaurantId) {
    return NextResponse.json({ error: "restaurantId requis." }, { status: 400 });
  }
  const is_unlocked = await isRestaurantThresholdUnlocked(restaurantId);
  return NextResponse.json({ is_unlocked });
}
