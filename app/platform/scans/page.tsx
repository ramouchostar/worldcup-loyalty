import { redirect } from "next/navigation";
import Link from "next/link";
import { createServerSupabaseClient, createAdminClient } from "@/lib/supabase";
import { RECEIPT_RETENTION_DAYS } from "@/lib/receipt-scans";

export const metadata = { title: "Tickets scannés — Plateforme" };

// ADR 0036 — « Tickets scannés » : l'image, ce que Claude Vision en a lu, et
// ce que l'app a fini par encoder, côte à côte. Réservé au super-admin
// (ADR 0025 : la plateforme est l'unique responsable de traitement ; la
// confiance OCR et les motifs de flag sont des internes anti-fraude que ni
// le membre ni le restaurateur ne voient — ADR 0019).
const LIST_LIMIT = 200;
const SIGNED_URL_TTL = 3600;

type ScanRow = {
  id: string;
  restaurant_id: string;
  user_id: string;
  storage_path: string | null;
  scanned_at: string;
  purged_at: string | null;
  ocr_order_number: string | null;
  ocr_amount: number | null;
  ocr_confidence: number | null;
  ocr_order_time: string | null;
  ocr_has_restaurant_header: boolean | null;
  ocr_items: { name: string; quantity: number; unit_price: number | null }[];
  outcome: "parsed" | "header_rejected" | "submitted";
  order_id: string | null;
};

type OrderRow = {
  id: string;
  amount: number;
  order_number: string | null;
  order_date: string;
  status: string;
  flag_reasons: string[] | null;
};

const OUTCOME_LABELS: Record<ScanRow["outcome"], { label: string; color: string }> = {
  submitted: { label: "Devenu commande", color: "bg-green-100 text-green-800" },
  parsed: { label: "Jamais soumis", color: "bg-amber-100 text-amber-800" },
  header_rejected: { label: "Entête refusée", color: "bg-purple-100 text-purple-800" },
};

function euros(n: number | null): string {
  return n === null ? "—" : `${n.toFixed(2)} €`;
}

function heureBelge(iso: string): string {
  return new Date(iso).toLocaleString("fr-BE", {
    timeZone: "Europe/Brussels",
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

// Un écart = ce que l'app a encodé s'éloigne de ce que le modèle a lu. C'est
// exactement ce qu'on vient chercher sur cette page.
function ecarts(scan: ScanRow, order: OrderRow | null): string[] {
  const out: string[] = [];
  if (!order) return out;
  if (scan.ocr_amount !== null && Math.abs(scan.ocr_amount - order.amount) > 0.01) {
    out.push(`montant ${euros(scan.ocr_amount)} → ${euros(order.amount)}`);
  }
  const lu = scan.ocr_order_number ?? null;
  const encode = order.order_number ?? null;
  if (lu !== encode) out.push(`n° « ${lu ?? "rien"} » → « ${encode ?? "rien"} »`);
  return out;
}

export default async function PlatformScansPage({
  searchParams,
}: {
  searchParams: Promise<{ restaurant?: string }>;
}) {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("is_super_admin")
    .eq("id", user.id)
    .single();
  if (!profile?.is_super_admin) redirect("/join?reason=platform-required");

  const { restaurant: restaurantFilter } = await searchParams;
  const admin = createAdminClient();

  let scanQuery = admin
    .from("receipt_scans")
    .select("*")
    .order("scanned_at", { ascending: false })
    .limit(LIST_LIMIT);
  if (restaurantFilter) scanQuery = scanQuery.eq("restaurant_id", restaurantFilter);

  const [{ data: scansRaw, error: scansError }, { data: restaurantsRaw }] = await Promise.all([
    scanQuery,
    admin.from("restaurants").select("id, name").order("name"),
  ]);

  // Page robuste si m58 n'est pas encore appliquée : écran d'attente, pas un crash.
  if (scansError) {
    return (
      <main className="max-w-2xl mx-auto px-4 py-16 text-center">
        <h1 className="text-2xl font-bold text-gray-900">Tickets scannés</h1>
        <p className="mt-4 text-gray-600">
          La table <code className="bg-gray-100 px-1 rounded">receipt_scans</code> n&apos;existe pas
          encore. Applique <code className="bg-gray-100 px-1 rounded">docs/m58-receipt-scans.sql</code>{" "}
          dans l&apos;éditeur SQL Supabase, puis recharge cette page.
        </p>
      </main>
    );
  }

  const scans = (scansRaw as ScanRow[] | null) ?? [];
  const restaurants = ((restaurantsRaw as { id: string; name: string }[] | null) ?? []);
  const restaurantNames = new Map(restaurants.map((r) => [r.id, r.name]));

  const orderIds = scans.map((s) => s.order_id).filter((id): id is string => Boolean(id));
  const userIds = Array.from(new Set(scans.map((s) => s.user_id)));
  const paths = scans.map((s) => s.storage_path).filter((p): p is string => Boolean(p));

  const [{ data: ordersRaw }, { data: profilesRaw }, signedUrls] = await Promise.all([
    orderIds.length
      ? admin.from("orders").select("id, amount, order_number, order_date, status, flag_reasons").in("id", orderIds)
      : Promise.resolve({ data: [] as OrderRow[] }),
    userIds.length
      ? admin.from("profiles").select("id, display_name, email").in("id", userIds)
      : Promise.resolve({ data: [] as { id: string; display_name: string | null; email: string | null }[] }),
    paths.length
      ? admin.storage.from("receipts").createSignedUrls(paths, SIGNED_URL_TTL)
      : Promise.resolve({ data: [] as { path?: string | null; signedUrl: string }[] }),
  ]);

  const ordersById = new Map(((ordersRaw as OrderRow[] | null) ?? []).map((o) => [o.id, o]));
  const membreById = new Map(
    (((profilesRaw as { id: string; display_name: string | null; email: string | null }[] | null) ?? [])).map(
      (p) => [p.id, p.display_name || p.email || "—"]
    )
  );
  const urlByPath = new Map(
    ((signedUrls.data ?? []) as { path?: string | null; signedUrl: string }[])
      .filter((s) => s.path && s.signedUrl)
      .map((s) => [s.path as string, s.signedUrl])
  );

  const soumis = scans.filter((s) => s.outcome === "submitted").length;
  const abandonnes = scans.filter((s) => s.outcome === "parsed").length;
  const refuses = scans.filter((s) => s.outcome === "header_rejected").length;
  const confiances = scans.map((s) => s.ocr_confidence).filter((c): c is number => c !== null);
  const confianceMoyenne = confiances.length
    ? Math.round(confiances.reduce((a, b) => a + b, 0) / confiances.length)
    : null;
  const nbEcarts = scans.filter((s) => ecarts(s, s.order_id ? ordersById.get(s.order_id) ?? null : null).length > 0).length;

  return (
    <main className="max-w-3xl mx-auto px-4 py-8">
      <header className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Tickets scannés</h1>
        <p className="mt-1 text-sm text-gray-600">
          L&apos;image, ce que Claude Vision en a lu, et ce que l&apos;app a encodé — {LIST_LIMIT} derniers
          scans. Les photos sont conservées {RECEIPT_RETENTION_DAYS} jours puis effacées ; la lecture, elle, reste.
        </p>
      </header>

      <nav className="mb-6 flex flex-wrap gap-2 text-sm">
        <Link
          href="/platform/scans"
          className={`px-3 py-1 rounded-full border ${!restaurantFilter ? "bg-gray-900 text-white border-gray-900" : "bg-white text-gray-700 border-gray-300"}`}
        >
          Tous
        </Link>
        {restaurants.map((r) => (
          <Link
            key={r.id}
            href={`/platform/scans?restaurant=${r.id}`}
            className={`px-3 py-1 rounded-full border ${restaurantFilter === r.id ? "bg-gray-900 text-white border-gray-900" : "bg-white text-gray-700 border-gray-300"}`}
          >
            {r.name}
          </Link>
        ))}
      </nav>

      <section className="mb-8 grid grid-cols-2 md:grid-cols-5 gap-3">
        {[
          { label: "Scans", value: String(scans.length) },
          { label: "Devenus commande", value: String(soumis) },
          { label: "Jamais soumis", value: String(abandonnes) },
          { label: "Entête refusée", value: String(refuses) },
          { label: "Confiance moyenne", value: confianceMoyenne === null ? "—" : `${confianceMoyenne} %` },
        ].map((tuile) => (
          <div key={tuile.label} className="bg-white rounded-lg border border-gray-200 p-3">
            <p className="text-xs text-gray-500">{tuile.label}</p>
            <p className="text-xl font-semibold text-gray-900">{tuile.value}</p>
          </div>
        ))}
      </section>

      {nbEcarts > 0 && (
        <p className="mb-4 text-sm text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
          {nbEcarts} scan{nbEcarts > 1 ? "s" : ""} où l&apos;encodage s&apos;écarte de la lecture OCR — colonne « Écart ».
        </p>
      )}

      {scans.length === 0 ? (
        <p className="text-gray-600">
          Aucun scan enregistré pour l&apos;instant. La conservation démarre au premier ticket scanné
          après la mise en production.
        </p>
      ) : (
        <div className="overflow-x-auto bg-white rounded-lg border border-gray-200">
          <table className="min-w-full text-sm">
            <thead className="bg-gray-50 text-left text-xs uppercase tracking-wide text-gray-500">
              <tr>
                <th className="px-3 py-2">Scanné</th>
                <th className="px-3 py-2">Ticket</th>
                <th className="px-3 py-2">Membre</th>
                <th className="px-3 py-2">Lu par Vision</th>
                <th className="px-3 py-2">Encodé par l&apos;app</th>
                <th className="px-3 py-2">Écart</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {scans.map((scan) => {
                const order = scan.order_id ? ordersById.get(scan.order_id) ?? null : null;
                const url = scan.storage_path ? urlByPath.get(scan.storage_path) : null;
                const divergences = ecarts(scan, order);
                const outcome = OUTCOME_LABELS[scan.outcome];
                return (
                  <tr key={scan.id} className="align-top">
                    <td className="px-3 py-3 whitespace-nowrap text-gray-700">
                      {heureBelge(scan.scanned_at)}
                      <span className="block text-xs text-gray-400">
                        {restaurantNames.get(scan.restaurant_id) ?? scan.restaurant_id}
                      </span>
                    </td>
                    <td className="px-3 py-3">
                      {url ? (
                        <a href={url} target="_blank" rel="noopener noreferrer" title="Ouvrir en grand">
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img
                            src={url}
                            alt="Ticket de caisse"
                            className="h-20 w-16 object-cover rounded border border-gray-200 hover:opacity-80"
                          />
                        </a>
                      ) : (
                        <span className="text-xs text-gray-400">
                          {scan.purged_at ? "image effacée" : "aucune image"}
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-3 text-gray-700">{membreById.get(scan.user_id) ?? "—"}</td>
                    <td className="px-3 py-3 text-gray-700">
                      <div>{euros(scan.ocr_amount)}</div>
                      <div className="text-xs text-gray-500">n° {scan.ocr_order_number ?? "—"}</div>
                      <div className="text-xs text-gray-500">
                        confiance {scan.ocr_confidence ?? "—"} % · {scan.ocr_order_time ?? "—"} ·{" "}
                        {scan.ocr_items?.length ?? 0} article{(scan.ocr_items?.length ?? 0) > 1 ? "s" : ""}
                      </div>
                      {scan.ocr_has_restaurant_header === false && (
                        <span className="mt-1 inline-block text-xs px-1.5 py-0.5 rounded bg-purple-100 text-purple-800">
                          entête non reconnue
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-3 text-gray-700">
                      <span className={`inline-block text-xs px-1.5 py-0.5 rounded ${outcome.color}`}>
                        {outcome.label}
                      </span>
                      {order && (
                        <>
                          <div className="mt-1">
                            {euros(order.amount)} · {order.status}
                          </div>
                          <div className="text-xs text-gray-500">n° {order.order_number ?? "—"}</div>
                          {order.flag_reasons && order.flag_reasons.length > 0 && (
                            <div className="text-xs text-gray-500">{order.flag_reasons.join(", ")}</div>
                          )}
                        </>
                      )}
                    </td>
                    <td className="px-3 py-3">
                      {divergences.length === 0 ? (
                        <span className="text-xs text-gray-400">—</span>
                      ) : (
                        <ul className="text-xs text-amber-800 space-y-0.5">
                          {divergences.map((d) => (
                            <li key={d}>{d}</li>
                          ))}
                        </ul>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </main>
  );
}
