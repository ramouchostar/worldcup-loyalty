# ADR 0053 — Acquisition par le personnel en salle (QR nominatif, mesuré par prénom)

**Statut** : Accepté (2026-09-10). S'appuie sur l'**ADR 0037** (compteurs serveur sans
donnée personnelle) et la mécanique cookie du parrainage (CLAUDE.md § Parrainage).
Volontairement **séparé** du parrainage membre (`referral_links`/`referrals`) et des
sièges console (**ADR 0041**). Migration : `docs/migrations/20260910-1430-codes-personnel-salle.sql`.

## Contexte

Première source d'acquisition constatée à Kraainem : le personnel en salle qui
propose le programme de vive voix. Rien ne l'outillait — pas de QR personnel, pas de
phrase prête, et surtout **aucune mesure** : impossible pour le gérant de savoir qui
amène des clients, donc impossible d'inciter.

Trois contraintes cadrent la solution :

1. **Le personnel n'a pas de compte.** Kraainem a un seul siège console (le gérant,
   ADR 0041). Exiger un compte par serveur tuerait l'adoption au premier jour.
2. **Le parrainage membre est inutilisable tel quel** : ses liens exigent un compte
   propriétaire (`referral_links.user_id NOT NULL`), chaque filleul y est unique à
   vie (`referrals UNIQUE(referee_id)` — un client recruté par un serveur ne
   pourrait plus jamais être parrainé par un ami), et chaque tranche de 5 inscrits
   crédite des **jetons-cadeaux**, une récompense *membre* qui n'a pas de sens pour
   le staff.
3. **Aucune distinction de poste** (décision du porteur) : caissier ou serveur, on
   affiche le **prénom seul**.

## Décision

1. **Des codes nommés, sans compte** (`staff_codes`) : le gérant crée un code par
   prénom depuis la page QR de sa console, le désactive quand la personne part.
2. **Un QR par prénom** → la vitrine avec le code
   (`/r/<id>?utm_source=qr_code&utm_medium=staff&p=<CODE>`) : le client vit le
   parcours normal ; l'arrivée compte dans l'entonnoir général (`qr_landings`,
   c'est un scan de QR) ET par prénom (`staff_landings`, compteur agrégé sans
   donnée personnelle, patron ADR 0037).
3. **Attribution à l'adhésion, cookie 24 h** (`staff_ref`, posé par le middleware —
   même mécanique éprouvée que `belchicken_ref`) : à la **première** adhésion à
   l'établissement, une ligne `staff_acquisitions` relie le membre au code.
   **Le parrainage membre prime** quand les deux cookies sont présents (il coûte
   des jetons et engage deux personnes) ; le code salle n'est compté que sinon.
   Jamais de réattribution (`UNIQUE(user_id, restaurant_id)`), jamais d'attribution
   d'un membre déjà inscrit.
4. **La mesure dans la console** (section « Équipe en salle », page QR) : par
   prénom — arrivées, inscriptions, **dont ont envoyé un ticket validé** — sur
   30 jours et en cumul. L'app fournit le chiffre incontestable ; la prime reste
   l'affaire du gérant, hors app (v1).
5. **Le support** : une **page-badge publique** par code (`/badge/<CODE>`) — QR en
   grand, prénom, la phrase à dire et trois réponses aux questions courantes. Le
   staff l'ouvre sur son téléphone et la montre, ou l'imprime au format carte
   (85 × 55 mm). Le gérant l'envoie par WhatsApp : zéro enrôlement.
6. **Fail-open de bout en bout** : sans la migration, le cookie est posé mais rien
   n'est écrit, les compteurs sont sautés, la console explique quoi appliquer —
   le parcours client ne dépend jamais de la mesure (même règle qu'ADR 0037 §4).

## Conséquences

- `lib/staff-codes.ts` : génération de code, résolution, compteur d'arrivées,
  attribution, statistiques par prénom — service-role only, tout best-effort.
- `middleware.ts` : cookie `staff_ref` (httpOnly, 24 h) posé sur `/r/<id>?p=CODE`.
- `app/join/actions.ts::ensureMembership` : attribution APRÈS le parrainage,
  uniquement pour une adhésion nouvelle.
- `app/api/admin/staff-codes` (POST créer, PATCH activer/désactiver), section
  console sur la page QR, page publique `/badge/[code]`.
- Tables `staff_codes`, `staff_acquisitions`, `staff_landings` — RLS sans policy
  (service-role) : l'attribution est une mécanique interne, le gérant la lit via
  sa console, le membre n'en voit rien (ADR 0025).

## Alternatives écartées

- **Réutiliser `referral_links`** — cf. Contexte §2 : compte obligatoire, unicité
  filleul à vie, jetons indus.
- **Des sièges « équipe » (ADR 0041) porteurs du code** — enrôlement par personne
  (compte + invitation) pour un bénéfice v1 nul : le staff n'a pas besoin de
  console, il a besoin d'un QR. Réévaluable si un jour chacun veut suivre ses
  propres chiffres.
- **Compter les arrivées staff dans `qr_landings` avec une nouvelle `source`** —
  la clé primaire de m60 est fermée sur (resto, jour, source, visiteur) et la
  dimension « par code » y exploserait la cardinalité ; table dédiée, jointe par
  la console seulement.
