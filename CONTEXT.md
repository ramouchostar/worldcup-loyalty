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

**Ticket de caisse** :
Photo du reçu papier soumise par le membre comme preuve de sa commande directe. Stockée dans Supabase Storage bucket `receipts`. Obligatoire pour toute soumission de commande.
_Avoid_ : reçu, preuve, justificatif.

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
Enregistrement unique dans `pending_rewards` par membre (un seul actif à la fois — ADR 0011). Créé à chaque validation de commande si aucune récompense active n'existe déjà. Contient les 3 couches (palier solo + bonus communautaire + récompense d'avancement). Expire automatiquement après **48h** (`status = 'expired'`). Affiché sur le dashboard avec un compte à rebours 48h. Récupéré via coupon actif au comptoir.
_Avoid_ : crédit, cagnotte, reward (anglicisme).

**Coupon de récupération** :
Jeton à durée de vie de **10 minutes** généré quand le membre active "Récupérer mon cadeau" au restaurant. Affiché sur `/coupon/[token]` avec un countdown animé et une horloge live (mise à jour chaque seconde) — anti-capture d'écran : le cashier vérifie que l'heure affichée correspond à sa montre et que le timer tourne. Contient le nom du membre (vérification identité), les items à remettre, et expire côté serveur (pas seulement côté client). Invalidé immédiatement après validation cashier. Commande minimum **€10** sur la visite de récupération (règle opérationnelle, vérifiée par le cashier). Voir ADR 0011.
_Avoid_ : QR code (non utilisé), voucher, bon de réduction.

**Récupération** :
Action du cashier qui valide le coupon de récupération depuis `/admin/coupon/[token]` → bouton "Cadeau remis" → `redeemed_at = NOW()`, `pending_rewards.status = 'redeemed'`. Idempotente (double-tap ignoré). Débloque la génération d'une nouvelle récompense à la prochaine commande du membre.
_Avoid_ : remboursement, échange, validation (terme réservé à la validation des commandes).

**Micro-récompense** :
Action sociale unique récompensée par un jeton : avis Google, abonnement Instagram, abonnement TikTok, abonnement Facebook. Non soumise au double verrou. Une seule fois par type par membre. Maximum 4 jetons sociaux par membre.
_Avoid_ : petite récompense, bonus, action marketing.

**Parrainage** :
Mécanique distincte des micro-récompenses. Le membre partage un **lien d'invitation unique** (`/join?ref=CODE`) via WhatsApp (`wa.me/?text=...` — gratuit, natif, pas d'API). Le jeton est comptabilisé uniquement quand l'ami **complète son inscription** via ce lien — pas au moment du partage. Un ami ne peut être attribué qu'à un seul parrain (premier lien utilisé). 5 inscriptions validées via le lien = 1 jeton parrainage. Illimité — le membre peut accumuler plusieurs jetons en atteignant des multiples de 5. Ne compte pas dans les 4 jetons sociaux.

Tables : `referral_links` (code unique par membre, compteurs clicks/conversions) + `referrals` (une ligne par ami inscrit, `referee_id UNIQUE` pour éviter le double comptage).
_Avoid_ : référence, invitation par email, micro-récompense (c'est une catégorie séparée).

**Jeton** :
Unité de valeur gagnée via les micro-récompenses sociales (1 par action) ou les parrainages (1 par tranche de 5 validés). 4 jetons = 1 portion de 12 churros à récupérer au comptoir. Calculé à l'affichage uniquement à partir des claims validés — non stocké en base. Les jetons s'accumulent : 8 jetons = 2 portions, etc.
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
Proposition automatique de l'app indiquant quel article placer à un palier donné, classée par attractivité (`prix_vente / prix_revient` — forte valeur perçue par euro de coût réel) et filtrée pour rester sous le plafond de budget cadeaux. Formulée en clair via `@anthropic-ai/sdk`. L'app propose, l'admin décide : jamais appliquée automatiquement (ADR 0013).
_Avoid_ : attribution automatique, recommandation auto, cadeau imposé.

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

**Statut établissement** *(ADR 0015)* :
`pending` (créé en self-service, invisible aux membres, en attente de validation par le super-admin) ou `active` (visible et rejoignable). Contrôle qualité en phase de lancement — jamais de mise en ligne automatique.
_Avoid_ : approuvé/rejeté (le rejet n'est pas encore modélisé), publié.

---

### Communautés & Équipes

**Équipe** :
Groupe créé par un membre et rejoint par d'autres (`teams`) : élèves d'une école, professeurs, salariés d'une entreprise, habitants d'une rue ou d'un quartier, chauffeurs de taxi… Permanente (aucune élimination). Appartient à un seul établissement — même nom dans deux établissements = deux équipes distinctes (membres, score et dépense cumulée séparés). Un membre appartient à au plus une équipe par établissement.
_Avoid_ : équipe nationale (obsolète — ADR 0014), groupe, clan, team (anglicisme dans les textes UI).

**Communauté** :
Synonyme métier d'« équipe » côté affichage. Ensemble des membres d'une même équipe partageant un score communautaire commun.
_Avoid_ : groupe, clan.

**Capitaine** :
Membre qui a créé l'équipe. Peut la renommer et partager le lien d'adhésion. L'admin établissement garde un droit de modération (renommer, fusionner, désactiver une équipe, corriger son type).
_Avoid_ : chef, propriétaire, admin (réservé à l'admin établissement).

**Type d'équipe** :
Catégorie d'une équipe (`teams.type`) : `ecole`, `entreprise`, `rue_quartier`, `taxis`, `autre`. Sert au ciblage des broadcasts admin (ex. « menu étudiant » → toutes les équipes de type `ecole`). À ne pas confondre avec la catégorie d'un article du catalogue menu.
_Avoid_ : catégorie (réservé au catalogue menu), segment.

**Adhésion** :
Action de rejoindre une équipe via un lien/QR partageable (`/join-team?code=`, sur le modèle du parrainage). Ouverte par défaut : le lien suffit. *Rejoindre* pour faire grandir son équipe est libre et encouragé — c'est le moteur de recrutement.
_Avoid_ : inscription (réservé à la création de compte), invitation.

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


---

### Dashboard membre

**Aperçu prochaine commande** :
Section hero du dashboard membre. Affiche en temps réel la récompense totale (couches 1+2+3) que le membre obtiendrait s'il commandait maintenant, avec une ligne étiquetée par couche ("ton cadeau de base" / "force de ta communauté" / "palier d'équipe débloqué"). C'est la réponse à la question fondamentale : "qu'est-ce que je gagne ce soir ?". Calculé via `getDashboardData()`, rafraîchi toutes les 30s. Fallback si aucun historique : prévisualisation pour €25. Masque le bonus communautaire si double verrou non satisfait. (Le bonus d'avancement Coupe du Monde a été remplacé par les paliers d'équipe — ADR 0014.) Voir ADR 0010.
_Avoid_ : carte de récompenses, aperçu des points (la récompense est concrète — jamais abstraite).

**Notification d'incitation** :
Message proactif envoyé à un membre montrant l'état de sa communauté et le cadeau concret qu'il obtiendrait en commandant maintenant. Toujours spécifique ("ton cadeau passe à Finest burger + Churros 12 pcs") — jamais générique. Trois déclencheurs : franchissement de palier, membre inactif 72h+ avec +500 pts absolus depuis sa dernière commande, proximité du prochain seuil (< 10%). Anti-spam : 48h minimum, max 3/semaine. Canal : PWA push (gratuit) → WhatsApp (~€0,05/conversation) en fallback. Voir ADR 0009.
_Avoid_ : rappel, relance, marketing push (toujours ancré dans le score réel).

**Broadcast admin** :
Notification composée et envoyée par le restaurateur à une équipe, plusieurs équipes, ou tout un type d'équipe (ex. « menu étudiant » → type `ecole` ; « service de nuit » → type `taxis`). Distincte des notifications d'incitation automatiques (ADR 0009) : enveloppe anti-spam dédiée (≈ 2/semaine/membre). Canal PWA push → WhatsApp en fallback.
_Avoid_ : campagne, marketing de masse, newsletter.

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
