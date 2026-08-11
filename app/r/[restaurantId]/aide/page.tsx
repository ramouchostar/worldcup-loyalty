import { notFound } from "next/navigation";
import Link from "next/link";
import { getRestaurant } from "@/lib/restaurant";

// Audit UX 2026-08-11, constat C2 — page « Besoin d'aide ? » : le filet
// humain de l'app. Langage simple (niveau B1), jamais d'euros ni de CA
// (ADR 0007). Hérite du layout membre : header + BottomNav automatiques.
export default async function AidePage({
  params,
}: {
  params: Promise<{ restaurantId: string }>;
}) {
  const { restaurantId } = await params;
  const restaurant = await getRestaurant(restaurantId);
  if (!restaurant) notFound();

  // Numéro WhatsApp joignable du restaurant : aucune source disponible
  // aujourd'hui — la table `restaurants` n'a pas de colonne téléphone
  // (m27/m29/m37/m48), et WHATSAPP_PHONE_NUMBER_ID est un identifiant API
  // Meta (envoi sortant), pas un numéro joignable. Dès qu'une colonne
  // (ex. whatsapp_number) existera, la brancher ici : la carte WhatsApp
  // s'affichera automatiquement.
  const whatsappNumber: string | null = null;
  const whatsappUrl = whatsappNumber
    ? `https://wa.me/${whatsappNumber}?text=${encodeURIComponent(
        `Bonjour, j'ai une question sur l'app ${restaurant.name}.`
      )}`
    : null;

  return (
    <div className="space-y-5 pb-4">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Besoin d&apos;aide ?</h1>
        <p className="text-gray-500 text-sm mt-1">
          Une vraie personne peut t&apos;aider. Voici comment.
        </p>
      </div>

      {/* Carte 1 — le comptoir, toujours disponible */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
        <div className="flex items-center gap-3 mb-2">
          <span className="text-2xl" aria-hidden="true">🧑‍🍳</span>
          <h2 className="font-bold text-gray-900">Au restaurant</h2>
        </div>
        <p className="text-sm text-gray-600 leading-relaxed">
          L&apos;équipe au comptoir peut tout faire avec toi : scanner ton ticket,
          récupérer ton cadeau, répondre à tes questions.
        </p>
      </div>

      {/* Carte 2 — WhatsApp si un numéro existe, sinon la page feedback du resto */}
      {whatsappUrl ? (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
          <div className="flex items-center gap-3 mb-2">
            <span className="text-2xl" aria-hidden="true">💬</span>
            <h2 className="font-bold text-gray-900">Par WhatsApp</h2>
          </div>
          <p className="text-sm text-gray-600 leading-relaxed mb-4">
            Écris-nous, on te répond comme à un ami.
          </p>
          <a
            href={whatsappUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center justify-center gap-2 w-full min-h-[48px] bg-[#25D366] text-white py-3 px-5 rounded-xl font-semibold text-sm hover:bg-[#1ebe5b] transition-colors"
          >
            Écrire sur WhatsApp
          </a>
        </div>
      ) : (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
          <div className="flex items-center gap-3 mb-2">
            <span className="text-2xl" aria-hidden="true">💬</span>
            <h2 className="font-bold text-gray-900">Laisser un message</h2>
          </div>
          <p className="text-sm text-gray-600 leading-relaxed mb-4">
            Tu peux écrire un message à {restaurant.name} depuis l&apos;app.
            L&apos;équipe te répond ici.
          </p>
          <Link
            href={`/r/${restaurantId}/feedback`}
            className="flex items-center justify-center gap-2 w-full min-h-[48px] bg-brand-dark text-white py-3 px-5 rounded-xl font-semibold text-sm hover:bg-gray-800 transition-colors"
          >
            Laisser un message à mon resto
          </Link>
        </div>
      )}

      {/* Carte 3 — questions fréquentes */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
        <div className="flex items-center gap-3 mb-3">
          <span className="text-2xl" aria-hidden="true">❓</span>
          <h2 className="font-bold text-gray-900">Questions fréquentes</h2>
        </div>
        <div className="divide-y divide-gray-100">
          <details className="group py-3">
            <summary className="cursor-pointer list-none flex items-center justify-between gap-3 text-sm font-semibold text-gray-800 min-h-[44px]">
              Comment gagner un cadeau ?
              <span className="text-gray-400 group-open:rotate-180 transition-transform" aria-hidden="true">▾</span>
            </summary>
            <p className="text-sm text-gray-600 leading-relaxed mt-2">
              Commande au restaurant, puis scanne ton ticket dans l&apos;app.
              Quand tu atteins un palier, ton cadeau t&apos;attend au comptoir.
            </p>
          </details>
          <details className="group py-3">
            <summary className="cursor-pointer list-none flex items-center justify-between gap-3 text-sm font-semibold text-gray-800 min-h-[44px]">
              Mon ticket a été refusé, que faire ?
              <span className="text-gray-400 group-open:rotate-180 transition-transform" aria-hidden="true">▾</span>
            </summary>
            <p className="text-sm text-gray-600 leading-relaxed mt-2">
              Garde ton ticket et montre-le à l&apos;équipe au comptoir : elle peut
              le vérifier avec toi. Tu peux aussi nous écrire depuis cette page.
            </p>
          </details>
          <details className="group py-3">
            <summary className="cursor-pointer list-none flex items-center justify-between gap-3 text-sm font-semibold text-gray-800 min-h-[44px]">
              C&apos;est quoi « Ma réserve » ?
              <span className="text-gray-400 group-open:rotate-180 transition-transform" aria-hidden="true">▾</span>
            </summary>
            <p className="text-sm text-gray-600 leading-relaxed mt-2">
              Au lieu de récupérer un cadeau tout de suite, tu peux le mettre de
              côté : il devient des points dans ta réserve. Avec assez de points,
              tu les échanges contre un plus gros cadeau.
            </p>
          </details>
          <details className="group py-3">
            <summary className="cursor-pointer list-none flex items-center justify-between gap-3 text-sm font-semibold text-gray-800 min-h-[44px]">
              C&apos;est quoi les jetons ?
              <span className="text-gray-400 group-open:rotate-180 transition-transform" aria-hidden="true">▾</span>
            </summary>
            <p className="text-sm text-gray-600 leading-relaxed mt-2">
              Tu gagnes un jeton par action : un avis Google, un abonnement, ou
              5 amis parrainés. Avec 4 jetons, tu reçois un cadeau au comptoir.
            </p>
          </details>
        </div>
      </div>
    </div>
  );
}
