import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import QRCode from "qrcode";
import { createServerSupabaseClient } from "@/lib/supabase";
import { getAdminAccess } from "@/lib/admin-guard";
import { pubConfig } from "@/lib/ads/config";
import { epcPayload } from "@/lib/ads/meta-spec";
import { formatEur } from "@/lib/ads/money";
import { instagramPosts, listRequests, pubAvailability } from "@/lib/ads/requests";
import { Card, PageHeader, StatusBadge } from "@/components/admin/ui";
import { CancelButton, CopyButton } from "../PubControls";
import { STATUS_VIEW, dateFr } from "../view";
import { CorrectionForm } from "./CorrectionForm";

// ADR 0086 §1, §3 — une demande : le virement à faire (communication structurée, QR EPC),
// où elle en est, et la retouche quand Mehdi l'a renvoyée. Maquette validée le 2026-10-23.

export const dynamic = "force-dynamic";

const STEPS = ["Virement", "Préparation", "Vérification", "En ligne"] as const;
const stepOf: Record<string, number> = { paiement_attendu: 0, payee: 1, a_corriger: 1, preparee: 2, en_diffusion: 3, en_pause: 3, terminee: 3, annulee: 0 };

export default async function PubRequestPage({ params }: { params: Promise<{ restaurantId: string; requestId: string }> }) {
  const { restaurantId, requestId } = await params;
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const access = await getAdminAccess(user.id, restaurantId);
  const av = await pubAvailability(restaurantId, access.isSuperAdmin);
  if (!av.open) notFound();
  const list = await listRequests(restaurantId);
  const r = list.ok ? list.requests.find((x) => x.id === requestId) : undefined;
  if (!r) notFound();

  const pay = pubConfig().payment;
  const open = r.notices.find((n) => !n.confirmedAt) ?? null;
  const qr = open && pay ? await QRCode.toDataURL(epcPayload({ bic: pay.bic, holder: pay.holder, iban: pay.iban, amountCents: open.expectedCents, communication: open.ref }), { margin: 1, width: 224, errorCorrectionLevel: "M" }) : null;
  const step = stepOf[r.status] ?? 0;
  const ig = r.status === "a_corriger" ? await instagramPosts(restaurantId) : null;
  const title = open ? (open.kind === "recharge" ? "Complément de budget demandé" : "Ta pub est demandée") : r.objectiveLabel;

  return (
    <div className="space-y-5 max-w-2xl">
      <div>
        <Link href={`/admin/${restaurantId}/pub`} className="text-[14px] text-boost-olive-dark hover:text-ink">‹ Pub</Link>
        <div className="mt-1.5">
          <PageHeader
            title={title}
            subtitle={open ? "Fais le virement ci-dessous. Dès qu'il arrive, on prépare ta pub, on la vérifie et on la lance." : undefined}
            action={<StatusBadge tone={STATUS_VIEW[r.status].tone}>{STATUS_VIEW[r.status].label}</StatusBadge>}
          />
        </div>
      </div>

      {r.status !== "annulee" && (
        <ol className="flex gap-1.5 text-[12px] font-semibold" aria-label="Étapes">
          {STEPS.map((s, i) => (
            <li key={s} aria-current={i === step ? "step" : undefined} className={`flex-1 rounded-full px-1 py-1.5 text-center ${i <= step ? "bg-ink text-white" : "bg-paper-subtle text-ink-body"}`}>
              {s}
            </li>
          ))}
        </ol>
      )}

      {r.status === "a_corriger" && (
        <Card className="space-y-3 border-warn">
          <p className="font-semibold text-ink">Une retouche avant la mise en ligne</p>
          {r.correctionReason && <p className="text-[14px] text-ink-body">{r.correctionReason}</p>}
          <CorrectionForm
            restaurantId={restaurantId}
            requestId={r.id}
            needsVideo={r.objective === "VIDEO"}
            initialText={r.adText ?? ""}
            posts={ig && ig.ok ? ig.posts.map((x) => ({ id: x.id, mediaType: x.media_type, likes: x.like_count ?? 0, thumbnail: x.thumbnail_url ?? (x.media_type !== "VIDEO" ? (x.media_url ?? null) : null), permalink: x.permalink ?? null })) : []}
          />
        </Card>
      )}

      {open && pay && (
        <>
          <Card className="space-y-3">
            <div>
              <p className="text-[12px] text-ink-muted">Montant</p>
              <p className="font-display text-[26px] font-bold tabular-nums text-ink">{formatEur(open.expectedCents)}</p>
            </div>
            <div>
              <p className="text-[12px] text-ink-muted">Communication structurée — à recopier telle quelle</p>
              <div className="mt-1 flex items-center gap-2">
                <p className="flex-1 rounded-lg bg-boost-cream px-3 py-2.5 font-mono text-[18px] font-bold text-ink">{open.ref}</p>
                <CopyButton value={open.ref} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3 text-[14px] text-ink">
              <div><p className="text-[12px] text-ink-muted">Bénéficiaire</p><p>{pay.holder}</p></div>
              <div><p className="text-[12px] text-ink-muted">BIC</p><p>{pay.bic}</p></div>
            </div>
            <div className="text-[14px] text-ink">
              <p className="text-[12px] text-ink-muted">IBAN</p>
              <div className="mt-0.5 flex items-center gap-2">
                <p className="flex-1 break-all font-mono">{pay.iban.replace(/(.{4})/g, "$1 ").trim()}</p>
                <CopyButton value={pay.iban} />
              </div>
            </div>
          </Card>
          {qr && (
            <Card className="flex items-center gap-4">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={qr} alt="QR de paiement : montant, IBAN et communication" width={112} height={112} className="shrink-0" />
              <p className="text-[13px] text-ink-body">Ouvre l&apos;app de ta banque et scanne ce code : montant, IBAN et communication sont remplis tout seuls.</p>
            </Card>
          )}
        </>
      )}

      <div className="space-y-1 rounded-xl bg-paper-subtle p-4 text-[13px] text-ink-body">
        <p className="font-semibold text-ink">Ce que tu as demandé</p>
        <p>
          {r.objectiveLabel}
          {r.radiusKm ? ` · ${r.radiusKm} km` : ""} · {dateFr(r.startsOn)} → {dateFr(r.endsOn)}
        </p>
        {r.notices.map((n) => (
          <p key={n.id}>
            {n.kind === "recharge" ? "Complément" : "Budget"} {formatEur(n.budgetCents)} + frais {formatEur(n.feeCents)}
            {n.confirmedAt ? " · reçu" : " · virement attendu"}
          </p>
        ))}
        <p>Facture envoyée par Peppol après réception.</p>
      </div>

      {r.status === "paiement_attendu" && <CancelButton restaurantId={restaurantId} requestId={r.id} />}
      {open && <p className="text-center text-[12px] text-ink-faint">Un virement met en général 1 jour ouvrable. On te prévient par e-mail à chaque étape.</p>}
    </div>
  );
}
