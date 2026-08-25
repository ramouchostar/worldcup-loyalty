import { redirect } from "next/navigation";
import Link from "next/link";
import { createServerSupabaseClient } from "@/lib/supabase";
import { getPlatformStats, WINDOW_MONTHS } from "@/lib/platform-stats";
import { getAppInstallStats } from "@/lib/app-install";
import { StatTile } from "@/components/platform/StatTile";
import { MonthlyBars } from "@/components/platform/MonthlyBars";
import { FunnelBars } from "@/components/platform/FunnelBars";
import { RestaurantStatsTable } from "@/components/platform/RestaurantStatsTable";

export const metadata = { title: "Chiffres — Plateforme" };

// Chiffres toujours frais : c'est la page qu'on ouvre pour décider, un cache
// de quelques minutes y ferait plus de mal que de bien.
export const dynamic = "force-dynamic";

const euro = new Intl.NumberFormat("fr-BE", { style: "currency", currency: "EUR", maximumFractionDigits: 0 });

// ADR 0033 §2 — traction du réseau, surface super-admin exclusivement. Aucun de
// ces chiffres ne redescend vers un membre (ADR 0007) ni vers un restaurateur
// (ADR 0015 §7 : il ne voit que son propre établissement).
export default async function PlatformStatsPage({
  searchParams,
}: {
  searchParams: Promise<{ demo?: string }>;
}) {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profile } = await supabase.from("profiles").select("is_super_admin").eq("id", user.id).single();
  if (!profile?.is_super_admin) redirect("/join?reason=platform-required");

  const { demo } = await searchParams;
  const includeDemo = demo === "1";

  // getPlatformStats() agrège plusieurs tables paginées (fetchAllRows lève
  // sur la moindre erreur PostgREST — cf. lib/paged-select.ts) : une seule
  // requête qui échoue en base (permission, colonne, timeout) faisait
  // planter TOUTE la page sans le moindre message, un mur blanc bien pire
  // que le mur de zéros qu'on corrige juste en dessous. Un super-admin a
  // déjà passé le contrôle ci-dessus : le message d'erreur brut l'aide à
  // diagnostiquer, il ne fuit vers personne d'autre.
  let stats: Awaited<ReturnType<typeof getPlatformStats>> | null = null;
  let statsError: string | null = null;
  try {
    stats = await getPlatformStats(includeDemo);
  } catch (e) {
    statsError = (e as Error).message;
    console.error("[platform/stats] getPlatformStats failed:", statsError);
  }

  if (!stats) {
    return (
      <div className="max-w-3xl mx-auto space-y-6 py-8 px-4">
        <h1 className="text-2xl font-bold text-gray-900">Chiffres</h1>
        <div className="bg-red-50 border border-red-200 rounded-2xl p-4 text-sm text-red-900">
          <p className="font-semibold">Chiffres indisponibles</p>
          <p className="text-red-700 text-xs mt-0.5">
            Le calcul a échoué côté serveur au lieu de s&apos;afficher. Message :{" "}
            <span className="font-mono">{statsError}</span>
          </p>
        </div>
      </div>
    );
  }

  // App installée (complément ADR 0038) — null tant que la migration manque.
  const installs = await getAppInstallStats();

  const activationDelta = stats.restaurants.activatedThisMonth - stats.restaurants.activatedPrevMonth;
  const engagement =
    stats.members.memberships > 0
      ? Math.round((stats.members.active30d / stats.members.memberships) * 100)
      : 0;

  return (
    <div className="max-w-3xl mx-auto space-y-6 py-8 px-4">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Chiffres</h1>
          <p className="text-gray-500 text-sm mt-1">
            {includeDemo
              ? "Comptes démo inclus — chiffres de vérification, pas de traction."
              : "Réseau réel, comptes démo exclus."}
          </p>
        </div>
        {/* Un commutateur, pas deux pages : le périmètre est un état de la
            lecture, il doit se lire dans l'URL et se partager tel quel. */}
        <Link
          href={includeDemo ? "/platform/stats" : "/platform/stats?demo=1"}
          className="text-xs font-semibold px-3 py-1.5 rounded-lg bg-gray-100 text-gray-700 hover:bg-gray-200 transition-colors shrink-0"
        >
          {includeDemo ? "Masquer les comptes démo" : `Inclure les comptes démo (${stats.demoCount})`}
        </Link>
      </div>

      {stats.demoColumnMissing && (
        <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 text-sm text-amber-900">
          <p className="font-semibold">Migration m56 non appliquée</p>
          <p className="text-amber-700 text-xs mt-0.5">
            Aucun établissement n&apos;est encore distingué comme démo, et les dates
            d&apos;activation retombent sur la date de création. Exécute{" "}
            <span className="font-mono">docs/m56-demo-restaurants-and-backlog.sql</span> dans Supabase.
          </p>
        </div>
      )}

      {/* Le réseau réel (hors démo) est vide : plutôt qu'un mur de zéros et de
          graphiques vides sans explication, on dit pourquoi et comment
          vérifier — c'est très probablement une bascule démo à corriger sur
          l'établissement réel plutôt qu'un réseau réellement sans activité. */}
      {!includeDemo && stats.restaurants.total === 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 text-sm text-amber-900">
          <p className="font-semibold">Aucun établissement réel dans ce périmètre</p>
          <p className="text-amber-700 text-xs mt-0.5">
            {stats.demoCount > 0
              ? `Tous les établissements du réseau (${stats.demoCount}) sont actuellement marqués « démo » — c'est pour ça que rien ne s'affiche ci-dessous. Si un établissement réel a été marqué démo par erreur, repasse-le en réel depuis `
              : "Aucun établissement n'est encore enregistré. Ajoute-en un depuis "}
            <Link href="/platform" className="underline font-semibold">
              Réseau
            </Link>
            {stats.demoCount > 0 ? " (bouton « Passer en réel » sur sa ligne)." : "."}
          </p>
        </div>
      )}

      {stats.truncated && (
        <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 text-sm text-amber-900">
          <p className="font-semibold">Chiffres partiels</p>
          <p className="text-amber-700 text-xs mt-0.5">
            Le plafond de chargement des tickets est atteint : les séries des {WINDOW_MONTHS} derniers
            mois sont tronquées. Il est temps de passer les agrégats en vues SQL.
          </p>
        </div>
      )}

      {/* Ce qu'on regarde en premier : combien d'établissements vivants, et
          combien de gens s'en servent réellement. */}
      <section>
        <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">Aujourd&apos;hui</h2>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          <StatTile
            label="Établissements actifs"
            value={stats.restaurants.active}
            delta={{
              text:
                activationDelta === 0
                  ? "stable vs mois dernier"
                  : `${activationDelta > 0 ? "+" : ""}${activationDelta} vs mois dernier`,
              direction: activationDelta > 0 ? "up" : activationDelta < 0 ? "down" : "flat",
            }}
            hint={`${stats.restaurants.pending} en attente · ${stats.restaurants.disabled} désactivés`}
          />
          <StatTile
            label="Membres actifs (30 j)"
            value={stats.members.active30d}
            tone="accent"
            hint={`${engagement} % des adhésions · ${stats.members.active90d} actifs sur 90 j`}
          />
          <StatTile
            label="Adhésions"
            value={stats.members.memberships}
            hint={`${stats.members.people} personnes · ${stats.members.new30d} nouvelles sur 30 j`}
          />
          <StatTile
            label="App installée"
            value={installs ? installs.total : "—"}
            hint={
              installs
                ? `${installs.byPlatform.ios} iPhone · ${installs.byPlatform.android} Android · ${installs.active30d} ouvertes sur 30 j`
                : "migration 20260822-2023-member-app-installs à appliquer"
            }
          />
          <StatTile
            label="Tickets validés (30 j)"
            value={stats.orders.count30d}
            hint={`${stats.orders.count12m} sur ${WINDOW_MONTHS} mois`}
          />
          <StatTile
            label="CA suivi (30 j)"
            value={euro.format(stats.orders.revenue30d)}
            hint={`${euro.format(stats.orders.revenue12m)} sur ${WINDOW_MONTHS} mois`}
          />
          <StatTile
            label="Panier moyen (30 j)"
            value={euro.format(stats.orders.avgBasket30d)}
            hint="sur les tickets validés du réseau"
          />
        </div>
      </section>

      {/* Une mesure par graphique — jamais deux échelles sur le même axe. */}
      <section className="space-y-4">
        <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-wide">
          Croissance — {WINDOW_MONTHS} derniers mois
        </h2>

        <MonthlyBars
          title="Établissements activés"
          subtitle="Mise en ligne, mois par mois. Un établissement n'est compté qu'à sa PREMIÈRE activation."
          points={stats.activationsByMonth}
        />
        <MonthlyBars
          title="Nouvelles adhésions"
          subtitle="Membres rejoignant un établissement du réseau (un même compte peut en rejoindre plusieurs)."
          points={stats.joinsByMonth}
        />
        <MonthlyBars
          title="Membres actifs"
          subtitle="Comptes distincts ayant fait valider au moins un ticket dans le mois — la mesure d'usage réel."
          points={stats.activeMembersByMonth}
        />
        <MonthlyBars
          title="Tickets validés"
          subtitle="Volume de commandes reconnues par le programme."
          points={stats.ordersByMonth}
        />
        <MonthlyBars
          title="CA suivi par le programme"
          subtitle="Somme des tickets validés. Jamais exposé à un membre ni à un autre établissement (ADR 0007)."
          points={stats.revenueByMonth}
          format={(n) => euro.format(n)}
        />
      </section>

      <section className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5">
        <h2 className="font-bold text-gray-900">Entonnoir d&apos;activation</h2>
        <p className="text-xs text-gray-400 mb-4 mt-0.5">
          Où le réseau perd les établissements entre la signature et un programme qui tourne.
          Le pourcentage est celui de l&apos;étape précédente.
        </p>
        <FunnelBars steps={stats.funnel} />
      </section>

      <section className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5">
        <h2 className="font-bold text-gray-900">Par établissement</h2>
        <p className="text-xs text-gray-400 mb-4 mt-0.5">
          Clique un en-tête pour trier. Le nom mène à la console admin de l&apos;établissement.
        </p>
        <RestaurantStatsTable rows={stats.rows} />
      </section>

      <p className="text-xs text-gray-400">
        Fenêtre d&apos;analyse : depuis {stats.windowStart}. Les tickets comptés sont ceux au
        statut <span className="font-mono">validated</span>.
      </p>
    </div>
  );
}
