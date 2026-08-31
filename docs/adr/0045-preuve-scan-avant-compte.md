# ADR 0045 — Preuve du scan (montant OCR) avant la demande de compte

**Statut** : Accepté — amende [ADR 0040](0040-onboarding-visiteur-compte-au-premier-ticket.md) point 3

## Contexte

Maquette étape 04 du parcours visiteur : après la photo du ticket, l'écran
qui demande le compte (« Continuer avec Google » / e-mail) affichait jusqu'ici
un aperçu photo pleine taille et aucune preuve que le scan avait réellement
fonctionné — juste un texte générique « Ton ticket est prêt ! ». Le visiteur
n'a aucun signal concret que l'app a bien lu son ticket avant de lui demander
un compte, ce qui affaiblit la motivation à l'instant précis où on lui demande
le geste le plus coûteux du parcours (ADR 0040).

ADR 0040 point 3 disait explicitement : *« L'OCR reste authentifié (coût,
abus). »* — un choix délibéré : `/api/orders/parse-receipt` appelle Claude
Vision (facturé) et n'était bridé que par utilisateur connecté (`rate_limits`,
m44), donc fermé à un visiteur anonyme.

## Décision

1. **`/api/orders/parse-receipt` accepte désormais les appels non
   authentifiés.** Un visiteur voit le montant détecté par l'OCR affiché
   dans la carte de compte, comme preuve que le scan a marché, avant les
   boutons de connexion.
2. **Anti-abus par IP** pour les appels anonymes (`lib/rate-limit.ts::checkIpRateLimit`,
   table `ip_rate_limits`, migration `docs/migrations/20260831-1029-ip-rate-limit-ocr-visiteur.sql`) —
   8 scans/heure/IP (hashée, jamais l'IP en clair en base), plus bas que le
   plafond authentifié (20/h/membre, m44) puisque c'est un aperçu avant tout
   engagement, pas un usage répété. Fail-open comme le reste de la couche
   rate-limit.
3. **Pas d'archivage ADR 0036 pour ce scan-là** : `receipt_scans.user_id` est
   `NOT NULL` — un visiteur anonyme n'a pas encore de ligne `profiles`, donc
   `storeScan` est sauté quand `user` est absent (`scan_id: null` renvoyé au
   client). Le scan repasse par l'OCR authentifié (et son archivage complet)
   à la reprise post-connexion (`?resume=1`) comme aujourd'hui — aucune
   régression sur la rétention des scans qui aboutissent vraiment à une
   commande.
4. **Vignette au lieu de l'aperçu pleine taille** : côté visiteur, une fois
   la photo prise, l'aperçu dans la zone de dépôt passe à une petite vignette
   (au lieu de `max-h-56`) pour laisser la place au montant détecté et aux
   boutons de connexion.
5. **Hiérarchie des boutons corrigée** : le CSS des deux boutons de connexion
   était inversé par rapport à l'intention déjà écrite dans l'ADR 0040 point 3
   (*« Google en un tap d'abord »*) — Google portait le style secondaire
   (blanc/bordure) et l'e-mail le style primaire (rouge plein). Corrigé :
   Google = primaire, e-mail = secondaire. L'ordre DOM était déjà correct,
   seul le style était inversé.

Le reste de l'ADR 0040 est inchangé : le compte n'est toujours demandé qu'à
l'envoi du ticket vers `/api/orders`, la reprise après connexion fonctionne à
l'identique, la ré-analyse serveur à la soumission reste l'unique source de
vérité anti-fraude (`app/api/orders/route.ts` ignore toujours les champs OCR
envoyés par le client).

## Conséquences

### Code
- `lib/rate-limit.ts` : `hashIp` + `checkIpRateLimit` (nouvelle fonction,
  `checkRateLimit` existant inchangé).
- `app/api/orders/parse-receipt/route.ts` : auth optionnelle, branche
  IP-rate-limit quand `user` est absent, `storeScan` conditionné à `user`.
- `components/member/SubmitOrderClient.tsx` : l'OCR tourne pour le visiteur
  dès la photo prise (avant, uniquement gardée en IndexedDB) ; formulaire de
  soumission et bloc d'erreur générique restent réservés à `!visitor` (un
  visiteur sans compte ne peut de toute façon pas soumettre — `/api/orders`
  exige une session).
- `docs/migrations/20260831-1029-ip-rate-limit-ocr-visiteur.sql` : table
  `ip_rate_limits` + RPC `check_ip_rate_limit`, même mécanique que m44
  (`check_rate_limit`) mais sans FK vers `profiles` (l'IP hashée n'est pas un
  membre).

### Coût
- Un visiteur qui prend une photo puis abandonne avant de créer un compte
  déclenche désormais un appel Claude Vision qui n'existait pas avant (c'est
  précisément le coût que l'ADR 0040 évitait). Accepté comme le prix de la
  preuve de scan — à surveiller via `lib/scan-meter.ts` si le volume dérive.
- Un visiteur qui va jusqu'au bout (photo → compte → reprise) déclenche
  aujourd'hui deux appels Vision au lieu d'un (aperçu anonyme non mis en
  cache + aperçu authentifié à la reprise, avant le troisième appel — la
  ré-analyse serveur, inchangée — à la soumission). Pas de déduplication
  volontaire ici : garder `SubmitOrderClient` simple plutôt qu'ajouter un
  cache d'aperçu OCR dans `lib/pending-ticket.ts`. À revisiter si le volume
  du poste 8.2 (metering) le justifie.

### À surveiller
- `docs/migrations/20260831-1029-ip-rate-limit-ocr-visiteur.sql` doit être
  appliquée dans l'éditeur SQL Supabase à la fusion (comme toute nouvelle
  migration, voir `docs/migrations/README.md`) — tant que ce n'est pas fait,
  `checkIpRateLimit` fail-open (aucun visiteur bloqué, mais aucune limite
  active non plus).
- Si le plafond 8/h/IP se révèle trop bas en usage réel (plusieurs clients
  au même Wi-Fi de resto partagent une IP sortante), l'ajuster plutôt que le
  retirer.
