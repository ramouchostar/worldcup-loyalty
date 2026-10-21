import Link from "next/link";
import { redirect } from "next/navigation";
import { createServerSupabaseClient } from "@/lib/supabase";
import { listOpenDisputes } from "@/lib/missions-superadmin";
import { listDemoRestaurants, testSetState } from "@/lib/missions-test-set";
import { METIER_LABELS } from "@/lib/mission-view";
import type { Metier } from "@/lib/mission-money";
import { SubNav } from "../SubNav";
import { EraseButton, GenerateForm } from "./TestSetControls";

export const metadata = { title: "Jeu de test — Prestataires — Plateforme" };
export const dynamic = "force-dynamic";

const CARD = "bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-2xl";

// ADR 0084 §5 quindecies — de quoi parcourir le module de bout en bout sans inviter de vrais prestataires.
export default async function TestSetPage() {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const { data: profile } = await supabase.from("profiles").select("is_super_admin").eq("id", user.id).single();
  if (!profile?.is_super_admin) redirect("/join?reason=platform-required");

  const [state, restaurants, disputes] = await Promise.all([testSetState(), listDemoRestaurants(), listOpenDisputes()]);
  const unavailable = "unavailable" in state;

  return (
    <div className="space-y-6 max-w-3xl">
      <div className="space-y-3">
        <h1 className="text-2xl font-bold">Jeu de test</h1>
        <SubNav active="test" disputes={disputes.length} />
      </div>

      <section className={`${CARD} p-5 space-y-3`}>
        <h2 className="font-semibold">Ce que ça fait</h2>
        <ul className="text-sm text-gray-600 dark:text-gray-300 list-disc pl-5 space-y-1">
          <li>Crée 4 prestataires « [TEST] », un par métier (vidéo, photo, design, impression), avec des alias de ton adresse e-mail : <code>toi+test-video@…</code>. Photo en néerlandais, design en anglais.</li>
          <li>Envoie une mission chez chacun, sur un établissement de démonstration, avec un brief complet. Tu continues à la main : devis, acceptation, date, livraison…</li>
          <li>Un prestataire « [TEST] » ne reçoit jamais le brief d&apos;un vrai client. « Tout effacer » ne retire que ce qui porte « [TEST] ».</li>
          <li>Chaque prestataire reçoit son e-mail d&apos;invitation sur ton alias (si l&apos;envoi est configuré) ; les liens sont aussi ci-dessous. Ouvre chaque lien dans une fenêtre privée, connecte-toi avec l&apos;alias (lien magique), et tu es ce prestataire.</li>
        </ul>
      </section>

      {unavailable ? (
        <section className={`${CARD} p-5`}>
          <p className="text-sm text-gray-500">Le module n&apos;est pas encore disponible : applique les migrations du module Prestataires.</p>
        </section>
      ) : state.providers.length === 0 ? (
        <section className={`${CARD} p-5 space-y-3`}>
          <h2 className="font-semibold">Générer</h2>
          {restaurants.length === 0 ? (
            <p className="text-sm text-amber-700">Aucun établissement de démonstration : un jeu de test ne se crée jamais chez un vrai client. Marque d&apos;abord un établissement comme démo.</p>
          ) : (
            <GenerateForm restaurants={restaurants} />
          )}
        </section>
      ) : (
        <>
          <section className={`${CARD} p-5 space-y-3`}>
            <h2 className="font-semibold">Les prestataires de test</h2>
            <ul className="space-y-3">
              {state.providers.map((p) => (
                <li key={p.id} className="text-sm space-y-1">
                  <p className="font-semibold">{p.name}</p>
                  <p className="text-gray-500">
                    {p.email} · {p.status === "invited" ? "invitation à ouvrir" : p.status}
                  </p>
                  {p.invite && (
                    <p>
                      <a href={p.invite.url} target="_blank" rel="noopener noreferrer" className="underline break-all">
                        {p.invite.url}
                      </a>
                    </p>
                  )}
                </li>
              ))}
            </ul>
          </section>

          <section className={`${CARD} p-5 space-y-3`}>
            <h2 className="font-semibold">Les missions de test</h2>
            <ul className="space-y-2">
              {state.missions.map((m) => (
                <li key={m.id} className="text-sm">
                  <Link href={`/admin/${m.restaurantId}/prestataires/${m.id}`} className="underline font-semibold">
                    {METIER_LABELS[m.metier as Metier] ?? m.metier}
                  </Link>{" "}
                  · {m.restaurantName ?? m.restaurantId} · état « {m.status} »
                </li>
              ))}
            </ul>
          </section>

          <section className={`${CARD} p-5 space-y-3`}>
            <h2 className="font-semibold">Recommencer à zéro</h2>
            <EraseButton />
          </section>
        </>
      )}
    </div>
  );
}
