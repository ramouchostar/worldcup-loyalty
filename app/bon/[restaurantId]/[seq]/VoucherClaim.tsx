"use client";

import QRCode from "qrcode";
import { useEffect, useState } from "react";
import { formatVoucherCode } from "@/lib/ads/vouchers";

// ADR 0104 §2 — « Obtenir mon bon », puis le bon lui-même : le code en grand et le QR que la
// caisse scanne avec la console ouverte (/admin/bon/<jeton>). Un échec se dit à l'écran,
// avec quoi faire ; jamais un bouton qui ne fait rien.

type Voucher = { code: string; token: string; redeemedAt: string | null };

export function VoucherClaim({
  restaurantId,
  seq,
  keyword,
  startsLater,
  initial,
}: {
  restaurantId: string;
  seq: number;
  keyword: string;
  /** L'offre commence plus tard : on peut déjà garder son bon. */
  startsLater: string | null;
  initial: Voucher | null;
}) {
  const [voucher, setVoucher] = useState<Voucher | null>(initial);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [qr, setQr] = useState<string | null>(null);

  useEffect(() => {
    if (!voucher) return;
    QRCode.toDataURL(`${window.location.origin}/admin/bon/${voucher.token}`, { margin: 1, width: 240, errorCorrectionLevel: "M" })
      .then(setQr)
      .catch(() => setQr(null));
  }, [voucher]);

  async function claim() {
    setBusy(true);
    setError(null);
    try {
      const r = await fetch("/api/bons", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ restaurantId, seq }),
      });
      const data = (await r.json().catch(() => ({}))) as Partial<Voucher> & { error?: string };
      if (!r.ok || !data.code || !data.token) {
        setError(data.error ?? "Le bon n'a pas pu être créé. Réessaie dans un instant.");
        return;
      }
      setVoucher({ code: data.code, token: data.token, redeemedAt: data.redeemedAt ?? null });
    } catch {
      setError("Pas de connexion. Vérifie ton réseau et réessaie.");
    } finally {
      setBusy(false);
    }
  }

  if (!voucher) {
    return (
      <div className="space-y-2">
        <button
          type="button"
          onClick={claim}
          disabled={busy}
          className="flex min-h-[48px] w-full items-center justify-center rounded-lg bg-boost-olive px-4 text-[17px] font-semibold text-white hover:bg-boost-olive-dark active:translate-y-px disabled:opacity-60 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-boost-olive"
        >
          {busy ? "Un instant…" : "Obtenir mon bon"}
        </button>
        {error && (
          <p role="alert" className="text-[15px] text-danger">
            {error}
          </p>
        )}
        <p className="text-[13px] text-ink-muted">Gratuit et sans inscription. Tu le montres à la caisse, c&apos;est tout.</p>
      </div>
    );
  }

  return (
    <div className="space-y-3 rounded-lg border-2 border-dashed border-boost-olive p-4 text-center">
      {voucher.redeemedAt ? (
        <p className="text-[17px] font-semibold">Ce bon a déjà été utilisé. Merci de ta visite !</p>
      ) : (
        <>
          <p className="text-[15px] font-semibold">Ton bon</p>
          {qr ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={qr} alt="QR code du bon, à montrer à la caisse" width={200} height={200} className="mx-auto h-[200px] w-[200px]" />
          ) : (
            <div className="mx-auto h-[200px] w-[200px] rounded-lg bg-paper-subtle" aria-hidden="true" />
          )}
          <p className="text-[32px] font-semibold tracking-[0.08em] tabular-nums" aria-label={`Code ${voucher.code.split("").join(" ")}`}>
            {formatVoucherCode(voucher.code)}
          </p>
          <p className="text-[15px] text-ink-muted">
            Montre ce bon à la caisse. Mot clé : <strong className="font-semibold text-ink">{keyword}</strong>
          </p>
          {startsLater && <p className="text-[13px] text-warn">L&apos;offre commence le {startsLater} : garde ce bon, il sera valable à partir de ce jour.</p>}
          <p className="text-[13px] text-ink-faint">Un seul passage en caisse par bon. Il reste sur ce téléphone.</p>
        </>
      )}
    </div>
  );
}
