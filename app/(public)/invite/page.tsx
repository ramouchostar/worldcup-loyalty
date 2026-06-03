import type { Metadata } from "next";
import { InviteRedirect } from "./InviteRedirect";

const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? "https://worldcup-loyalty.vercel.app";

type Props = { searchParams: { ref?: string } };

export async function generateMetadata({ searchParams }: Props): Promise<Metadata> {
  return {
    title: "Rejoins ma communauté Belchicken 🏆",
    description:
      "Un ami t'invite à rejoindre la fidélité WorldCup 2026. Commande chez Belchicken, fais monter le score de ton équipe et gagne des churros ensemble !",
    openGraph: {
      title: "Rejoins ma communauté Belchicken 🏆",
      description:
        "Commande directement au restaurant, gagne des burgers et des churros avec ton équipe Coupe du Monde 2026.",
      images: [{ url: `${APP_URL}/api/icons/512`, width: 512, height: 512, alt: "WorldCup Loyalty Belchicken" }],
      url: `${APP_URL}/invite${searchParams.ref ? `?ref=${searchParams.ref}` : ""}`,
      type: "website",
      siteName: "WorldCup Loyalty — Belchicken",
    },
    twitter: {
      card: "summary",
      title: "Rejoins ma communauté Belchicken 🏆",
      description: "Gagne des récompenses chez Belchicken avec ta communauté Coupe du Monde 2026.",
    },
  };
}

export default function InvitePage({ searchParams }: Props) {
  const ref = searchParams.ref ?? "";
  const joinPath = `/join${ref ? `?ref=${ref}` : ""}`;

  return (
    <main className="min-h-screen bg-brand-dark flex flex-col items-center justify-center px-6 text-center text-white">
      <div className="max-w-sm w-full">
        {/* Logo */}
        <div className="w-24 h-24 bg-brand-red rounded-3xl flex items-center justify-center mx-auto mb-6 shadow-xl">
          <span className="text-5xl font-black text-brand-gold leading-none">B</span>
        </div>

        <h1 className="text-2xl font-black mb-3 leading-tight">
          Rejoins Belchicken<br />WorldCup 2026 !
        </h1>
        <p className="text-gray-400 text-sm leading-relaxed mb-8">
          Un ami t&apos;invite à rejoindre sa communauté. Commande directement au restaurant, fais
          monter le score de ton équipe et gagne des churros ensemble.
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
