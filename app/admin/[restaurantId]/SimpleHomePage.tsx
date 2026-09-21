import Link from "next/link";
import { Hourglass, SlidersHorizontal } from "lucide-react";
import { getRestaurant } from "@/lib/restaurant";
import { getAdminAccess, canManageEstablishment } from "@/lib/admin-guard";
import { loadSimpleHomeRaw } from "@/lib/console-journey-data";
import { buildSimpleHomeView } from "@/lib/console-journey";
import { InstallAppCard } from "@/components/InstallAppCard";
import { SimpleHome } from "@/components/admin/simple/SimpleHome";

// Accueil de la vue simple (ADR 0064) — la page charge, lib/console-journey.ts
// calcule, SimpleHome affiche. Les bandeaux ponctuels du dashboard pro
// (établissement pas encore en ligne, siège rétrogradé, première visite) sont
// repris à l'identique : ils disent quelque chose qu'on ne peut pas taire.
export async function SimpleHomePage({
  restaurantId,
  userId,
  bienvenue,
  seat,
}: {
  restaurantId: string;
  userId: string;
  bienvenue: boolean;
  seat?: string;
}) {
  const base = `/admin/${restaurantId}`;
  const [access, restaurant] = await Promise.all([getAdminAccess(userId, restaurantId), getRestaurant(restaurantId)]);
  const view = buildSimpleHomeView(await loadSimpleHomeRaw(restaurantId, { canManage: canManageEstablishment(access) }));

  const dateLabel = capitalize(
    new Date().toLocaleDateString("fr-BE", { weekday: "long", day: "numeric", month: "long", timeZone: "Europe/Brussels" })
  );

  const top = (
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

      {restaurant?.status === "pending" && (
        <div className="bg-warn/10 border border-warn/30 rounded-xl p-4">
          <p className="font-bold text-warn text-sm mb-1">
            <Hourglass size={14} strokeWidth={1.8} className="inline-block mr-1.5 -mt-0.5" aria-hidden="true" />
            Ton établissement n&apos;est pas encore visible des clients
          </p>
          <p className="text-xs text-warn mb-3">
            Il sera mis en ligne après validation par notre équipe. En attendant, termine ton menu et la configuration
            de ton ticket de caisse.
          </p>
          <div className="flex flex-wrap gap-2">
            <Link href={`${base}/menu`} className="text-xs font-semibold bg-white border border-warn/30 text-warn px-3 py-2 rounded-lg hover:bg-warn/10 transition-colors">
              Menu &amp; coûts →
            </Link>
            <Link href={`/become-a-partner/${restaurantId}/receipt`} className="text-xs font-semibold bg-white border border-warn/30 text-warn px-3 py-2 rounded-lg hover:bg-warn/10 transition-colors">
              Ticket de caisse →
            </Link>
          </div>
        </div>
      )}
    </>
  );

  const bottom = (
    <>
      {!bienvenue && <InstallAppCard audience="restaurateur" surface="console_admin" ton="discret" />}
      <Link
        href={`${base}/vue?mode=pro`}
        className="flex items-center gap-3 px-5 py-3.5 bg-white border border-dashed border-paper-border rounded-xl hover:bg-paper transition-colors md:hidden"
      >
        <SlidersHorizontal size={17} strokeWidth={1.7} className="text-ink-muted shrink-0" aria-hidden="true" />
        <span className="flex-1 min-w-0">
          <span className="block text-[13.5px] font-semibold text-ink">Voir tous les chiffres</span>
          <span className="block text-[12px] text-ink-faint">Passer en vue pro : ventes, prévisions, repères, réglages</span>
        </span>
      </Link>
    </>
  );

  return <SimpleHome view={view} dateLabel={dateLabel} top={top} bottom={bottom} />;
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}
