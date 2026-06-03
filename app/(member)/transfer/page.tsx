import { redirect } from "next/navigation";
import { createServerSupabaseClient } from "@/lib/supabase";
import { TransferForm } from "@/components/member/TransferForm";
import type { Team } from "@/types";

type TransferRow = {
  id: string;
  transferred_at: string;
  from_team: { name: string; flag_emoji: string } | null;
  to_team: { name: string; flag_emoji: string };
};

type ProfileWithTeam = {
  team_id: string;
  teams: { name: string; flag_emoji: string; is_active: boolean; round_reached: string };
};

export default async function TransferPage() {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const [{ data: profileRaw }, { data: teamsRaw }, { data: historyRaw }] = await Promise.all([
    supabase
      .from("profiles")
      .select("team_id, teams(name, flag_emoji, is_active, round_reached)")
      .eq("id", user.id)
      .single(),
    supabase
      .from("teams")
      .select("id, name, flag_emoji, is_active, round_reached")
      .eq("is_active", true)
      .order("name"),
    supabase
      .from("transfers")
      .select(`
        id,
        transferred_at,
        from_team:teams!transfers_from_team_id_fkey (name, flag_emoji),
        to_team:teams!transfers_to_team_id_fkey (name, flag_emoji)
      `)
      .eq("user_id", user.id)
      .order("transferred_at", { ascending: false })
      .limit(10),
  ]);

  const profile = profileRaw as unknown as ProfileWithTeam | null;
  if (!profile?.team_id) redirect("/register");

  const allActiveTeams = (teamsRaw as Team[] ?? []).filter(
    (t) => t.id !== profile.team_id
  );
  const history = (historyRaw as unknown as TransferRow[]) ?? [];

  const currentTeam = profile.teams;
  const isEliminated = !currentTeam.is_active;

  const roundLabels: Record<string, string> = {
    group_stage: "Phase de groupes",
    round_of_16: "Huitièmes de finale",
    quarter_final: "Quarts de finale",
    semi_final: "Demi-finales",
    final: "Finale",
    winner: "Champion 🏆",
  };

  return (
    <div className="space-y-5 pb-4">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Changer d&apos;équipe</h1>
        <p className="text-gray-500 text-sm mt-1">
          Rejoins la communauté d&apos;une équipe encore en course.
        </p>
      </div>

      {/* Équipe actuelle */}
      <div className={`rounded-2xl border p-5 ${
        isEliminated
          ? "bg-red-50 border-red-200"
          : "bg-white border-gray-100 shadow-sm"
      }`}>
        <p className="text-xs text-gray-500 uppercase tracking-wide mb-2">Équipe actuelle</p>
        <div className="flex items-center gap-3">
          <span className="text-4xl">{currentTeam.flag_emoji}</span>
          <div>
            <p className="font-bold text-gray-900 text-lg">{currentTeam.name}</p>
            <p className={`text-sm ${isEliminated ? "text-red-600 font-medium" : "text-gray-500"}`}>
              {isEliminated
                ? "🔴 Équipe éliminée du tournoi"
                : roundLabels[currentTeam.round_reached] ?? currentTeam.round_reached}
            </p>
          </div>
        </div>

        {isEliminated && (
          <div className="mt-3 bg-red-100 rounded-lg p-3">
            <p className="text-red-800 text-sm">
              Ton équipe est hors compétition. Transfère-toi vers une équipe active
              pour continuer à accumuler des points avec ta communauté.
            </p>
          </div>
        )}

        {!isEliminated && (
          <div className="mt-3 bg-amber-50 rounded-lg p-3">
            <p className="text-amber-800 text-sm">
              ⚠️ Ton équipe est encore en course. Tu peux quand même changer,
              mais tu quitteras ta communauté actuelle.
            </p>
          </div>
        )}
      </div>

      {/* Formulaire de transfert */}
      <TransferForm teams={allActiveTeams} />

      {/* Historique des transferts */}
      {history.length > 0 && (
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5">
          <h3 className="font-bold text-gray-900 mb-4">Historique de tes transferts</h3>
          <div className="space-y-3">
            {history.map((t) => (
              <div key={t.id} className="flex items-center gap-3 text-sm">
                <div className="flex items-center gap-1.5 text-gray-500">
                  {t.from_team ? (
                    <>
                      <span>{t.from_team.flag_emoji}</span>
                      <span className="font-medium text-gray-700">{t.from_team.name}</span>
                    </>
                  ) : (
                    <span className="italic text-gray-400">Inscription</span>
                  )}
                </div>
                <span className="text-brand-gold font-bold">→</span>
                <div className="flex items-center gap-1.5">
                  <span>{t.to_team.flag_emoji}</span>
                  <span className="font-medium text-gray-900">{t.to_team.name}</span>
                </div>
                <span className="ml-auto text-xs text-gray-400 shrink-0">
                  {new Date(t.transferred_at).toLocaleDateString("fr-BE")}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
