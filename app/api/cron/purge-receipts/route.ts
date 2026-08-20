import { NextResponse } from "next/server";
import { purgeExpiredReceipts, RECEIPT_RETENTION_DAYS } from "@/lib/receipt-scans";

// ADR 0036 — Purge quotidienne des images de tickets : plus aucune photo de
// plus de 30 jours dans le bucket, qu'elle soit devenue une commande ou non.
// Les lignes restent (la commande est une pièce comptable, le scan une
// statistique de lecture OCR) — seule l'image s'efface. Tourne au creux de
// la nuit, aucun membre ni restaurateur n'est en train de consulter un ticket.
export async function GET(request: Request) {
  const authHeader = request.headers.get("authorization");
  if (!process.env.CRON_SECRET || authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Non autorisé." }, { status: 401 });
  }

  const result = await purgeExpiredReceipts();
  return NextResponse.json({ ok: true, retention_days: RECEIPT_RETENTION_DAYS, ...result });
}
