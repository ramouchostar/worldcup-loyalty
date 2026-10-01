import Link from "next/link";
import { redirect } from "next/navigation";
import { createServerSupabaseClient } from "@/lib/supabase";
import { loadUserProgress } from "@/lib/partner-progress-server";
import { missingFor, progressTrack, type EstablishmentProgress } from "@/lib/partner-progress";
import { AnalyticsIdentity } from "@/components/analytics/AnalyticsIdentity";

// ADR 0075 §3 — la page d'avancement. Tant qu'un établissement en attente n'a
// pas sa carte ou son ticket, le restaurateur arrive ici (la console le
// renvoie ici). Une seule chose à faire : finir. Les étapes se lisent dans
// les données (lib/partner-progress.ts), jamais déclarées.
export const dynamic = "force-dynamic";

export default async function PartnerProgressPage() {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login?as=resto");

  const list = await loadUserProgress(user.id);
  if (list.length === 0) redirect("/become-a-partner");

  const track = progressTrack(list);
  const noMenu = missingFor(list, "menu");
  const noTicket = missingFor(list, "ticket");
  const remaining = (noMenu.length ? 1 : 0) + (noTicket.length ? 1 : 0);
  const allLive = list.every((e) => e.status === "active");
  if (allLive) redirect("/admin");

  return (
    <div className="min-h-screen bg-gray-50 flex items-start sm:items-center justify-center p-4 py-10">
      <AnalyticsIdentity status="restaurateur" />
      <div className="w-full max-w-md">
        <div className="text-center mb-6">
          <h1 className="text-2xl font-bold text-gray-900">Votre inscription</h1>
          <p className="text-gray-500 text-sm mt-1">
            {remaining > 0
              ? `Encore ${remaining} étape${remaining > 1 ? "s" : ""}, puis notre équipe valide et vos clients peuvent commencer.`
              : "Tout est prêt. Notre équipe vérifie vos établissements et vous écrit dès qu'ils sont en ligne."}
          </p>
        </div>

        <div className="bg-white rounded-2xl shadow-xl p-6 sm:p-8 space-y-5">
          <ol className="flex items-start" aria-label="Avancement de l'inscription">
            {track.map((s, i) => (
              <li key={s.key} className="flex-1 min-w-0 flex flex-col items-center gap-1.5 relative text-center">
                {i > 0 && (
                  <span
                    aria-hidden="true"
                    className={`absolute top-[14px] right-1/2 w-full h-0.5 ${track[i - 1].state === "done" ? "bg-green-600" : "bg-gray-200"}`}
                  />
                )}
                <span
                  className={`relative z-10 w-[30px] h-[30px] rounded-full flex items-center justify-center text-[13px] font-bold ${
                    s.state === "done" ? "bg-green-600 text-white" : s.state === "todo" ? "bg-orange-600 text-white" : "bg-gray-200 text-gray-500"
                  }`}
                >
                  {s.state === "done" ? "✓" : s.state === "todo" ? "!" : i + 1}
                </span>
                <span
                  className={`text-[11px] sm:text-xs truncate max-w-full ${
                    s.state === "done" ? "text-green-700 font-semibold" : s.state === "todo" ? "text-orange-700 font-semibold" : "text-gray-500"
                  }`}
                >
                  {s.label}
                </span>
                <span className="sr-only">
                  {s.state === "done" ? "fait" : s.state === "todo" ? "à faire" : "en attente"}
                </span>
              </li>
            ))}
          </ol>

          {noMenu.length > 0 && (
            <TodoCard
              title="Votre carte"
              text="Pour proposer des cadeaux pris dans ce que vous vendez."
              who={noMenu}
              href={`/become-a-partner/${noMenu[0].id}/menu`}
              cta="Ajouter ma carte"
            />
          )}
          {noTicket.length > 0 && (
            <TodoCard
              title="Un ticket de caisse"
              text="Quelques photos de tickets, pour reconnaître ceux de vos clients."
              who={noTicket}
              href={`/become-a-partner/${noTicket[0].id}/receipt`}
              cta="Prendre le ticket en photo"
            />
          )}

          <ul className="divide-y divide-gray-100 border border-gray-100 rounded-xl">
            {list.map((e) => (
              <li key={e.id} className="flex items-center gap-3 px-4 py-2.5 text-sm">
                <span className="min-w-0 flex-1 truncate">
                  <span className="font-semibold text-gray-900">{e.name}</span>
                  {e.sector && <span className="text-gray-500"> · {e.sector}</span>}
                </span>
                <StatusChip e={e} />
              </li>
            ))}
          </ul>

          <p className="text-xs text-gray-500 text-center">
            {remaining > 0
              ? "La validation par notre équipe commence quand les étapes en orange sont faites."
              : "Aucune action de votre part : nous vous écrivons à la validation."}{" "}
            <Link href="/become-a-partner" className="font-semibold text-brand-red hover:underline">
              + Ajouter un établissement
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}

function TodoCard({ title, text, who, href, cta }: { title: string; text: string; who: EstablishmentProgress[]; href: string; cta: string }) {
  return (
    <div className="border-[1.5px] border-orange-600 bg-orange-50 rounded-xl p-4 flex flex-wrap items-center gap-3">
      <div className="flex-1 min-w-[12rem]">
        <p className="font-semibold text-gray-900">{title}</p>
        <p className="text-xs text-gray-600">{text}</p>
        {who.length > 1 && (
          <p className="text-xs text-gray-600 mt-0.5">Pour : {who.map((e) => e.sector ?? e.name).join(", ")}.</p>
        )}
      </div>
      <Link href={href} className="bg-orange-600 hover:bg-orange-700 text-white text-sm font-semibold px-4 py-2.5 rounded-lg transition-colors">
        {cta}
      </Link>
    </div>
  );
}

function StatusChip({ e }: { e: EstablishmentProgress }) {
  if (e.status === "active") {
    return (
      <Link href={`/admin/${e.id}`} className="text-xs font-semibold text-green-700 bg-green-50 rounded-full px-2.5 py-1 hover:underline">
        En ligne · console
      </Link>
    );
  }
  if (e.status === "pending" && e.hasMenu && e.hasTicket) {
    return <span className="text-xs font-semibold text-gray-600 bg-gray-100 rounded-full px-2.5 py-1">En validation</span>;
  }
  if (e.status === "pending") {
    return <span className="text-xs font-semibold text-orange-700 bg-orange-50 rounded-full px-2.5 py-1">À compléter</span>;
  }
  return <span className="text-xs font-semibold text-gray-500 bg-gray-100 rounded-full px-2.5 py-1">Désactivé</span>;
}
