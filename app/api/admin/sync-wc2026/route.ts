import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin-guard";

// Admin-triggered manual sync — same logic as the cron, but protected by admin session
export async function POST() {
  const guard = await requireAdmin();
  if (!guard.ok) return guard.response;

  const base = process.env.VERCEL_URL
    ? `https://${process.env.VERCEL_URL}`
    : "http://localhost:3000";

  const res = await fetch(`${base}/api/cron/sync-wc2026`, {
    headers: { Authorization: `Bearer ${process.env.CRON_SECRET ?? ""}` },
  });

  const data = await res.json();
  return NextResponse.json(data, { status: res.status });
}
