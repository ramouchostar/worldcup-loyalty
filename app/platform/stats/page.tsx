import { redirect } from "next/navigation";
import Link from "next/link";
import { createServerSupabaseClient } from "@/lib/supabase";
import { getHealthMetrics } from "@/lib/health-metrics";
import { HealthMetricTile } from "@/components/platform/HealthMetricTile";

export const metadata = { title: "Chiffres — Plateforme" };

// Chiffres toujours frais : c'est la page qu'on ouvre pour décider, un cache
// de quelques minutes y ferait plus de mal que de bien.
export const dynamic = "force-dynamic";

// ADR 0033 §2 — traction du réseau, surface super-admin exclusivement. Aucun de
// ces chiffres ne redescend vers un membre (ADR 0007) ni vers un restaurateur
// (ADR 0015 §7 : il ne voit que son propre établissement).
//
// v2 (2026-08-26) : l'ancienne version agrégeait tout le réseau (établissements,
// adhésions, commandes, CA sur 12 mois) en une passe — cette agrégation lourde
// provoquait une erreur serveur en prod, sans qu'on puisse voir pourquoi faute
// de logs accessibles. Reconstruite autour de TROIS indicateurs de santé
// produit calculés par des requêtes ciblées et légères (lib/health-metrics.ts) :
// activation, rétention, récupération des récompenses — pas de fenêtre glissante
// de 12 mois à charger.
export default async function PlatformStatsPage() {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profile } = await supabase.from("profiles").select("is_super_admin").eq("id", user.id).single();
  if (!profile?.is_super_admin) redirect("/join?reason=platform-required");

  let metrics: Awaited<ReturnType<typeof getHealthMetrics>> | null = null;
  let error: string | null = null;
  try {
    metrics = await getHealthMetrics();
  } catch (e) {
    error = (e as Error).message;
    console.error("[platform/stats] getHealthMetrics failed:", error);
  }

  return (
    <div className="max-w-3xl mx-auto space-y-6 py-8 px-4">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Chiffres</h1>
        <p className="text-gray-500 text-sm mt-1">
          Santé du programme sur le réseau réel — comptes démo exclus (ADR 0033).
        </p>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-2xl p-4 text-sm text-red-900">
          <p className="font-semibold">Chiffres indisponibles</p>
          <p className="text-red-700 text-xs mt-0.5">
            Le calcul a échoué côté serveur. Message : <span className="font-mono">{error}</span>
          </p>
        </div>
      )}

      {metrics && metrics.restaurantCount === 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 text-sm text-amber-900">
          <p className="font-semibold">Aucun établissement réel dans le réseau</p>
          <p className="text-amber-700 text-xs mt-0.5">
            Tous les établissements sont marqués « démo », ou aucun n&apos;est encore actif. Vérifie depuis{" "}
            <Link href="/platform" className="underline font-semibold">
              Réseau
            </Link>
            .
          </p>
        </div>
      )}

      {metrics && metrics.restaurantCount > 0 && (
        <div className="space-y-4">
          <HealthMetricTile
            title="Taux d'activation"
            description="% des membres du réseau réel ayant soumis au moins un ticket validé."
            metric={metrics.activation}
            tierLabels={{ good: "Encourageant", mid: "À creuser", low: "Sérieux" }}
            thresholds={{ goodMin: 30, midMin: 15 }}
            denominatorLabel="membres"
          />
          <HealthMetricTile
            title="Taux de rétention"
            description="% des membres activés ayant soumis un 2e ticket un autre jour. Vrai changement d'habitude, pas curiosité ponctuelle."
            metric={metrics.retention}
            tierLabels={{ good: "Bon signal", mid: "Mixte", low: "Faible" }}
            thresholds={{ goodMin: 40, midMin: 20 }}
            denominatorLabel="membres activés"
          />
          <HealthMetricTile
            title="Récupération des récompenses"
            description="% des cadeaux validés réellement récupérés au comptoir avant expiration (48h, ADR 0011). Teste si la boucle se referme côté opérationnel."
            metric={metrics.redemption}
            tierLabels={{ good: "Sain", mid: "Process comptoir ?", low: "Problème ops" }}
            thresholds={{ goodMin: 70, midMin: 40 }}
            denominatorLabel="cadeaux tranchés"
          />
        </div>
      )}

      <p className="text-xs text-gray-400">
        Chiffres cumulés depuis le début du programme, réseau réel uniquement
        {metrics ? ` (${metrics.restaurantCount} établissement${metrics.restaurantCount > 1 ? "s" : ""})` : ""}.
      </p>
    </div>
  );
}
