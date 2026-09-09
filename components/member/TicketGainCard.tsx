// ============================================================
// L'écran de conversion du parcours visiteur (ADR 0048).
//
// Le ticket vient d'être lu. Avant qu'on demande quoi que ce soit — compte,
// app, notifications, équipe — cette carte dit ce que le ticket VAUT. C'est
// l'ordre du parcours cible : le cadeau est gagné d'abord, et c'est lui qui
// paie chaque demande suivante.
//
// Hiérarchie, de haut en bas :
//   1. les points, en gros        → la monnaie du client (ADR 0028)
//   2. le cadeau, nommé et illustré → la conséquence concrète (ADR 0010)
//      ou, sous le premier palier, la distance jusqu'au prochain
//   3. le montant lu, en petit    → la preuve que c'est bien SON ticket
//
// Contrat d'affichage, non négociable :
//   • des NOMS d'articles, jamais un seuil, jamais un coût (ADR 0007/0017/0028) ;
//   • `pct` remplit une barre, il n'est jamais rendu comme un chiffre lisible ;
//   • le montant reste un rappel de lecture (« Lu sur ton ticket ») — de
//     l'ingestion relue, pas une cagnotte affichée (ADR 0028 §5) ;
//   • jamais « validé », « automatique » ni « instantané » (ADR 0008).
//
// Palette VERTE fixe, jamais brand-gold/brand-red : `brand_accent` résout en
// rouge pour Kraainem (lib/branding.ts), ce qui donnait un encadré rose sur le
// moment le plus positif du parcours — lu comme une alerte. Même raison que le
// dégradé vert en dur de l'écran de succès, quelques lignes plus bas dans
// SubmitOrderClient.
// ============================================================
import { COIN_EMOJI } from "@/lib/fluent-emoji";
import { foodIconUrl } from "@/lib/food-icon";
import { pointsForOrder } from "@/lib/points-model";

export default function TicketGainCard({
  amount,
  reward,
  nextTier,
}: {
  /** Montant lu par l'OCR, en euros — la seule donnée d'ingestion de la carte. */
  amount: number;
  /** Article de la couche 1 atteint par ce montant, ou null (grille non configurée / rien d'atteint). */
  reward: string | null;
  /** Palier solo suivant : nom + proportion de barre. Null au palier maximal. */
  nextTier: { item: string; pct: number } | null;
}) {
  const points = pointsForOrder(amount);

  return (
    <div>
      <p className="text-xs font-semibold text-green-600 uppercase tracking-wide mb-2">
        ✅ Ticket lu
      </p>

      {/* Les points d'abord : c'est ce que ce ticket rapporte, dans la seule
          unité que le client manipule (ADR 0028). */}
      <div className="flex items-center justify-center gap-2">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={COIN_EMOJI} alt="" className="w-10 h-10" />
        <span className="text-5xl font-black tabular-nums text-gray-900">+{points}</span>
      </div>
      <p className="text-sm font-bold uppercase tracking-wide text-gray-500 mt-1 mb-3">
        points sur ce ticket
      </p>

      {/* Puis le cadeau, nommé et en grand (lib/food-icon : un cadeau se voit
          avant de se lire). Formulation affirmative mais jamais « validé » ni
          « instantané » — la validation reste différée (ADR 0008). */}
      {reward && (
        <div className="bg-green-50 border border-green-200 rounded-xl p-3 mb-3">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={foodIconUrl(reward)}
            alt=""
            aria-hidden="true"
            className="w-14 h-14 mx-auto mb-1 drop-shadow"
          />
          <p className="text-xs font-bold uppercase tracking-wide text-gray-500">Ton cadeau</p>
          <p className="font-black text-gray-900 text-lg leading-tight">{reward}</p>
          <p className="text-xs text-gray-500 mt-0.5">À récupérer au comptoir.</p>
        </div>
      )}

      {/* La suite, toujours nommée : au-dessus d'un palier atteint c'est la
          marche suivante, en dessous du premier c'est la distance jusqu'au
          premier cadeau — courte par construction (les paliers sont
          dimensionnés sur le panier moyen, ADR 0017 §1). Même bloc et même
          libellé que l'écran de succès : le visiteur retrouve la forme qu'il
          vient de voir. */}
      {nextTier && (
        <div className="bg-white border border-gray-200 rounded-xl p-3 mb-3">
          <div className="flex items-center justify-between text-sm mb-1.5">
            <span className="text-gray-600">Prochain cadeau</span>
            <span className="font-bold text-gray-900 inline-flex items-center gap-1.5">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={foodIconUrl(nextTier.item)} alt="" className="w-5 h-5" />
              {nextTier.item}
            </span>
          </div>
          <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
            <div
              className="h-full bg-green-600 rounded-full transition-all"
              style={{ width: `${Math.max(nextTier.pct, 4)}%` }}
            />
          </div>
        </div>
      )}

      {/* Le montant passe derrière le gain : il n'est plus la nouvelle, c'est
          la preuve que l'app a lu SON ticket — et il reste corrigeable au
          récap, une fois le compte créé. */}
      <p className="text-gray-400 text-xs mb-4">
        Lu sur ton ticket : {amount.toLocaleString("fr-BE", { style: "currency", currency: "EUR" })}
      </p>
    </div>
  );
}
