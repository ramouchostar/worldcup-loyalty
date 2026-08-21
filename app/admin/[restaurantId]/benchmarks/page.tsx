import { redirect } from "next/navigation";
import { createServerSupabaseClient } from "@/lib/supabase";
import { isEstablishmentAdmin } from "@/lib/admin-guard";
import { computeSectorBenchmarks, WEEKDAY_LABELS, SECTOR_MIN_RESTAURANTS } from "@/lib/sector-benchmarks";
import { getEntitlement, ensureTrialStarted } from "@/lib/entitlements";
import { PaywallSection, TrialBanner } from "@/components/admin/Paywall";

export const metadata = { title: "Repères secteur" };

const euro = (n: number) =>
  Number(n).toLocaleString("fr-BE", { style: "currency", currency: "EUR", maximumFractionDigits: 2 });

// ADR 0029 §7 (Phase 4) — Repères secteur : la seule surface Pro. Agrégats
// anonymisés inter-restos (médianes de cohorte, seuil plancher) — jamais un
// chiffre brut ni un nom d'autre établissement. Le resto voit SA donnée face
// à la médiane. Tous les restos contribuent, seul Pro consulte (§7).
export default async function BenchmarksPage({ params }: { params: Promise<{ restaurantId: string }> }) {
  const { restaurantId } = await params;
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  // Défense en profondeur (CVE-2025-29927) — même patron que forecast/insights.
  if (!(await isEstablishmentAdmin(user.id, restaurantId))) redirect("/join?reason=admin-required");

  const bench = await computeSectorBenchmarks(restaurantId);

  // Essai 30 j quand la fonction peut impressionner (cohorte au plancher).
  if (bench.status === "ok") await ensureTrialStarted(restaurantId, "sector_benchmarks");
  const ent = await getEntitlement(restaurantId, "sector_benchmarks");

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Repères secteur</h1>
        <p className="text-gray-500 text-sm mt-1">
          Où tu te situes face aux établissements comparables du réseau — uniquement des
          médianes anonymisées, jamais les chiffres d&apos;un autre resto.
        </p>
      </div>

      <TrialBanner ent={ent} restaurantId={restaurantId} feature="sector_benchmarks" />

      {bench.status === "insufficient" ? (
        <div className="bg-white rounded-2xl border border-dashed border-gray-200 p-8 text-center">
          <p className="text-3xl mb-2">🌱</p>
          <p className="font-bold text-gray-900">Pas encore assez d&apos;établissements comparables</p>
          <p className="text-sm text-gray-500 mt-2 max-w-md mx-auto">
            Les repères s&apos;affichent à partir de {SECTOR_MIN_RESTAURANTS} établissements
            actifs comparables ({bench.cohortSize} pour l&apos;instant) — un plancher qui
            garantit que personne ne peut être identifié dans les agrégats.
          </p>
        </div>
      ) : (
        <PaywallSection
          ent={ent}
          restaurantId={restaurantId}
          feature="sector_benchmarks"
          title="Débloque tes repères secteur"
          pitch={`La médiane de ${bench.scope === "secteur" ? `ton secteur (${bench.sector})` : "tout le réseau"} est prête — panier, jours forts, ton positionnement. Passe au plan Pro pour la consulter.`}
        >
        <div className="space-y-6">
          <p className="text-xs text-gray-400">
            Basé sur {bench.cohortSize} établissement{bench.cohortSize > 1 ? "s" : ""}{" "}
            {bench.scope === "secteur" ? `de ton secteur (${bench.sector})` : "du réseau"} —
            médianes des 90 derniers jours de commandes scannées, agrégats anonymisés.
          </p>

          {/* Panier moyen */}
          <div className="grid grid-cols-2 gap-3">
            <div className="bg-white rounded-2xl border border-gray-100 p-4 text-center">
              <p className="text-2xl font-black text-gray-900">
                {bench.mine ? euro(bench.mine.avgBasket) : "—"}
              </p>
              <p className="text-xs text-gray-500 mt-1">ton panier moyen</p>
              {!bench.mine && (
                <p className="text-[11px] text-gray-400 mt-1">pas encore assez de commandes scannées</p>
              )}
            </div>
            <div className="bg-white rounded-2xl border border-gray-100 p-4 text-center">
              <p className="text-2xl font-black text-brand-red">{euro(bench.median.avgBasket)}</p>
              <p className="text-xs text-gray-500 mt-1">
                médiane {bench.scope === "secteur" ? "du secteur" : "du réseau"}
              </p>
            </div>
          </div>

          {/* Profil hebdomadaire */}
          <div className="bg-white rounded-2xl border border-gray-100 p-5">
            <h2 className="font-bold text-gray-900 mb-1">Jours forts, jours creux</h2>
            <p className="text-xs text-gray-400 mb-4">
              100&nbsp;% = le jour moyen. {(() => {
                const idx = bench.median.weekdayIndex;
                const top = idx.indexOf(Math.max(...idx));
                const pct = Math.round((idx[top] - 1) * 100);
                return `Le ${WEEKDAY_LABELS[top].toLowerCase()} ${bench.scope === "secteur" ? "de ton secteur" : "du réseau"} fait ${pct >= 0 ? "+" : ""}${pct} % vs sa moyenne.`;
              })()}
            </p>
            <div className="space-y-2">
              {WEEKDAY_LABELS.map((label, i) => {
                const med = bench.median.weekdayIndex[i];
                const mine = bench.mine?.weekdayIndex[i] ?? null;
                return (
                  <div key={label} className="flex items-center gap-2 text-xs">
                    <span className="w-8 text-gray-500 shrink-0">{label}</span>
                    <div className="flex-1 space-y-0.5">
                      <div className="flex items-center gap-1.5">
                        <div className="h-2 rounded-full bg-brand-red/80" style={{ width: `${Math.min(100, med * 50)}%` }} />
                        <span className="text-gray-400 tabular-nums">{Math.round(med * 100)}%</span>
                      </div>
                      {mine !== null && (
                        <div className="flex items-center gap-1.5">
                          <div className="h-2 rounded-full bg-brand-dark/70" style={{ width: `${Math.min(100, mine * 50)}%` }} />
                          <span className="text-gray-400 tabular-nums">{Math.round(mine * 100)}%</span>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
            <div className="flex gap-4 mt-3 text-[11px] text-gray-400">
              <span className="flex items-center gap-1.5">
                <span className="inline-block w-3 h-2 rounded-full bg-brand-red/80" /> médiane{" "}
                {bench.scope === "secteur" ? "secteur" : "réseau"}
              </span>
              {bench.mine && (
                <span className="flex items-center gap-1.5">
                  <span className="inline-block w-3 h-2 rounded-full bg-brand-dark/70" /> toi
                </span>
              )}
            </div>
          </div>

          <div className="bg-gray-50 rounded-xl p-4 text-xs text-gray-500 space-y-1">
            <p>
              💡 Un jour creux chez toi mais fort {bench.scope === "secteur" ? "dans ton secteur" : "dans le réseau"} ={" "}
              une opportunité : les clients sortent ce jour-là, mais pas chez toi. Une promo
              ciblée (Broadcasts) peut inverser la tendance.
            </p>
            <p>
              💡 Ces repères couvrent les commandes scannées par les membres — même biais pour
              tout le monde, donc comparable. Chaque établissement du réseau contribue aux
              médianes, personne n&apos;y est identifiable.
            </p>
          </div>
        </div>
        </PaywallSection>
      )}
    </div>
  );
}
