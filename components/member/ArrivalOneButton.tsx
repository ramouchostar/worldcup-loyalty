import Link from "next/link";
import { Camera } from "@/components/icons";

// ADR 0097 — écran d'arrivée par le QR imprimé : un seul geste. Toute la surface est un lien vers
// l'écran ticket, qui ouvre directement la caméra (ADR 0057) ; le seul autre élément est le petit
// lien de connexion en bas (un membre déconnecté ne doit jamais rester dehors).
//
// Un <Link> couvrant l'écran, et non un bouton : la navigation n'exige aucun script et la caméra
// s'ouvre sur la page suivante, comme avec le bouton de la vitrine (même nombre de gestes).
export function ArrivalOneButton({
  restaurantId,
  restaurantName,
  logoUrl,
  offerLine,
  loginAction,
}: {
  restaurantId: string;
  restaurantName: string;
  logoUrl: string | null;
  offerLine: string | null;
  loginAction: () => Promise<void>;
}) {
  return (
    <div className="min-h-screen flex flex-col bg-white">
      <Link
        href={`/r/${restaurantId}/submit-order`}
        aria-label="Photographier mon ticket de caisse"
        className="flex-1 flex flex-col items-center justify-center text-center gap-5 px-6 py-10 bg-brand-red/10"
      >
        {logoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={logoUrl} alt={restaurantName} className="block h-14 w-auto object-contain" />
        ) : (
          <p className="text-sm font-semibold text-gray-700">{restaurantName}</p>
        )}
        <span className="flex h-24 w-24 items-center justify-center rounded-full bg-brand-red text-white shadow-lg">
          <Camera size={44} aria-hidden="true" />
        </span>
        <h1 className="text-3xl font-black leading-tight tracking-tight text-gray-900">
          Photographie ton ticket de caisse
        </h1>
        <p className="text-base text-gray-600">Pas le QR code, le ticket imprimé</p>
        {offerLine && (
          <span className="rounded-full bg-white px-4 py-2 text-sm font-semibold text-gray-800">{offerLine}</span>
        )}
        <p className="text-xs text-gray-500">Touche n&apos;importe où pour ouvrir la caméra</p>
      </Link>
      <form action={loginAction} className="py-3 text-center">
        <button type="submit" className="text-xs text-gray-500 hover:text-gray-700">
          Déjà membre ? <span className="font-semibold underline">Se connecter</span>
        </button>
      </form>
    </div>
  );
}
