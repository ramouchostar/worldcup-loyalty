import { NextResponse } from "next/server";
import { isRestaurantThresholdUnlocked } from "@/lib/thresholds";

export async function GET() {
  const is_unlocked = await isRestaurantThresholdUnlocked();
  return NextResponse.json({ is_unlocked });
}
