import Link from "next/link";
import { Gauge } from "@/components/icons";
import { ConsolePushCard } from "@/components/admin/ConsolePushCard";
import { InstallAppCard } from "@/components/InstallAppCard";

// Les bandeaux ponctuels de la page d'arrivée de la vue simple — repris du
// dashboard pro (ils disent quelque chose qu'on ne peut pas taire). Partagés
// entre « Stats » (l'arrivée) et « Ta progression » (l'ancien accueil).

export function HomeTopNotices({ bienvenue, seat, pending }: { bienvenue: boolean; seat?: string; pending: boolean }) {
  return (
    <>
      {/* ADR 0038 §3 — première arrivée par lien d'invitation : l'app d'abord. */}
      {bienvenue && <InstallAppCard audience="restaurateur" surface="console_premiere_visite" ton="accueil" />}

      {/* ADR 0041 — rôle proposé rétrogradé en équipe (quota atteint). */}
      {seat === "equipe-quota" && (
        <div className="bg-paper-subtle border border-paper-border rounded-xl p-4">
          <p className="text-sm text-ink-body">
            Ton accès a été ajouté en <strong>équipe (accès établissement)</strong> — le quota de gérants/managers était
            déjà atteint. Ton accès à la console reste complet.
          </p>
        </div>
      )}

      {pending && (
        <div className="bg-warn/10 border border-warn/30 rounded-xl p-4">
          <p className="font-bold text-warn text-sm mb-1">
            Ton établissement n&apos;est pas encore visible des clients
          </p>
          {/* ADR 0075 §3 — en attente = inscription finie, validation en cours. */}
          <p className="text-xs text-warn">
            Ton inscription est complète : notre équipe le vérifie et te prévient dès qu&apos;il est en ligne.
          </p>
        </div>
      )}
    </>
  );
}

export function HomeBottomNotices({ restaurantId, bienvenue }: { restaurantId: string; bienvenue: boolean }) {
  return (
    <>
      <ConsolePushCard restaurantId={restaurantId} />
      {!bienvenue && <InstallAppCard audience="restaurateur" surface="console_admin" ton="discret" />}
      <Link
        href={`/admin/${restaurantId}/vue?mode=pro`}
        className="flex items-center gap-3 px-5 py-3.5 bg-white border border-dashed border-paper-border rounded-xl hover:bg-paper transition-colors md:hidden"
      >
        <Gauge size={17} className="text-ink-muted shrink-0" />
        <span className="flex-1 min-w-0">
          <span className="block text-[13.5px] font-semibold text-ink">Voir tous les chiffres</span>
          <span className="block text-[12px] text-ink-faint">Passer en vue pro : ventes, prévisions, repères, réglages</span>
        </span>
      </Link>
    </>
  );
}
