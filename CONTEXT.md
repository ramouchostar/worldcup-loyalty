# World Cup Loyalty — Belchicken

Programme de fidélité communautaire pour Belchicken (Bruxelles). Les clients forment des **équipes** qu'ils créent eux-mêmes (élèves d'une école, salariés d'une entreprise, habitants d'un quartier, chauffeurs de taxi…) et débloquent des récompenses collectives en dépensant directement au restaurant. *(Historique : le programme a d'abord été lancé autour de la Coupe du Monde 2026 — pivot acté par l'ADR 0014.)*

## Language

### Commandes & Achats

**Commande directe** :
Achat effectué en salle ou par téléphone/WhatsApp, directement auprès du restaurant. Seules les commandes directes comptent dans le programme.
_Avoid_ : commande, achat, order — toujours qualifier de "directe" pour distinguer des plateformes.

**Commande via plateforme** :
Achat passé via Uber Eats, Takeaway ou Deliveroo. Ne compte PAS dans le programme. Ne doit jamais apparaître dans la table `orders`.
_Avoid_ : livraison (trop générique — on peut livrer directement).

**Vente caisse** *(ADR 0027)* :
Encaissement enregistré par le système de caisse du restaurateur (membre ou non), importé par CSV/Excel à part de `orders`. **Jamais affichée ligne à ligne** (le resto a le détail dans sa caisse) — c'est la matière brute du **forecast de CA total**. Ce qui EST montré, c'est la prévision qui en découle, réservée à l'**admin/restaurateur** (jamais côté client/membre — c'est la vue admin, qui a toujours le droit aux euros ; l'ADR 0007 ne vise que le membre). Table `restaurant_sales`, **service-role only**. Une **commande directe** est une vente caisse qui a *en plus* été scannée par un membre.
_Avoid_ : vente (seul — ambigu), CA / chiffre d'affaires **côté client** (interdit ADR 0007 ; autorisé côté admin), commande (réservé aux commandes directes des membres).

**Prévision (forecast)** *(ADR 0027)* :
Estimation du **CA total** à venir de l'établissement, calculée **uniquement sur les ventes caisse** (jamais les commandes scannées). Réservée à l'**admin/restaurateur** — jamais côté membre (l'ADR 0007 ne vise que le membre). Toujours exprimée en **fourchette + niveau de confiance**, avec un **plancher** en dessous duquel elle ne s'affiche pas (« pas assez de données »). Moteur déterministe et explicable (facteurs visibles).
_Avoid_ : prédiction (trop absolu — c'est une aide à la décision, pas une garantie), CA / chiffre d'affaires **côté client** (interdit ADR 0007).

**Plan** *(ADR 0029)* :
Niveau d'abonnement du **restaurateur** — jamais du membre (le membre ne paie jamais, expérience identique quel que soit le plan). Trois plans : **Gratuit** (programme membre complet + scan plafonné pour couvrir le coût OCR + parrainage + broadcast manuel + baromètre de base — le moteur qui génère la donnée et verrouille les membres), **Croissance** (l'**Analytique établissement**), **Pro** (Croissance + **Repères secteur**). Les fonctions payantes se débloquent *data-ready* ou à la 1ʳᵉ utilisation, 30 j d'essai, puis **paywall doux** (valeur visible mais verrouillée).
_Avoid_ : freemium (jargon — on dit « plan ») ; abonnement du client (le client payant EST le restaurateur).

**Analytique établissement** *(ADR 0029)* :
Les fonctions payantes qui tournent sur les données **propres** du resto (forecast, ventes par plat, opportunités, broadcasts programmés, baromètre avancé) — le contenu du plan Croissance. À distinguer des **Repères secteur**.

**Repères secteur** *(ADR 0029)* :
Agrégats **anonymisés** de la donnée de **tous** les restos (Gratuit inclus contribue), consultables uniquement en plan **Pro** — « la médiane de ton secteur fait +18 % le jeudi ». Jamais de chiffres bruts identifiables ; **seuil plancher** (≥ N restos) anti-ré-identification (esprit ADR 0016) ; contribution actée en CGU.
_Avoid_ : benchmark (anglicisme — « repères secteur ») ; données concurrents (ce ne sont jamais des chiffres identifiables d'un resto).

**Ticket de caisse** :
Photo du reçu papier soumise par le membre comme preuve de sa commande directe. Stockée dans Supabase Storage bucket `receipts`, **conservée 30 jours puis effacée** (ADR 0036) — la commande, elle, reste. Obligatoire pour toute soumission de commande.
_Avoid_ : reçu, preuve, justificatif.

**Atterrissage** *(ADR 0037)* :
Arrivée sur la page publique d'un établissement (`/r/[id]`), comptée côté serveur dans `qr_landings` par jour, provenance (`qr_code` = QR imprimé, `direct` = lien partagé ou saisie) et visiteur (`anonyme` / `membre`). Premier étage de l'**entonnoir** — atterrissage → inscription → scan → commande — visible sur `/platform/scans`. Compte des **chargements de page**, pas des personnes : dédupliquer exigerait un cookie, donc du consentement, donc l'angle mort qu'on cherchait à sortir.
_Avoid_ : visite, visiteur unique, session (rien n'est identifié) ; « scan du QR » (le QR n'est pas mesurable, seule l'arrivée l'est).

**Scan** *(ADR 0036)* :
Un passage d'image dans Claude Vision, qu'il aboutisse ou non à une commande. Table `receipt_scans` : l'image, la lecture du modèle, et ce qu'elle est devenue (`parsed` = jamais soumis, `header_rejected` = entête non reconnue, `submitted` = devenue commande). C'est l'unité de mesure du coût OCR (ADR 0029 §6) et la matière de `/platform/scans`, où l'on compare image ↔ lecture ↔ encodage.
_Avoid_ : upload (le scan existe même sans soumission), photo (c'est l'image, pas l'acte).

**Doublon** :
Tentative de soumettre deux fois la même commande. Détecté via le **Bestelnummer** (`order_number` en base, ex. `2026-06-01/258/03993`) — identifiant séquentiel unique généré par la caisse Belchicken, présent sur chaque ticket client. Rejeté silencieusement côté serveur. Remplace l'ancien `DATE_HH:MM_MONTANT` qui permettait des collisions.
_Avoid_ : fraude (le doublon peut être accidentel).

**Validation automatique** :
Les commandes sont validées automatiquement côté serveur si : (1) l'OCR confirme que le montant est lisible sur la photo du ticket, (2) le Bestelnummer (`order_number`) est absent de la base, (3) le montant est dans la plage normale (€8–€200). Un délai artificiel de 3–5 secondes est affiché côté client pour entretenir la perception d'une vérification humaine — effet dissuasif contre la fraude sans charge opérationnelle. Les cas suspects (montant > €200, confiance OCR < 70%, 3+ commandes le même jour par le même membre) sont mis en file d'attente admin pour revue manuelle.
_Avoid_ : vérification automatique, validation instantanée (ne jamais révéler le mécanisme au client).

**WhatsApp** :
Utilisé pour deux usages distincts — jamais pour la soumission de tickets (le scan direct dans l'app est plus simple et plus rapide).

1. **Partage de lien de parrainage** : schéma universel `wa.me/?text=...` qui ouvre WhatsApp nativement avec le message pré-rempli. Aucun appel API, coût zéro.
2. **Notifications proactives** : API Meta WhatsApp Business directe (sans Twilio) pour les notifications d'incitation à commander (ADR 0009). Implémentation via `fetch` natif vers `graph.facebook.com/v19.0/`.

Variables d'env par déploiement : `WHATSAPP_PHONE_NUMBER_ID`, `WHATSAPP_TOKEN`.
_Avoid_ : bot WhatsApp (pas de bot de soumission), Twilio (non utilisé), chatbot.

---

### Score & Récompenses

**Points** :
Unité d'affichage du score communautaire côté client. Le calcul backend reste `membres × euros validés` mais le score s'affiche toujours en points — jamais en euros, jamais en relation avec le CA restaurant. Exemple : score brut 4 750 → affiché "4 750 pts". Distinction importante : les dépenses personnelles du membre ("€200 dépensés" dans ses stats) peuvent s'afficher en euros — ce sont ses propres données, pas le score collectif. Seuls le score communautaire et le seuil CA restaurant sont masqués en euros (voir ADR 0007).
_Avoid_ : euros pour le score communautaire, chiffre d'affaires, score (dans les textes UI de classement — utiliser "points").

**Score communautaire** :
Valeur numérique d'une équipe = `nombre de membres × total euros dépensés (commandes validées)`. Détermine quels paliers sont atteints. Jamais calculé sur les commandes en attente. Affiché en points côté client.
_Avoid_ : points (en interne/base de données), score d'équipe, classement.

**Double verrou** :
Condition nécessaire et suffisante pour débloquer les paliers collectifs et le bonus communautaire : (1) le score communautaire dépasse le seuil du palier ET (2) le seuil CA du restaurant est atteint. Les deux conditions doivent être vraies simultanément. Entièrement invisible côté client — un palier non satisfait s'affiche simplement comme verrouillé sans explication du pourquoi.
_Avoid_ : conditions de déblocage (trop vague).

**Couverture communautaire** :
Troisième verrou (ADR 0017), qui s'ajoute au double verrou pour les cadeaux distribués à toute une équipe (couches 2 et 3) : `membres × coût du cadeau ≤ dépense cumulée de l'équipe × budget cadeaux (8 %)`. Vérifiée à chaque résolution (taille d'équipe variable). Si le palier atteint au score n'est pas couvert, cascade vers le palier couvert inférieur. Comme le double verrou, entièrement invisible côté client (ADR 0007).
_Avoid_ : verrou budgétaire (réservé au plafond mensuel ADR 0012), seuil dynamique.

**Plafond de palier** :
Coût réel maximal du cadeau d'un palier solo : `seuil du palier × budget cadeaux (8 %)` (ADR 0017). Enforcé au moment de l'enregistrement des paliers — une assignation au-dessus du plafond est rejetée. Les paliers solo eux-mêmes sont dimensionnés par établissement à partir du panier moyen.
_Avoid_ : plafond budget (réservé au plafond mensuel ADR 0012).

**Palier** :
Niveau de récompense communautaire avec un score seuil et un cadeau associé. Se débloque uniquement si le double verrou est satisfait. Configurables par l'admin.
_Avoid_ : niveau, récompense (récompense est plus large — inclut les micro-récompenses).

**Palier solo** :
Couche 1 du système de récompenses. Récompense individuelle promise automatiquement à chaque commande directe validée, basée sur le montant de cette commande. Affichée immédiatement sur le dashboard : "ta prochaine visite → [cadeau]". Non soumise au double verrou.
Grille : < €15 → aucune récompense solo (la commande compte quand même pour le score communautaire) / €15–24 → Churros 6 pcs (coût €0,31) / €25–39 → Finest burger (coût €0,94) / €40–59 → Menu 4 Tenders (coût €1,93) / €60+ → Chef's Combo (coût €1,92).
Depuis ADR 0013, les articles et coûts de cette grille proviennent du catalogue menu (`menu_items`) ; les valeurs ci-dessus sont les exemples Belchicken — seules les tranches de montant constituent la structure.
_Avoid_ : récompense individuelle, fidélité solo, cagnotte.

**Bonus communautaire** :
Couche 2 du système de récompenses. Article supplémentaire ajouté au palier solo en fonction du score de l'équipe du membre au moment de la validation. Soumis au double verrou. Non affiché si le double verrou n'est pas satisfait.
Grille : score < 1 000 pts → rien / 1 000–2 999 → +Frites Medium / 3 000–5 999 → +Churros 12 pcs / 6 000–9 999 → +Finest burger / 10 000+ → +Menu 4 Tenders.
Articles et coûts issus du catalogue menu (`menu_items`, ADR 0013) — valeurs d'exemple Belchicken.
_Avoid_ : palier communautaire, récompense d'équipe (confusionnable avec "palier").

**Palier d'équipe** :
Couche 3 du système de récompenses (remplace la « récompense d'avancement » Coupe du Monde — ADR 0014). Seuil de **dépense cumulée de l'équipe** (`community_scores.total_spent`) défini par l'admin établissement ; quand l'équipe le franchit, **tous ses membres** débloquent une récompense : un **pourcentage borné** (prochaine commande / fenêtre limitée) ou un **article gratuit** (catalogue menu, ADR 0013). Rétro-financé par le plafond de budget cadeaux (ADR 0012). Non soumis au double verrou.
_Avoid_ : récompense d'avancement (terme Coupe du Monde obsolète), palier (réservé au seuil de score communautaire), pari.

**Récompense en attente** :
Enregistrement unique dans `pending_rewards` par membre (un seul actif à la fois — ADR 0011). Créé à chaque validation de commande si aucune récompense active n'existe déjà. Contient les 3 couches (palier solo + bonus communautaire + récompense d'avancement). Expire automatiquement après **48h** (`status = 'expired'`). Affiché sur le dashboard avec un compte à rebours 48h. Récupéré via coupon actif au comptoir — ou **mis de côté** dans la réserve (ADR 0021, `status = 'banked'`), ce qui libère le slot.
_Avoid_ : crédit, cagnotte, reward (anglicisme).

**Coupon de récupération** :
Jeton à durée de vie de **10 minutes** généré quand le membre active "Récupérer mon cadeau" au restaurant. Affiché sur `/coupon/[token]` avec un countdown animé et une horloge live (mise à jour chaque seconde) — anti-capture d'écran : le cashier vérifie que l'heure affichée correspond à sa montre et que le timer tourne. Contient le nom du membre (vérification identité), les items à remettre, et expire côté serveur (pas seulement côté client). Invalidé immédiatement après validation cashier. Commande minimum **€10** sur la visite de récupération (règle opérationnelle, vérifiée par le cashier). Voir ADR 0011.
_Avoid_ : QR code (non utilisé), voucher, bon de réduction.

**Récupération** :
Action du cashier qui valide le coupon de récupération depuis `/admin/coupon/[token]` → bouton "Cadeau remis" → `redeemed_at = NOW()`, `pending_rewards.status = 'redeemed'`. Idempotente (double-tap ignoré). Débloque la génération d'une nouvelle récompense à la prochaine commande du membre.
_Avoid_ : remboursement, échange, validation (terme réservé à la validation des commandes).

**Réserve** *(ADR 0021)* :
Solde de points personnels du membre (« Ma réserve », ledger `point_transactions`). Alimenté quand le membre choisit **« Mettre de côté »** son cadeau disponible au lieu de le récupérer : le cadeau passe `banked` et crédite `floor(montant de la commande)` points (1 point = 1 € dépensé). S'échange contre un **gros cadeau** des paliers `reward_tiers` layer `saver` (seuils en points, plafond ADR 0017 : coût ≤ seuil × budget %), qui redevient une récompense en attente standard (coupon 10 min). Le score communautaire n'est **jamais** affecté par ce choix — il est crédité à la validation du ticket. Ne pas confondre avec le score communautaire (« points » de l'équipe) ni avec les jetons.
_Avoid_ : points (seul — réservé au score communautaire), cagnotte, solde, crédit, épargne.

**Micro-récompense** :
Action sociale unique récompensée par un jeton : avis Google, abonnement Instagram, abonnement TikTok, abonnement Facebook. Non soumise au double verrou. Une seule fois par type par membre. Maximum 4 jetons sociaux par membre.
_Avoid_ : petite récompense, bonus, action marketing.

**Parrainage** :
Mécanique distincte des micro-récompenses. Le membre partage un **lien d'invitation unique** (`/join?ref=CODE`) via WhatsApp (`wa.me/?text=...` — gratuit, natif, pas d'API). Le jeton est comptabilisé uniquement quand l'ami **complète son inscription** via ce lien — pas au moment du partage. Un ami ne peut être attribué qu'à un seul parrain (premier lien utilisé). 5 inscriptions validées via le lien = 1 jeton parrainage. Illimité — le membre peut accumuler plusieurs jetons en atteignant des multiples de 5. Ne compte pas dans les 4 jetons sociaux.

Tables : `referral_links` (code unique par membre, compteurs clicks/conversions) + `referrals` (une ligne par ami inscrit, `referee_id UNIQUE` pour éviter le double comptage).
_Avoid_ : référence, invitation par email, micro-récompense (c'est une catégorie séparée).

**Jeton** :
Unité de valeur gagnée via les micro-récompenses sociales (1 par action) ou les parrainages (1 par tranche de 5 validés). 4 jetons = 1 cadeau à récupérer au comptoir : un article du catalogue de l'établissement (`restaurants.jetons_gift_menu_item_id`, ADR 0017), plafonné à `panier moyen × budget cadeaux` car aucune commande n'est en face — fallback hérité « 12 Churros » tant que rien n'est configuré. Calculé à l'affichage uniquement à partir des claims validés — non stocké en base. Les jetons s'accumulent : 8 jetons = 2 cadeaux, etc. Côté membre, seul le nom de l'article est affiché.
_Avoid_ : point, crédit, token (anglicisme).

**Membre actif** :
Membre ayant au moins une commande directe validée par le système. Seuls les membres actifs peuvent recevoir les cadeaux des paliers et les récompenses d'avancement.
_Avoid_ : membre vérifié, membre validé.

**Seuil CA restaurant** :
Condition de croissance que le restaurant doit atteindre avant que les paliers collectifs et les bonus communautaires puissent se débloquer. Basé sur la **croissance** vs la moyenne des 4 semaines précédentes (`baseline × (1 + GROWTH_TARGET_PCT)`), pas un montant absolu — le restaurant ne débloque que s'il vend plus qu'avant le programme (ADR 0012). Validé par l'admin. La moitié du double verrou. Entièrement invisible côté client.
_Avoid_ : objectif, quota, seuil de CA absolu.

**Plafond de budget cadeaux** :
Filet de sécurité financier (ADR 0012). Le coût total des récompenses distribuées dans un mois ne peut jamais dépasser `CA_programme_mois × REWARD_BUDGET_PCT` (défaut 8%). Quand le plafond est atteint : la couche 1 (palier solo) reste active, les couches 2 et 3 se désactivent jusqu'au mois suivant. Garantit que le restaurant reste bénéficiaire quelle que soit la participation — le budget grandit proportionnellement au CA généré. Stocké dans `reward_budget_tracking`. Invisible côté client : "Bonus communautaire en pause" sans explication.
Le coût total est calculé à partir des prix de revient du catalogue menu (`menu_items.cost_price`, ADR 0013).
_Avoid_ : enveloppe, quota cadeaux, limite (trop vague).

**Bonus de tour** *(obsolète — ADR 0014)* :
Ancien multiplicateur ×1.5 sur le score affiché pendant 48h après qu'une équipe passait un tour de Coupe du Monde. Retiré avec le pivot vers les équipes communautaires (plus de tours).

---

### Catalogue menu & coûts

**Catalogue menu** :
Ensemble des articles d'un établissement (table `menu_items`), chacun avec son prix de vente et son prix de revient. Source de vérité unique des articles et coûts utilisés par les récompenses (ADR 0013) — remplace les grilles codées en dur. Soumis par le restaurateur via un fichier CSV (colonnes `nom`, `categorie`, `prix_vente`, `prix_revient`). Strictement admin, jamais exposé côté membre (ADR 0007).
_Avoid_ : carte (ambigu), menu (réservé aux combos type "Menu 4 Tenders"), base produits.

**Article** :
Une ligne du catalogue menu (`menu_items`) — un produit vendu par l'établissement. Possède un nom, une catégorie, un prix de vente et un prix de revient. Marqué `reward_eligible` s'il peut être proposé en cadeau. Re-téléverser le catalogue met à jour les articles existants (upsert sur le nom) et désactive ceux absents du nouveau fichier — jamais de suppression (préserve l'historique des récompenses).
_Avoid_ : produit, item (anglicisme), plat (exclut à tort boissons et accompagnements).

**Catégorie** :
Famille d'un article dans le catalogue (ex. "Burger", "Accompagnement", "Dessert", "Boisson"). Sert à regrouper les articles, à restreindre les suggestions de cadeaux à une taille cohérente avec le palier, et à composer les combos (évolution future). Sans rapport avec une communauté/équipe.
_Avoid_ : type, segment, rayon.

**Prix de vente** :
Prix carte d'un article (`menu_items.menu_price`) — la valeur perçue par le client quand il reçoit l'article en cadeau. Sert de numérateur au calcul d'attractivité d'une suggestion. Donnée euros, admin uniquement.
_Avoid_ : prix public, tarif, prix client.

**Prix de revient** :
Coût matière réel d'un article (`menu_items.cost_price`), saisi par le restaurateur lui-même — jamais calculé à sa place (ADR 0013). C'est ce coût qui alimente le plafond de budget cadeaux (ADR 0012) et le coût figé dans `pending_rewards`. Donnée euros, admin uniquement, jamais côté membre (ADR 0007).
_Avoid_ : coût (trop vague seul), prix d'achat, marge.

**Suggestion de cadeau** :
Proposition automatique de l'app indiquant quel article placer à un palier donné, classée par attractivité (`prix_vente / prix_revient` — forte valeur perçue par euro de coût réel) et filtrée pour rester sous le plafond de budget cadeaux. Formulée en clair via `@anthropic-ai/sdk`. L'app propose, l'admin décide : jamais appliquée automatiquement (ADR 0013). Distincte de la grille par défaut (ci-dessous).
_Avoid_ : attribution automatique, recommandation auto, cadeau imposé.

**Grille par défaut** :
Configuration calculée de façon déterministe (sans IA) et appliquée dès la soumission du catalogue si — et seulement si — rien n'est encore configuré (ADR 0017 §4) : paliers solo dimensionnés sur le panier moyen, articles sous plafond de palier, cadeau des 4 jetons. Non-destructive (une couche configurée n'est jamais écrasée) ; le restaurateur révise et ajuste depuis `/admin/menu`. Évite qu'un établissement retombe sur la grille héritée Belchicken.
_Avoid_ : suggestion de cadeau (celle-ci est proposée, pas appliquée), grille héritée (c'est ce qu'elle remplace).

---

### Établissements

**Établissement** :
*(Pivot ADR 0015, 2026-07-01 — remplace le modèle "3 restaurants Belchicken" ci-dessous, historique conservé pour mémoire.)* Un restaurant du réseau, avec son propre programme isolé : communautés, scores, seuils CA, récompenses et liens sociaux séparés — l'isolation par `restaurant_id` reste inchangée. Ce qui change : un membre peut désormais appartenir à **plusieurs établissements simultanément** (au plus une équipe par établissement, ADR 0014 §1 amendé), au lieu d'un seul établissement choisi à l'inscription et non modifiable. Les données d'un établissement restent invisibles aux membres/admins d'un autre établissement — seul le compte membre lui-même est partagé entre établissements qu'il a rejoints.
_Avoid_ : tenant, instance ; "restaurant" reste acceptable mais préférer "établissement" dans les textes de domaine.

**Déploiement par établissement** *(obsolète — ADR 0015 supersede ADR 0005)* :
Ancien modèle : chaque établissement disposait de sa propre URL Vercel et de ses propres variables d'environnement (`RESTAURANT_ID`, liens sociaux), le même codebase déployé une fois par restaurant. Remplacé par un **déploiement unique** servant tous les établissements du réseau — l'isolation reste assurée par `restaurant_id` sur toutes les tables, mais n'est plus figée par l'environnement de déploiement.
_Avoid_ : multi-tenant (jargon technique), site, instance.

**Restaurateur / Admin établissement** *(ADR 0015)* :
Compte qui a créé l'établissement (self-service), sur le modèle du capitaine d'équipe (ADR 0014). Gère uniquement son propre établissement (menu, seuils, équipes, commandes suspectes). Un restaurateur peut posséder plusieurs établissements. Distinct du **super-admin plateforme**, qui approuve les nouveaux établissements avant leur mise en ligne et voit les statistiques cross-établissements.
_Avoid_ : gérant (réservé à une évolution future de co-admin), propriétaire.

**Lien d'invitation restaurateur** *(ADR 0032)* :
Lien à usage unique généré par le super-admin depuis `/platform` (table `owner_invites`, 14 jours), envoyé au restaurateur par WhatsApp ou email. Son clic pose `restaurants.owner_id` — il peut créer son compte à ce moment-là, rien n'est requis avant. Un seul lien actif par établissement (en générer un nouveau révoque le précédent) ; révocable à tout moment. Remplace comme voie principale le rattachement par email d'un compte déjà existant (`assignOwner`), qui reste disponible en voie secondaire.
_Avoid_ : magic link (réservé à la connexion Supabase), invitation membre (le parrainage, ADR 0006, est un autre objet).

**Statut établissement** *(ADR 0015)* :
`pending` (créé en self-service, invisible aux membres, en attente de validation par le super-admin) ou `active` (visible et rejoignable). Contrôle qualité en phase de lancement — jamais de mise en ligne automatique.
_Avoid_ : approuvé/rejeté (le rejet n'est pas encore modélisé), publié.

**Compte démo** *(ADR 0033)* :
Établissement fictif (`restaurants.is_demo`) créé pour démontrer le produit à un prospect. Ce n'est **pas un mode** : même table, même code, même parcours, aucune branche conditionnelle — seule sa **visibilité** change. Il est exclu de l'accueil, de `/secteurs`, de la liste « Choisis ton restaurant » et des chiffres réseau ; son URL directe `/r/[id]` reste accessible, c'est ce qu'on ouvre pendant la démonstration. Bascule réversible d'un clic depuis `/platform`. Depuis m56, tous les établissements sauf Belchicken Kraainem sont des comptes démo. Toute nouvelle surface publique listant des établissements passe par `listLiveRestaurants()` (`lib/demo.ts`) — `status = 'active' AND is_demo = false`.
_Avoid_ : mode démo, environnement de test, sandbox (réservé à `/admin/[id]/sandbox`), faux restaurant.

**Date d'activation** *(ADR 0033)* :
`restaurants.activated_at` — moment du passage en statut `active`, **distinct de `created_at`** : un établissement démarché est créé le jour du rendez-vous et mis en ligne plus tard. Maille de la courbe « établissements activés par mois ». Seule la **première** activation est retenue : réactiver un établissement désactivé ne le recompte pas comme nouveau.
_Avoid_ : date de création (c'est autre chose), date d'inscription.

**Secteur** *(ADR 0016)* :
Ville ou quartier d'un établissement (`restaurants.sector`, texte libre) — la maille d'agrégation de la page publique `/secteurs`, qui montre l'activité du réseau (établissements actifs, membres, équipes actives) comme preuve sociale pour les restaurateurs prospects. Distinct de l'adresse (qui localise un établissement précis). Obligatoire à l'inscription partenaire. Jamais d'euros/CA sur cette page (ADR 0007 s'applique au public).
_Avoid_ : zone (vague), région (trop large), localisation (c'est l'adresse).

---

### Communautés & Équipes

**Équipe** :
Groupe créé par un membre et rejoint par d'autres (`teams`) : élèves d'une école, professeurs, salariés d'une entreprise, habitants d'une rue ou d'un quartier, chauffeurs de taxi… Permanente (aucune élimination). Appartient à un seul établissement — même nom dans deux établissements = deux équipes distinctes (membres, score et dépense cumulée séparés). Un membre appartient à au plus une équipe par établissement.
_Avoid_ : équipe nationale (obsolète — ADR 0014), groupe, clan, team (anglicisme dans les textes UI).

**Communauté** :
Synonyme métier d'« équipe » côté affichage. Ensemble des membres d'une même équipe partageant un score communautaire commun.
_Avoid_ : groupe, clan.

**Capitaine** :
Membre qui a créé l'équipe (`teams.created_by`) — soit en la créant lui-même, soit en étant **le premier à se reconnaître dans une communauté** proposée par l'établissement (ADR 0031). Peut la renommer et partager le lien d'adhésion. L'admin établissement garde un droit de modération (renommer, fusionner, désactiver une équipe, corriger son type).
_Avoid_ : chef, propriétaire, admin (réservé à l'admin établissement).

**Communauté déclarée** *(ADR 0031)* :
Nom d'école, d'entreprise ou de quartier que le **restaurateur** déclare (onboarding étape 1, modifiable dans ses réglages) comme provenance réelle de ses clients — `team_suggestions`, 8 maximum. Ce n'est **pas** une équipe : ni score, ni membres, ni place au classement, et le nom n'est jamais publié tant que personne ne s'y reconnaît. Le premier membre qui répond « oui » **matérialise** l'équipe (`team_suggestions.team_id`) et en devient le capitaine.
_Avoid_ : équipe pré-créée, équipe automatique, équipe officielle, partenaire.

**Question de reconnaissance** *(ADR 0031)* :
« Te reconnais-tu dans une de ces équipes ? » — posée en fin de tutoriel, **un seul écran**, 4 communautés maximum affichées ensemble, le membre tape la sienne (ou « Aucune de ces équipes »). **Jamais de points ni de nombre de membres affichés** (c'est une question d'identité, pas une comparaison d'équipes), **jamais d'ordre par score** (sinon le membre rejoint le leader, pas les siens). Aucune reconnaissance → la page équipe, avec un message explicite : sans équipe, les cadeaux personnels tombent quand même. Toute sortie sans équipe arme une relance **une semaine** plus tard (`memberships.team_prompt_next_at`) ; « Aucune de ces équipes » mémorise en plus les propositions vues (`team_prompt_declined`) pour en montrer d'autres à la relance.
_Avoid_ : quiz, sondage, obligatoire, « choisis ton équipe » (c'est une reconnaissance, pas un choix stratégique), enchaînement oui/non (remplacé — trop de décisions pour rien).

**Type d'équipe** :
Catégorie d'une équipe (`teams.type`) : `ecole`, `entreprise`, `rue_quartier`, `taxis`, `autre`. Sert au ciblage des broadcasts admin (ex. « menu étudiant » → toutes les équipes de type `ecole`). À ne pas confondre avec la catégorie d'un article du catalogue menu.
_Avoid_ : catégorie (réservé au catalogue menu), segment.

**Adhésion** :
Action de rejoindre une équipe via un lien/QR partageable (`/join-team?code=`, sur le modèle du parrainage), en un clic depuis la liste « Équipes dans ta zone » (ADR 0018), ou en se reconnaissant dans une **communauté déclarée** par l'établissement (ADR 0031). Ouverte par défaut : le lien, la zone ou la reconnaissance suffit. *Rejoindre* pour faire grandir son équipe est libre et encouragé — c'est le moteur de recrutement.
_Avoid_ : inscription (réservé à la création de compte), invitation.

**Zone** :
Ville ou quartier déclaré par le membre à l'inscription (`profiles.zones`, 1 à 3 : là où il vit, travaille, va à l'école — ADR 0018). Les équipes portent aussi une zone (`teams.zone`) ; la page équipe propose au membre les équipes actives dans ses zones, joignables en un clic. L'équipe n'est **jamais obligatoire** : sans équipe, l'app reste entièrement accessible et la couche solo fonctionne. Texte libre, correspondance insensible à la casse et aux accents. À ne pas confondre avec le **secteur** d'un établissement (ADR 0016) — même maille géographique, mais l'un décrit un resto, l'autre un membre ou une équipe.
_Avoid_ : secteur (réservé aux établissements), région (trop large), localisation (suggère du GPS — c'est déclaratif).

**Changement d'équipe** :
Un membre peut quitter son équipe pour une autre, **au plus une fois par mois** (anti score-surfing : empêche de sauter sur une équipe juste avant un palier). Remplace l'ancien « transfert » lié à l'élimination (ADR 0004, superseded par ADR 0014). L'historique de dépenses du membre le suit (principe ADR 0001).
_Avoid_ : transfert (obsolète — lié à l'élimination), switch.

---

### Administration

**Admin** :
Utilisateur avec `is_admin = true`. Peut valider/rejeter les commandes suspectes, gérer les paliers, les équipes, les seuils CA et marquer les récompenses en attente comme récupérées. Bootstrappé via la variable d'environnement `ADMIN_EMAILS`.
_Avoid_ : manager, gérant, superuser.

**Validation** :
Action de l'admin qui passe une commande de `pending` à `validated` (cas suspects uniquement — les commandes normales sont auto-validées). Déclenche la mise à jour du score communautaire via trigger Supabase et la création de la récompense en attente. Irréversible sans action admin explicite.
_Avoid_ : approbation, confirmation.

**Période** :
Intervalle de temps associé à un seuil CA restaurant (ex : "Phase de groupes — Semaine 1"). Défini par l'admin. Plusieurs périodes peuvent coexister dans l'historique.
_Avoid_ : phase, semaine (trop lié au calendrier de la Coupe du Monde).

**Membre actif** *(ADR 0033)* :
Compte ayant fait **valider au moins un ticket** sur la période considérée (30 jours, 90 jours, ou le mois d'une série). Seule mesure qui distingue un compte créé d'un client réellement fidélisé — « nombre de membres » se confond avec le nombre d'inscriptions. Chiffre de la console plateforme (`/platform/stats`) exclusivement.
_Avoid_ : utilisateur actif, MAU/DAU (jargon), membre engagé.

**Backlog plateforme** *(ADR 0033)* :
Plan d'action partagé entre les associés de la plateforme (`platform_backlog`, `/platform/backlog`). Une action = un titre, un chantier (`produit`, `tech`, `vente`, `marketing`, `ops`, `legal`), un état (`idee`, `a_faire`, `en_cours`, `bloque`, `fait`, `abandonne`), un impact et un effort notés 1–5. **La priorité n'est jamais saisie : elle se calcule** (`impact ÷ effort`) — noter deux échelles force la comparaison entre actions, poser « P1 » ne force rien. Vit dans la console, à un onglet des chiffres, parce que les décisions se prennent devant eux.
_Avoid_ : roadmap (c'est un plan d'action court terme, pas une feuille de route produit), sprint, ticket (réservé au ticket de caisse), tâche.

**Opportunité** :
Suggestion commerciale chiffrée de la page admin `/admin/[id]/insights`, calculée par le moteur de stratégies terrain (`lib/insights.ts`, ADR 0022) à partir des ventes scannées (ADR 0020) et du catalogue (ADR 0013) : jour/heure creux, promo sûre, combo, formule dégressive. Fonctions pures et déterministes — chaque suggestion est explicable par ses chiffres, préserve la marge unité par unité, et n'est jamais appliquée automatiquement (l'app propose, l'admin décide). Surface admin uniquement : les coûts et marges n'apparaissent jamais dans le message broadcast proposé (ADR 0007).
_Avoid_ : conseil IA (le calcul est déterministe), recommandation automatique.

**Promo planifiée** :
Opportunité liée à un jour de semaine (jour creux, jour de rush) transformée en promo datée (ADR 0023) : la suggestion vise la prochaine occurrence du jour ciblé (au plus tôt J+2) et son annonce aux membres part **la veille ou l'avant-veille, jamais plus tôt** — une annonce précoce ferait reporter des commandes plein tarif vers le jour remisé. Fenêtre J-1/J-2 verrouillée côté serveur. Le broadcast attend dans `scheduled_broadcasts` et part via le cron du soir (`/api/cron/broadcasts`), avec la même enveloppe anti-spam que les broadcasts immédiats. Le restaurateur voit la date de la promo à l'avance (préparation du stock) et peut annuler tant que l'annonce n'est pas partie.
_Avoid_ : campagne programmée, notification différée (c'est un broadcast admin, même pipeline).

**Stratégies membres** :
Trois notifications personnalisées jouées par le cron quotidien pour tous les membres, avec ou sans équipe (ADR 0024) : **nudge de palier** (panier habituel juste sous un palier solo → montrer le cadeau à quelques euros près, zéro remise), **cadeau d'anniversaire** (article offert via `pending_rewards` `source='birthday'`, plafond de coût `max(panier moyen × budget %, dépense cumulée × 1 %)` — la reconnaissance grandit avec la fidélité ; le coupon cashier affiche la dépense cumulée du membre), **réactivation** (silence ≥ 2× l'intervalle médian du membre → rappel personnalisé). Même enveloppe anti-spam que les notifications d'incitation (ADR 0009). Les euros cités sont les dépenses propres du membre (ADR 0007).
_Avoid_ : campagne CRM, marketing automation, segment (les décisions sont par membre, pas par segment).


---

### Dashboard membre

**Aperçu prochaine commande** :
Section hero du dashboard membre. Affiche en temps réel la récompense totale (couches 1+2+3) que le membre obtiendrait s'il commandait maintenant, avec une ligne étiquetée par couche ("ton cadeau de base" / "force de ta communauté" / "palier d'équipe débloqué"). C'est la réponse à la question fondamentale : "qu'est-ce que je gagne ce soir ?". Calculé via `getDashboardData()`, rafraîchi toutes les 30s. Fallback si aucun historique : prévisualisation pour €25. Masque le bonus communautaire si double verrou non satisfait. (Le bonus d'avancement Coupe du Monde a été remplacé par les paliers d'équipe — ADR 0014.) Voir ADR 0010.
_Avoid_ : carte de récompenses, aperçu des points (la récompense est concrète — jamais abstraite).

**Notification d'incitation** :
Message proactif envoyé à un membre montrant l'état de sa communauté et le cadeau concret qu'il obtiendrait en commandant maintenant. Toujours spécifique ("ton cadeau passe à Finest burger + Churros 12 pcs") — jamais générique. Trois déclencheurs : franchissement de palier, membre inactif 72h+ avec +500 pts absolus depuis sa dernière commande, proximité du prochain seuil (< 10%). Anti-spam : 48h minimum, max 3/semaine. Canal : PWA push (gratuit) → WhatsApp (~€0,05/conversation) en fallback. Voir ADR 0009.
_Avoid_ : rappel, relance, marketing push (toujours ancré dans le score réel).

**Broadcast admin** :
Notification composée et envoyée par le restaurateur à **tous les membres de l'établissement** (canal général, avec ou sans équipe — ADR 0039), à une équipe, plusieurs équipes, ou tout un type d'équipe (ex. « menu étudiant » → type `ecole` ; « service de nuit » → type `taxis`). Distincte des notifications d'incitation automatiques (ADR 0009) : enveloppe anti-spam dédiée (≈ 2/semaine/membre). Canal PWA push → WhatsApp en fallback → in-app.

Deux **natures** (ADR 0039), qui décident du public et de la base légale : une **information** (cadeau prêt, incident, changement de règle) exécute le programme et part à tous les membres visés ; une **promotion** est une offre commerciale et ne part qu'aux membres ayant accepté les offres. Chaque nature a son enveloppe anti-spam — une promo ne consomme pas le droit d'informer.
_Avoid_ : « tous » pour dire « toutes les équipes » (c'était le bug de l'ADR 0039) ; appeler « information » un message qui vante un plat.
_Avoid_ : campagne, marketing de masse, newsletter.

---

### Navigation & parcours *(ADR 0030)*

**Règle du retour** :
Toute page qui n'est pas un onglet de la BottomNav (membre) ou une entrée de la sidebar (admin) DOIT avoir un header avec `←` vers son parent logique. Pas de breadcrumb (profondeur max 2, PWA mobile). S'applique à toute nouvelle vue.
_Avoid_ : breadcrumb, fil d'Ariane.

**Hub membre** :
Le dashboard membre comme point d'accès permanent à toutes les fonctionnalités. Principe : **on ne cache jamais une fonctionnalité, on montre ce qui manque pour l'utiliser** — un lien conditionnel devient une entrée permanente à état progressif (« Encore 2 commandes pour donner ton avis »). Ordre des sections : carte gérant → hero (ADR 0010) → carte Actions (ADR 0024) → progression équipe → tuiles d'accès → historique.
_Avoid_ : page d'accueil (vague), menu (réservé au catalogue).

**Tuile d'accès** :
Petite tuile permanente du hub membre (grille compacte 2×2) : icône + label + **micro-état** (« 2 paliers atteints », « 3ᵉ/12 », solde réserve). Jamais de grande carte empilée. Tuiles v1 : Récompenses · Classement · Avis · Réserve.
_Avoid_ : carte (réservé aux grandes sections du dashboard), widget.

**Carte gérant** :
Carte en position 0 du dashboard membre, visible uniquement par l'owner du resto courant : « Vous êtes le gérant de ce restaurant → Console ». Le pont membre → admin.
_Avoid_ : bannière admin.

**Mode plateforme** :
État de la console admin quand le viewer est super-admin mais pas owner du resto : bandeau « 🛠️ Mode plateforme — vous consultez [resto] · ← Retour à la plateforme ». Mêmes pouvoirs que le gérant (outil de support) — seule la signalétique change.
_Avoid_ : mode support, impersonation (le super-admin agit en son nom).

**Refus parlant** :
Tout refus d'autorisation redirige avec `?reason=…` et la page d'atterrissage affiche un bandeau clair (« Cette section est réservée aux restaurateurs », « Ta demande est en cours d'examen »). Jamais de redirection silencieuse vers `/join`.
_Avoid_ : page d'erreur (pas de nouvelle page — un bandeau contextuel).

**Membres (écran plateforme)** :
Liste nominative complète des membres (nom, email, inscription, équipe, points, dernière activité, nb commandes) — **réservée au super-admin** (la plateforme est l'unique responsable de traitement, ADR 0025). Accessible depuis `/platform` et depuis la console d'un resto en mode plateforme.
_Avoid_ : CRM, fichier client, annuaire.

**Mes clients (écran resto)** :
Liste d'activité **pseudonymisée** des membres d'un établissement pour son restaurateur : prénom/pseudo, équipe, points, nb commandes, dernière visite. **Jamais** email/téléphone, **jamais** d'export (ADR 0025 : le resto ne reçoit pas de coordonnées ; il agit via le ciblage broadcast). Entrée dédiée en sidebar, section Fidélisation.
_Avoid_ : fichier client, export clients, contacts.

---

### Qualité & retours *(ADR 0023 — proposé)*

**Retour** :
Message qu'un membre adresse à **son** établissement dans le canal qualité privé, en choisissant une **intention** — un **encouragement** ou un **signalement**, jamais mitigé. Rattaché à une commande validée (anti-faux-avis). Donnée personnelle du membre (export / effacement, ADR 0022).
_Avoid_ : avis (réservé à l'avis Google public), note, review, commentaire (le commentaire n'est qu'un champ optionnel du retour).

**Encouragement** :
Retour **positif**. Le **prénom** du membre est visible par le restaurateur — c'est ce qui crée le lien. Nourrit le baromètre côté positif.
_Avoid_ : like, avis positif.

**Signalement** :
Retour **négatif** (précision de commande, attente, qualité/température, accueil). **Anonyme par défaut** vis-à-vis du restaurateur (le membre peut toujours forcer l'anonymat) ; contexte **grossi** (jour + créneau, jamais le Bestelnummer ni la minute) pour ne pas ré-identifier. Le membre peut demander à être recontacté (opt-in par incident) via un fil **médié par la plateforme**.
_Avoid_ : plainte / réclamation (usage oral toléré, mais « signalement » est le terme canonique — moins accusatoire), avis négatif.

**Baromètre de confiance** :
Lecture qualité d'un établissement **réservée au restaurateur** (jamais exposée au client — miroir de l'ADR 0007). **Ce n'est pas une note chiffrée** : un **état** (vert / orange / rouge) + une **tendance** (vs période précédente) + une **décomposition** actionnable (encouragements vs signalements, axes récurrents, taux de réponse). « Pas assez de signaux » tant que les retours sont trop peu nombreux.
_Avoid_ : score (réservé au **score communautaire**), score de confiance, note, grade, notation.

**Service recovery** :
Réponse du restaurateur à un signalement, via un **fil médié par la plateforme** — il **ne reçoit jamais** le numéro/email du membre. Transforme un mécontentement en relation réparée.
_Avoid_ : SAV, réclamation, support.

---

## Example dialogue

> ⚠️ *Dialogue d'époque Coupe du Monde — les échanges mentionnant « bonus de tour », « avancement », « Belgique en quarts » ou `round_reached` sont obsolètes (ADR 0014). Les notions de double verrou, de couches de récompense, de doublon (Bestelnummer) et de commande directe restent valables. À rafraîchir lors de l'implémentation du pivot.*

> **Dev** : "Je dois afficher le score de la communauté belge avec le bonus — comment je calcule ça ?"
>
> **Expert** : "Tu prends le score communautaire brut — membres × euros validés — et si la Belgique a passé un tour il y a moins de 48h, tu affiches score × 1.5. Mais tu ne stockes rien de différent en base. Et tu affiches 'points', jamais 'euros'."
>
> **Dev** : "Et la récompense en attente d'Ahmed qui vient de commander €30, Belgique en quarts avec score 7 500 — comment je la calcule ?"
>
> **Expert** : "Palier solo : €30 → Finest burger. Bonus communautaire : score 7 500 → tranche 6 000–9 999 → +Finest burger. Récompense d'avancement : Belgique en quarts → +Finest burger. Double verrou vérifié pour le bonus communautaire seulement. Total : 3× Finest burger en attente. C'est ça que tu insères dans pending_rewards."
>
> **Dev** : "Mais le double verrou n'est pas satisfait cette semaine — le bonus communautaire tombe ?"
>
> **Expert** : "Exactement. Le palier solo et la récompense d'avancement restent. Seul le bonus communautaire disparaît. Le client voit un message neutre, jamais la raison."
>
> **Dev** : "Est-ce qu'une commande Uber Eats peut être soumise si le client a un ticket papier ?"
>
> **Expert** : "Non. Peu importe le ticket — si la commande a été passée via une plateforme, elle ne compte pas. C'est la case à cocher obligatoire dans le formulaire de soumission."
>
> **Dev** : "Un client soumet un ticket mais l'OCR ne trouve pas de Bestelnummer — que se passe-t-il ?"
>
> **Expert** : "La commande passe en file admin (status pending). L'admin la voit dans /admin/orders et valide ou rejette manuellement. Le client voit 'Vérification en cours' sans délai artificiel supplémentaire — il sera notifié quand c'est traité."
