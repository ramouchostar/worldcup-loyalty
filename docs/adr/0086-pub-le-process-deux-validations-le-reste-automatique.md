# ADR 0086 — Pub : le restaurateur demande et paie, Mehdi valide, le reste tourne seul

**Statut** : Accepté (2026-10-17). Décidé par le porteur en session, sur le plan « Boosteats
Pub — plan et architecture » (https://claude.ai/code/artifact/caacd6bb-4e96-491d-a6f1-88db385c3241,
section « Décisions du 17 octobre 2026 »). Prolonge l'[ADR 0085](0085-campagnes-publicitaires-gerees-code-client-et-nommage.md)
(passé « Accepté » le même jour) : celui-ci fixe **qui fait quoi** et **comment l'argent
circule**, l'ADR 0085 fixe le code client, le nommage et la lecture. Reprend les tâches du
backlog plateforme du 2026-09-28 (« Pub autour du resto »). Amende l'[ADR 0074](0074-boosteats-outil-marketing-pas-outil-d-exploitation.md)
§4 sur **un seul point**, comme l'ADR 0084 : un moyen de paiement en ligne sert à encaisser le
**budget publicitaire** d'un restaurateur (jamais une commande de repas, jamais un membre).
N'amende **ni l'ADR 0007 ni l'ADR 0028** : tout se passe en console et sur la plateforme.
Appliqué avec le bouclier de l'[ADR 0065](0065-le-bouclier-scene-trace-echos.md).

## Contexte

Le 2026-10-17, la chaîne Meta est en place et vérifiée par l'API : application, System User
« BOOSTEATS - HUB » (six autorisations), compte publicitaire `act_1496112978566786` (EUR,
Europe/Brussels, actif), campagne de test `BE001_kraainem_META_TRAFIC_v1` créée en pause. Le
porteur veut ouvrir la Pub aux restaurateurs avec **deux seuls gestes humains** — les siens —
et tout le reste automatique.

Deux faits constatés le même jour pèsent sur la décision :

- **Meta refuse un plafond de campagne sous 100 €** (« The campaign spending limit must be at
  least €100.00 for this currency »).
- **L'émetteur des factures est Mehdi Haik, entreprise individuelle** (BE0737736369), en
  **régime de franchise de TVA**. La franchise n'exempte pas de Peppol : depuis le 1er janvier
  2026, une facture d'un assujetti franchisé à un autre assujetti belge passe par Peppol et
  porte la mention « Régime particulier de la franchise de taxe »
  ([Degand & Partners](https://blog.degandpartners.com/fr/article/facture-simplifiee-et-peppol-le-facturation-sapplique-aussi-depuis-le-1er-janvier-2026/32048)).
  Le porteur facture avec **Accountable**, point d'accès Peppol, dont l'envoi se fait dans
  l'application, sans API publique trouvée.

## Décision

### 1. Le parcours et ses états

Une **demande de pub** (`ad_requests`) traverse ces états, chacun déduit des données :

`paiement_attendu` → `payee` → `preparee` (campagne créée chez Meta, en pause) →
`a_corriger` ⇄ `preparee` → `en_diffusion` ⇄ `en_pause` → `terminee` ; `annulee` à tout moment
avant `payee`.

- Le restaurateur **demande** depuis sa console : objectif (liste de l'ADR 0085 §2), budget,
  budget par jour, dates, zone, création (§ 6). Ses coordonnées de facturation (raison sociale,
  numéro de TVA, adresse) sont demandées à la première demande.
- **Pause et relance** : automatiques (§ 4) ou par le restaurateur, **sans validation**.
- `terminee` : le plafond est atteint ou la date de fin passée. « Relancer » crée une demande en
  `v<N+1>`.

### 2. Deux gestes humains, ceux de Mehdi

1. **Confirmer un paiement** reçu, tant que le compte Revolut n'a pas d'API (§ 3). Un clic sur
   `/platform/pub` : le registre est crédité, la campagne se crée seule.
2. **Valider le lancement** : aperçu de la publicité, du ciblage, du budget par jour et du
   plafond → « Lancer » ou « Renvoyer » avec un motif (→ `a_corriger`).

S'y ajoute un geste que Meta ne laisse pas automatiser : **alimenter le compte Meta** quand
l'alerte le demande.

Chaque attente part par e-mail à l'adresse `PUB_ALERT_EMAIL` (configuration, jamais dans le
dépôt public) via `dispatch` (journal `message_sends`, ADR 0063) : paiement attendu, paiement
reçu, campagne à lancer, publicité refusée par Meta, fonds Meta bas, campagne non rattachée qui
dépense, appel Meta en échec. **Aucune attente sans e-mail, aucun e-mail sans ligne au journal.**

### 3. Le paiement

- **Montant demandé = budget + frais de service** du forfait (`AD_FEE_PCT` : Gratuit 20 %,
  Croissance 15 %, Pro 5 %, inchangés — ADR 0081 §6). Les frais couvrent aussi les frais de
  paiement. **Pas de TVA** tant que l'émetteur est en franchise ; le taux est une configuration
  (`INVOICE_VAT_RATE`, 0 aujourd'hui), pas une constante.
- **Budget minimum : 100 € par campagne** (le plancher du plafond Meta).
- **Deux moyens, au choix du restaurateur** :
  - un **lien de paiement Revolut** (carte, Apple Pay, Revolut Pay) ;
  - un **virement SEPA** avec une **communication structurée belge** unique par demande
    (`+++XXX/XXXX/XXXXX+++`, clé modulo 97, calculée du code client et du numéro de demande),
    et un QR de paiement EPC.
- **Revolut Pro d'abord** (sans abonnement, sans API) : chaque paiement est confirmé à la main
  (§ 2). Le code passe par une interface de paiement unique, pour qu'un compte Revolut Business
  et son API (confirmation par webhook) remplacent la confirmation manuelle sans rien refaire.
  Les coordonnées affichées (IBAN, BIC, titulaire) sont en configuration.

### 4. Le crédit : tout le budget est dépensé

- **Plafond de la campagne chez Meta = total payé pour elle** (≥ 100 €). C'est Meta qui
  l'arrête : **pas de pause anticipée**, donc pas de reliquat. Ce qui a été versé est dépensé.
- Un nouveau paiement confirmé **relève le plafond par l'API** et relance la campagne si elle
  était à l'arrêt, sans validation.
- **Alertes au restaurateur** (e-mail + console) quand il reste moins de 2 jours de budget au
  rythme actuel, puis quand la campagne s'est arrêtée sur son plafond.
- Les conditions de la Pub, acceptées par une case au paiement, disent que le crédit versé
  n'est pas remboursable. L'écran n'a pas à le mettre en avant.
- **Fonds du compte Meta** (un compte prépayé pour tous) : alerte à Mehdi quand ils couvrent
  moins de 3 jours de la dépense de toutes les campagnes actives.

Remplace, dans l'ADR 0085 §5, « plafond = restant au lancement » et l'alerte « 3 jours » par ce
qui précède ; remplace, dans le backlog du 2026-09-28, la pause à moins d'un jour.

### 5. La facture

- À chaque paiement confirmé, Boosteats **prépare** la facture : émetteur (Mehdi Haik,
  entreprise individuelle, BE0737736369, en configuration), client (coordonnées de
  facturation du restaurateur), désignation (« Campagne publicitaire BE00X — budget de
  diffusion » + « Frais de service »), montants, mention « Régime particulier de la franchise
  de taxe » tant que `INVOICE_VAT_RATE` vaut 0.
- **Accountable n'ayant pas d'API**, la facture est **émise par Mehdi dans Accountable**, à
  partir de l'e-mail « facture à émettre » qui en donne tous les champs ; c'est Accountable qui
  la numérote (une seule suite de numéros pour toute l'entreprise) et l'envoie par Peppol. Le
  numéro est reporté sur `/platform/pub`, ce qui la marque émise.
- Ce geste est le troisième humain, assumé tant que le volume est faible. Il disparaît le jour
  où l'émission passe par un point d'accès Peppol doté d'une API (décision à part).

### 6. La création

- **Publications Instagram** : la console propose les **5 à 10** publications du compte du
  restaurateur au meilleur potentiel, classées par J'aime + commentaires, fraîcheur, et format
  (vidéo d'abord) — ce que permet `instagram_basic`. Il en choisit une.
- **Ou un fichier** (image ou vidéo) envoyé depuis la console vers **Supabase Storage** (lien
  d'envoi signé, comme `lib/missions-files.ts`), transmis à Meta par un lien signé ; TikTok
  ensuite par le même chemin.
- Chaque ensemble de publicités déclare **bénéficiaire** (l'établissement) et **payeur**
  (Boosteats) — obligation européenne pour une publicité diffusée dans l'UE.

### 7. La mesure par objectif

Le résultat montré au restaurateur suit l'objectif : visites et clics pour `TRAFIC`, portée pour
`NOTORIETE`, vues pour `VIDEO`, conversations pour `MESSAGES`, adhésions « sur la même
période » pour `INSCRIPTION` (jamais « grâce à la pub », ADR 0064) et **clics vers le site**
pour `UBEREATS`, `DELIVEROO` et `TAKEAWAY`.

## Conséquences

- **ADR 0085** : statut « Accepté » ; §4 (V1 en lecture) et §5 (plafond) précisés par les § 3
  et 4 ci-dessus.
- **Pages légales BE Campaign Hub** : l'éditeur réel (Mehdi Haik, entreprise individuelle,
  0737.736.369, Koekelberg) remplace « société en cours de constitution » ; les conditions
  disent le prépaiement, le minimum de 100 €, l'arrêt au plafond et le crédit non
  remboursable ; la politique de confidentialité nomme Revolut (paiement) et la lecture des
  publications Instagram du restaurateur pour les promouvoir.
- **Configuration** (Vercel + `.env.local`) : `PUB_ALERT_EMAIL`, `INVOICE_VAT_RATE`,
  coordonnées de l'émetteur et du compte (IBAN, BIC, titulaire), plus tard
  `REVOLUT_MERCHANT_SECRET_KEY`.
- **Données** : les tables du plan (`ad_requests`, `ad_payment_notices`,
  `ad_credit_transactions`, `ad_campaigns`, `ad_daily_stats`, `ad_sync_runs`, `ad_api_calls`)
  plus les coordonnées de facturation par établissement et le numéro de facture Accountable par
  paiement. Migration horodatée, code tolérant à son absence.
- **Trace** (ADR 0065), affichée en tête de `/platform/pub` :
  - paiements attendus depuis plus de 7 jours ; paiements reçus non confirmés depuis plus de
    24 h ;
  - **paiements confirmés sans numéro de facture depuis plus de 48 h** — doit rester à 0 ;
  - délai paiement confirmé → lancé (cible < 24 h ouvrables) ;
  - dépassement du plafond par Meta, en euros, par campagne terminée ;
  - publicités refusées par Meta ; heures perdues faute de fonds Meta ;
  - dépense non rattachée (ADR 0085) ; e-mails d'alerte partis / échoués (`message_sends`).
- **Ordre des PR** : celui du plan (données → lecture → maquette → demande et paiement →
  confirmation → création et lancement → garde-fous → rapports), plus la PR des pages légales
  et, à la PR « confirmation », la facture à émettre.

## Alternatives rejetées

- **Stripe** : exclu par l'ADR 0074 §4 hors prestataires, et le porteur a déjà Revolut.
- **Revolut Business tout de suite** : la confirmation automatique, au prix d'un abonnement
  avant le premier client. Reprise quand le volume le justifie.
- **Mettre la campagne en pause à moins d'un jour de budget** (plan du 2026-09-28) : laisse un
  reliquat à chaque campagne ; le plafond Meta fait le même travail et dépense tout.
- **Fabriquer nos propres factures PDF** : hors Peppol, donc non conformes entre entreprises,
  et une deuxième suite de numéros à côté de celle d'Accountable.
- **Cacher la non-restitution du crédit** : une somme gardée sans clause acceptée se réclame ;
  la clause dans les conditions suffit, l'écran n'a pas à la répéter.
