import { NextResponse } from "next/server";
import { journalEvent, verifyResendWebhook } from "@/lib/resend-webhook";
import { applyProviderEvent } from "@/lib/message-log";

// Webhook Resend (ADR 0063 §6) : délivré, rebond, plainte → journal des
// messages. Signé par Svix avec RESEND_WEBHOOK_SECRET ; sans secret, la route
// refuse tout (on n'écrit jamais dans le journal sur la foi d'un inconnu).
// À déclarer dans Resend → Webhooks : https://<domaine>/api/webhooks/resend,
// événements email.delivered, email.bounced, email.complained.

export async function POST(request: Request) {
  const secret = process.env.RESEND_WEBHOOK_SECRET;
  if (!secret) return NextResponse.json({ error: "Webhook non configuré." }, { status: 503 });

  const body = await request.text();
  const ok = verifyResendWebhook({
    secret,
    id: request.headers.get("svix-id"),
    timestamp: request.headers.get("svix-timestamp"),
    signature: request.headers.get("svix-signature"),
    body,
  });
  if (!ok) return NextResponse.json({ error: "Signature invalide." }, { status: 401 });

  let event: { type?: string; created_at?: string; data?: { email_id?: string } };
  try {
    event = JSON.parse(body);
  } catch {
    return NextResponse.json({ error: "Corps illisible." }, { status: 400 });
  }

  const kind = journalEvent(event.type ?? "");
  const emailId = event.data?.email_id;
  // Un type qu'on ne suit pas est accusé reçu (200) : sinon Resend le
  // renverrait en boucle.
  if (kind && emailId) {
    await applyProviderEvent(emailId, kind, event.created_at ?? new Date().toISOString());
  }
  return NextResponse.json({ ok: true });
}
