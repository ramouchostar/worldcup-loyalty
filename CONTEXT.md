# World Cup Loyalty — Belchicken

Programme de fidélité communautaire lié à la Coupe du Monde 2026 pour Belchicken (Bruxelles). Les clients forment des communautés autour d'équipes nationales et débloquent des récompenses collectives en dépensant directement au restaurant.

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
_Avoid_ : récompense individuelle, fidélité solo, cagnotte.

**Bonus communautaire** :
Couche 2 du système de récompenses. Article supplémentaire ajouté au palier solo en fonction du score de l'équipe du membre au moment de la validation. Soumis au double verrou. Non affiché si le double verrou n'est pas satisfait.
Grille : score < 1 000 pts → rien / 1 000–2 999 → +Frites Medium / 3 000–5 999 → +Churros 12 pcs / 6 000–9 999 → +Finest burger / 10 000+ → +Menu 4 Tenders.
_Avoid_ : palier communautaire, récompense d'équipe (confusionnable avec "palier").

**Récompense d'avancement** :
Couche 3 du système de récompenses. Bonus permanent actif tant que l'équipe est encore en compétition. Se débloque quand l'admin valide le passage d'un tour — toujours après le match, jamais avant. Non soumise au double verrou. Ce n'est pas un pari sportif : c'est une récompense de fidélité à une communauté encore en course.
Grille Coupe du Monde 2026 : Huitièmes → +Churros 6 pcs / Quarts → +Finest burger / Demi-finale → +Menu 4 Tenders / Finale → +Chef's Combo.
_Avoid_ : bonus de victoire, pari, récompense de match, bonus de tour (terme réservé au ×1.5 d'affichage).

**Récompense en attente** :
Enregistrement dans `pending_rewards` créé à chaque validation de commande. Contient le palier solo + bonus communautaire + récompense d'avancement calculés au moment de la validation. Affiché sur le dashboard comme promesse concrète avant la prochaine visite ("Ton prochain passage : Finest burger + Churros 12 pcs 🎁"). Marqué `redeemed` quand le membre récupère son cadeau au comptoir (validation admin).
_Avoid_ : crédit, cagnotte, reward (anglicisme).

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
Objectif de chiffre d'affaires que le restaurant doit atteindre sur une période donnée avant que les paliers collectifs et les bonus communautaires puissent se débloquer. Validé manuellement par l'admin. La moitié du double verrou. Entièrement invisible côté client.
_Avoid_ : objectif, quota, seuil de CA.

**Bonus de tour** :
Multiplicateur ×1.5 appliqué au score affiché d'une équipe pendant 48h après qu'elle ait passé un tour. Calculé à l'affichage uniquement — non stocké en base. Déclenché automatiquement quand l'admin met à jour `round_reached`.
_Avoid_ : bonus de match, multiplicateur de victoire, récompense d'avancement (terme distinct).

---

### Établissements

**Établissement** :
L'un des 3 restaurants Belchicken participant au programme. Chaque établissement a son propre programme isolé : communautés, scores, seuils CA, récompenses et liens sociaux séparés. Un membre appartient à un seul établissement — choisi à l'inscription, non modifiable. Les données d'un établissement ne sont jamais visibles par les membres ou admins d'un autre établissement.
_Avoid_ : restaurant (trop générique), tenant, instance.

**Déploiement par établissement** :
Chaque établissement dispose de sa propre URL Vercel et de ses propres variables d'environnement (`RESTAURANT_ID`, liens sociaux). Le même codebase est déployé 3 fois. L'isolation est assurée par `restaurant_id` sur toutes les tables.
_Avoid_ : multi-tenant (jargon technique), site, instance.

---

### Communautés & Équipes

**Communauté** :
Ensemble des membres ayant choisi la même équipe nationale. Partage un score communautaire commun. Synonyme métier de "équipe" côté base de données (`teams`).
_Avoid_ : groupe, clan, team (anglicisme à éviter dans les textes UI).

**Transfert** :
Changement de communauté par un membre dont l'équipe a été éliminée. Autorisé uniquement à l'élimination de l'équipe courante, sans limite de fois. L'historique des dépenses du membre suit lors du transfert.
_Avoid_ : changement d'équipe, switch.

<!-- VERSION HORS COUPE DU MONDE — non activée, future évolution
**Équipes thématiques** :
Remplacement des équipes nationales dans les déploiements hors Coupe du Monde. L'admin crée des équipes basées sur les préférences culinaires (ex. restaurant italien : Team Pizza / Team Calzone / Team Pâtes). Même mécanique de score communautaire, de bonus communautaire et de transfert. Pas de notion d'élimination — les équipes sont permanentes. Le transfert est libre, limité à une fois par mois. La récompense d'avancement est remplacée par des "défis mensuels" configurés par l'admin.
_Avoid_ : catégorie, segment client, équipe nationale (terme réservé à la version World Cup).
-->

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
Section hero du dashboard membre. Affiche en temps réel la récompense totale (couches 1+2+3) que le membre obtiendrait s'il commandait maintenant, avec une ligne étiquetée par couche ("ton cadeau de base" / "force de ta communauté" / "Belgique en quarts"). C'est la réponse à la question fondamentale : "qu'est-ce que je gagne ce soir ?". Calculé via `getDashboardData()`, rafraîchi toutes les 30s. Fallback si aucun historique : prévisualisation pour €25. Masque le bonus communautaire si double verrou non satisfait, masque le bonus d'avancement si équipe éliminée. Voir ADR 0010.
_Avoid_ : carte de récompenses, aperçu des points (la récompense est concrète — jamais abstraite).

**Notification d'incitation** :
Message proactif envoyé à un membre montrant l'état de sa communauté et le cadeau concret qu'il obtiendrait en commandant maintenant. Toujours spécifique ("ton cadeau passe à Finest burger + Churros 12 pcs") — jamais générique. Quatre déclencheurs : franchissement de palier, membre inactif 72h+ avec +500 pts absolus depuis sa dernière commande, proximité du prochain seuil (< 10%), avancement Coupe du Monde. Anti-spam : 48h minimum, max 3/semaine. Canal : PWA push (gratuit) → WhatsApp (~€0,05/conversation) en fallback. Voir ADR 0009.
_Avoid_ : rappel, relance, marketing push (toujours ancré dans le score réel).

---

## Example dialogue

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
