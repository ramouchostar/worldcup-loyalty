import { NextResponse } from "next/server";
import { getCurrentThreshold } from "@/lib/thresholds";

export async function GET() {
  const threshold = await getCurrentThreshold();
  if (!threshold) return NextResponse.json(null);
  return NextResponse.json(threshold);
}
