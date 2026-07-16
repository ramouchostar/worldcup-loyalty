import type { Metadata } from "next";
import { createAdminClient } from "@/lib/supabase";
import { InviteRedirect } from "./InviteRedirect";

const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? "https://worldcup-loyalty.vercel.app";

type Props = { searchParams: { ref?: string } };

// La surface la plus partagée de l'app (lien WhatsApp de parrainage) : le
// branding doit être celui de l'établissement du parrain, jamais un resto
// codé en dur (ADR 0015). Résolu via referral_links.restaurant_id ; sans
// code valide, texte plateforme neutre.
async function resolveInviteRestaurant(ref: string | undefined): Promise<string | null> {
  if (!ref) return null;
  try {
    const admin = createAdminClient();
    const { data } = await admin
      .from("referral_links")
      .select("restaurant_id, restaurants(name)")
      .eq("code", ref)
      .maybeSingle();
    const resto = Array.isArray(data?.restaurants) ? data?.restaurants[0] : data?.restaurants;
    return (resto as { name: string } | null)?.name ?? null;
  } catch {
    return null;
  }
}

export async function generateMetadata({ searchParams }: Props): Promise<Metadata> {
  const restaurantName = await resolveInviteRestaurant(searchParams.ref);
  const title = restaurantName
    ? `Rejoins ma communauté ${restaurantName} 🏆`
    : "Rejoins ma communauté 🏆";
  const description = restaurantName
    ? `Un ami t'invite à rejoindre la fidélité de ${restaurantName}. Commande directement au restaurant, fais monter le score de ton équipe et gagnez des cadeaux ensemble !`
    : "Un ami t'invite à rejoindre son programme de fidélité. Commande directement au restaurant, fais monter le score de ton équipe et gagnez des cadeaux ensemble !";

  return {
    title,
    description,
    openGraph: {
      title,
      description,
      images: [{ url: `${APP_URL}/api/icons/512`, width: 512, height: 512, alt: "Boosteats" }],
      url: `${APP_URL}/invite${searchParams.ref ? `?ref=${searchParams.ref}` : ""}`,
      type: "website",
      siteName: "Boosteats",
    },
    twitter: {
      card: "summary",
      title,
      description,
    },
  };
}

export default async function InvitePage({ searchParams }: Props) {
  const ref = searchParams.ref ?? "";
  const joinPath = `/join${ref ? `?ref=${ref}` : ""}`;
  const restaurantName = await resolveInviteRestaurant(searchParams.ref);

  return (
    <main className="min-h-screen bg-brand-dark flex flex-col items-center justify-center px-6 text-center text-white">
      <div className="max-w-sm w-full">
        {/* Logo */}
        <div className="w-24 h-24 bg-brand-red rounded-3xl flex items-center justify-center mx-auto mb-6 shadow-xl">
          <span className="text-5xl leading-none">🏆</span>
        </div>

        <h1 className="text-2xl font-black mb-3 leading-tight">
          {restaurantName ? (
            <>Rejoins la communauté<br />{restaurantName} !</>
          ) : (
            <>Rejoins la communauté !</>
          )}
        </h1>
        <p className="text-gray-400 text-sm leading-relaxed mb-8">
          Un ami t&apos;invite à rejoindre sa communauté. Commande directement au restaurant, fais
          monter le score de ton équipe et gagnez des cadeaux ensemble.
        </p>

        <a
          href={joinPath}
          className="block w-full bg-brand-red text-white py-4 rounded-2xl font-bold text-lg hover:bg-red-700 transition-colors"
        >
          Rejoindre la communauté →
        </a>

        <p className="text-xs text-gray-600 mt-4">
          Inscription rapide • Aucune carte requise
        </p>
      </div>

      {/* Auto-redirect after 1.5s for users who click the WhatsApp link */}
      <InviteRedirect joinPath={joinPath} />
    </main>
  );
}
