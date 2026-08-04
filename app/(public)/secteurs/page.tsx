import Link from "next/link";
import { createAdminClient } from "@/lib/supabase";

// ADR 0016 — page publique "activité par secteur" : preuve sociale pour le
// restaurateur prospect (il y a déjà des clients fidélisés dans sa zone).
// Agrégats non sensibles uniquement — jamais d'euros/CA (ADR 0007 s'applique
// au public), jamais de volumes de commandes.

export const revalidate = 300;

export const metadata = {
  title: "Activité par secteur — Fidélité communautaire",
  description:
    "Découvre l'activité du réseau de fidélité par ville et quartier : établissements, membres et équipes actives.",
};

// ADR 0016 §4 — le secteur est du texte libre : agrégation sur une clé
// normalisée (minuscules, sans accents, espaces réduits).
function sectorKey(sector: string): string {
  return sector
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

type SectorStats = {
  label: string;
  restaurants: string[];
  members: number;
  teams: number;
};

export default async function SectorsPage() {
  // Best-effort : une landing publique ne doit jamais faire échouer le build
  // (prérendu + revalidate 300) à cause d'une env/DB indisponible. Env
  // Supabase absente ou requête en échec → page vide plutôt que déploiement
  // cassé (incident constaté sur PR #32 pour /restaurateurs, même motif ici).
  let restaurantsRaw: { id: string; name: string; sector: string | null }[] = [];
  let membershipsRaw: { restaurant_id: string }[] = [];
  let teamsRaw: { restaurant_id: string }[] = [];
  try {
    const admin = createAdminClient();
    // ADR 0016 §3 — seuls les établissements actifs comptent (pending/disabled
    // restent invisibles, cohérent ADR 0015 §6).
    const [restaurants, memberships, teams] = await Promise.all([
      admin.from("restaurants").select("id, name, sector").eq("status", "active"),
      admin.from("memberships").select("restaurant_id"),
      admin.from("teams").select("restaurant_id").eq("is_active", true),
    ]);
    restaurantsRaw = restaurants.data ?? [];
    membershipsRaw = memberships.data ?? [];
    teamsRaw = teams.data ?? [];
  } catch {
    // best-effort : listes vides, la page rend quand même (état "le réseau démarre")
  }

  const restaurants = restaurantsRaw;

  const membersByRestaurant = new Map<string, number>();
  for (const m of membershipsRaw) {
    membersByRestaurant.set(m.restaurant_id, (membersByRestaurant.get(m.restaurant_id) ?? 0) + 1);
  }
  const teamsByRestaurant = new Map<string, number>();
  for (const t of teamsRaw) {
    teamsByRestaurant.set(t.restaurant_id, (teamsByRestaurant.get(t.restaurant_id) ?? 0) + 1);
  }

  const sectors = new Map<string, SectorStats>();
  for (const r of restaurants) {
    // Restaurant actif sans secteur (antérieur à m30) : regroupé plutôt
    // qu'exclu — visible, donc corrigeable (ADR 0016 § Conséquences).
    const label = r.sector?.trim() || "Secteur non renseigné";
    const key = sectorKey(label);
    const entry = sectors.get(key) ?? { label, restaurants: [], members: 0, teams: 0 };
    entry.restaurants.push(r.name);
    entry.members += membersByRestaurant.get(r.id) ?? 0;
    entry.teams += teamsByRestaurant.get(r.id) ?? 0;
    sectors.set(key, entry);
  }

  const sorted = Array.from(sectors.values()).sort((a, b) => b.members - a.members);
  const totalMembers = sorted.reduce((sum, s) => sum + s.members, 0);

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Hero */}
      <div className="bg-brand-dark text-white py-12">
        <div className="max-w-lg mx-auto px-5 text-center">
          <p className="text-4xl mb-3">📍</p>
          <h1 className="text-3xl font-black mb-3">L&apos;activité du réseau, secteur par secteur</h1>
          <p className="text-gray-400 leading-relaxed text-sm">
            Des communautés de clients fidèles font déjà vivre les restaurants du réseau.
            Voici où elles sont actives.
          </p>
        </div>
      </div>

      {/* Stats réseau */}
      <div className="max-w-lg mx-auto px-5 -mt-6">
        <div className="grid grid-cols-3 gap-3">
          <div className="bg-white rounded-2xl shadow-md border border-gray-100 p-4 text-center">
            <p className="text-2xl font-black text-gray-900">{sorted.length}</p>
            <p className="text-xs text-gray-500 mt-1">secteur{sorted.length > 1 ? "s" : ""}</p>
          </div>
          <div className="bg-white rounded-2xl shadow-md border border-gray-100 p-4 text-center">
            <p className="text-2xl font-black text-gray-900">{restaurants.length}</p>
            <p className="text-xs text-gray-500 mt-1">restaurant{restaurants.length > 1 ? "s" : ""}</p>
          </div>
          <div className="bg-white rounded-2xl shadow-md border border-gray-100 p-4 text-center">
            <p className="text-2xl font-black text-brand-red">{totalMembers}</p>
            <p className="text-xs text-gray-500 mt-1">membre{totalMembers > 1 ? "s" : ""}</p>
          </div>
        </div>
      </div>

      {/* Secteurs */}
      <div className="max-w-lg mx-auto px-5 py-8 space-y-4">
        {sorted.length === 0 ? (
          <div className="bg-white rounded-2xl border border-gray-100 p-8 text-center">
            <p className="text-gray-400 text-sm">
              Le réseau démarre — sois le premier restaurant de ton secteur.
            </p>
          </div>
        ) : (
          sorted.map((s) => (
            <div key={s.label} className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5">
              <div className="flex items-center justify-between mb-3">
                <h2 className="font-bold text-gray-900">📍 {s.label}</h2>
                <span className="text-xs text-gray-400">
                  {s.restaurants.length} restaurant{s.restaurants.length > 1 ? "s" : ""}
                </span>
              </div>
              <div className="grid grid-cols-2 gap-3 mb-3">
                <div className="bg-gray-50 rounded-xl p-3 text-center">
                  <p className="text-xl font-black text-brand-red">{s.members}</p>
                  <p className="text-xs text-gray-500">membre{s.members > 1 ? "s" : ""}</p>
                </div>
                <div className="bg-gray-50 rounded-xl p-3 text-center">
                  <p className="text-xl font-black text-gray-900">{s.teams}</p>
                  <p className="text-xs text-gray-500">équipe{s.teams > 1 ? "s" : ""} active{s.teams > 1 ? "s" : ""}</p>
                </div>
              </div>
              <p className="text-xs text-gray-400">{s.restaurants.join(" · ")}</p>
            </div>
          ))
        )}
      </div>

      {/* CTA restaurateur */}
      <div className="bg-brand-red text-white py-12">
        <div className="max-w-lg mx-auto px-5 text-center">
          <h2 className="text-2xl font-black mb-3">Ton secteur mérite sa communauté</h2>
          <p className="text-red-100 mb-6 text-sm leading-relaxed">
            Inscris ton restaurant et transforme tes clients en équipes fidèles.
          </p>
          <Link
            href="/become-a-partner"
            className="inline-block bg-white text-brand-red font-black px-8 py-4 rounded-2xl hover:bg-red-50 transition-colors shadow-lg"
          >
            Devenir partenaire →
          </Link>
          <p className="mt-4">
            <Link href="/restaurateurs" className="text-red-100 text-xs font-semibold hover:underline">
              Voir comment fonctionne le programme →
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
