# ADR 0084 — Réserver un prestataire (vidéo, photo, design, impression) depuis la console

**Statut** : Proposé (2026-10-09) — décidé par le porteur en conversation de session
(2026-09-30 → 2026-10-09) sur la maquette « Parcours Vidéo » (45 écrans :
https://claude.ai/artifact/Mz8ZtA1Yv7LNSVRnWFrj5K), **à valider par l'associé avant de
brancher les paiements**.
Amende l'[ADR 0074](0074-boosteats-outil-marketing-pas-outil-d-exploitation.md) §4 sur **un
seul point** : Stripe Connect n'est plus exclu, il sert **uniquement** à payer des
prestataires de contenu (jamais des commandes de repas, jamais un membre). Précise l'[ADR
0081](0081-le-jeu-de-la-croissance.md) §6 : le bouton « Je veux des vidéos » mène à ce module
quand il est ouvert. N'amende **ni l'ADR 0007 ni l'ADR 0028** : le membre n'en voit rien.
Appliqué avec le bouclier de l'[ADR 0065](0065-le-bouclier-scene-trace-echos.md).

## Contexte

Le restaurateur veut des vidéos, des photos, un menu dessiné, des QR codes imprimés — vite,
et sans se faire avoir. Les prestataires sérieux (3 à Bruxelles aujourd'hui : un vidéaste, un
graphiste, un imprimeur) veulent l'inverse : ne pas perdre un jour de tournage sur un
restaurateur absent, un brief flou ou dix allers-retours. Le problème n'est pas la création,
c'est la **confiance des deux côtés**.

Le porteur a fait une centaine de tournages (reels, corporate, shootings photo, face cam). Les
causes d'échec reviennent toujours : équipe pas prévenue, tournage pendant le rush, brief
vague puis demandes en cours de route, ambitions sans budget, restaurateur qui se mêle du
travail, prestataire qui disparaît, qui sous-estime ou qui survend, retours en ping-pong,
décisions qu'un associé défait. Ce module **écrit ces règles dans le produit**.

Cela passe le filtre de l'ADR 0074 §3 : ce sont des contenus **marketing** qui font revenir
des clients, et l'ADR 0081 §6 propose déjà des vidéos aux restaurateurs sans l'outil pour
les commander. La pub (module de Mehdi) réutilisera plus tard les créations livrées.

## Décision

### 1. Trois espaces, un seul parcours

| Qui | Où | Quoi |
|---|---|---|
| **Restaurateur** (admin d'établissement) | `/admin/[restaurantId]/prestataires/…` | choisir un métier, remplir le brief, recevoir le devis, payer l'acompte, préparer l'équipe, suivre, demander des retouches, valider, noter |
| **Prestataire** (nouveau rôle) | `/prestataire/…` | recevoir un brief, chiffrer, bloquer la date, confirmer J-2, compte-rendu du jour J, livrer, traiter les retouches, voir ses revenus |
| **Superadmin** (`is_super_admin`) | `/platform/prestataires/…` | tableau de bord, missions, restaurants, prestataires (inviter, suspendre), litiges, configuration (taux, acompte, questionnaires) |

Le prestataire n'a **aucun siège** dans un établissement et ne voit que ses missions. Il est
créé **sur invitation de la plateforme** (les candidatures viendront plus tard). Un
prestataire peut exercer plusieurs métiers. **Rien côté membre** (ADR 0007/0028).

### 2. L'argent

- **Commission de 12,5 % comprise dans le prix du devis.** Le prestataire reçoit toujours
  **87,5 %** du prix de son devis (P). C'est une condition de son contrat-cadre, affichée sur
  son devis (« prix du devis » et « vous recevez »). Le restaurateur ne voit pas de ligne
  « commission ».
- **Plan Pro** : le restaurateur paie **92,5 % de P** ; Boosteats garde **5 %** de P ; le
  prestataire reçoit toujours 87,5 %. Gratuit et Croissance : le restaurateur paie P,
  Boosteats garde 12,5 %. Le plan se lit avec `getPlan()` (`lib/entitlements.ts`) et le
  **prix payé est figé au moment du paiement**.
- **Acompte de 20 % minimum** au paiement du devis, plus une carte (ou un mandat SEPA)
  enregistrée. Solde prélevé : vidéo et photo à J-2 ; impression après la signature du bon à
  tirer ; design à la livraison de la version 1 (fichiers en basse définition tant que le
  solde n'est pas payé). Prélèvement échoué → mission suspendue, les deux parties prévenues.
- **L'argent est retenu** par Boosteats jusqu'à la validation. Stripe Connect (comptes des
  prestataires, vérification d'identité par Stripe), **séparation encaissement / versement**.
  Prix affichés **hors TVA**. Qui facture qui (Boosteats revend, ou facturation au nom du
  prestataire) : **à confirmer par le comptable avant la mise en service** (§9).
- Montants en **euros uniquement côté restaurateur et plateforme** (B2B) ; **jamais** côté
  membre.

### 3. Les neuf règles (écrites dans le produit, acceptées par case à cocher)

1. **Brief verrouillé avant devis** : un champ obligatoire vide bloque l'envoi.
2. **Le prestataire chiffre** durée et prix ; son devis est **ferme** pour ce brief. Sous-estimer
   est son risque, pas celui du restaurateur.
3. **Budget plancher** par type de prestation (valeurs en configuration, fournies plus tard).
4. **Ambition réaliste** : le brief demande la taille du projet ; un budget très inférieur à
   l'ambition déclarée est signalé avant l'envoi.
5. **Le restaurateur cadre, le prestataire propose** : contraintes limitées, 2 à 3
   propositions, le restaurateur en choisit **une**, c'est verrouillé.
6. **Un seul contact sur place**, nommé dans le brief ; le restaurateur ne s'interpose pas.
7. **Une décision engage tous les décideurs** : le restaurateur les déclare et atteste qu'ils
   ont tous validé.
8. **Deux tours de retours, chacun en un seul envoi**, chaque remarque classée et motivée
   (« je n'aime pas » seul est refusé). Une retouche n'est pas une refonte.
9. **Tout changement après verrouillage est une demande de modification** que le prestataire
   chiffre ou refuse.

### 4. Annulation et dates liantes

| Délai avant la date | Le restaurateur annule | Le prestataire annule |
|---|---|---|
| Plus de 7 jours | remboursé | remboursé |
| 7 jours à 48 h | **50 %** retenus, versés au prestataire | remboursé, avertissement |
| Moins de 48 h ou absent | **100 %** retenus | remboursé, pénalité (visibilité réduite, puis exclusion) |

Barème affiché et accepté avant paiement. Cas de force majeure : examen au cas par cas par la
plateforme. Les pénalités s'appliquent sur la carte enregistrée.

### 5. Le tournage se prépare (le cœur du module)

- **Deux temps** (amendé le 2026-10-09, maquette V4VideoBrief → V4VideoTournage) : le **brief**
  (ce qu'on filme, qui décide, budget) part au prestataire pour qu'il chiffre ; la **préparation
  du tournage** (date, créneau, qui est présent, contact sur place, accès) vient **après
  l'acceptation du devis**, dans les disponibilités du prestataire — la date ne se choisit pas
  dans le vide.
- Date de tournage **au moins 7 jours** après le jour où elle est choisie (les étudiants ne
  travaillent pas toute la semaine). Créneaux **conseillés** : avant le lunch, entre lunch et
  dîner, jour calme ; jamais le rush ni, en hiver, 18 h pour une scène de jour.
- Un **message d'équipe généré** à partir du brief (date, heure, qui doit être présent selon
  le brief, uniforme propre et repassé, plats prêts et plus remplis qu'à l'habitude, vaisselle
  propre, cuisine propre ou « aucun plan en cuisine », contact sur place), à copier ou
  partager par WhatsApp. Case « équipe prévenue » confirmée à J-7.
- **Calendrier et rappels** : invitation `.ics` aux deux parties à l'acceptation du devis ;
  rappels par mail à J-7, J-2 (confirmation des deux), la veille. Sans confirmation à J-2 :
  relance, puis alerte plateforme.
- Jour J : fiche courte pour chacun, puis **compte-rendu de tournage** validé par les deux
  (arrivée réelle, durée, éléments manquants) — il sert de preuve en cas de litige.
- Droits à l'image des figurants : **préparés par le prestataire**. Clients en salle : floutés.

### 6. États d'une mission

`brief` → `envoye` → `devis` → `accepte` (acompte payé) → `date_bloquee` → `production` →
`livre` → `retouche` (tours 1 et 2) → `valide` (auto après 7 jours et 2 rappels) → `verse`.
Branches : `annule`, `litige`, `suspendu` (paiement échoué). Chaque passage est une ligne de
la **trace** (`mission_events`) : qui, quand, de quoi à quoi.

### 7. Les questionnaires sont des données

Un modèle de brief par métier (lignes de configuration : intitulé, type de réponse,
obligatoire ou non), modifiable depuis `/platform/prestataires` sans déploiement. Ajouter un
métier ou une question ne demande pas de code. Tout format de fichier utile est accepté,
**sauf** les exécutables et les formats à scripts (`.exe`, `.js`, `.html`, `.svg`…), avec
taille maximale, reprise d'envoi pour les vidéos et analyse antivirus.

### 8. Phasage

1. **PR A** — cet ADR, le glossaire `CONTEXT.md`, le plan de livraison.
2. **PR B** — schéma (migration), logique pure testée : prix selon le plan, barème d'annulation,
   machine d'états, validité d'un brief, message d'équipe.
3. **PR C** — brief vidéo côté restaurateur (sans paiement : devis et acompte « à confirmer »).
4. **PR D** — espace prestataire : invitation, brief, devis, J-2, compte-rendu, livraison.
5. **PR E** — retouches à la seconde, validation, avis.
6. **PR F** — superadmin : missions, prestataires, configuration, litiges.
7. **PR G** — **Stripe Connect**, seulement après validation de l'associé, ouverture du compte
   Connect et vérification des trois prestataires.
8. Ensuite : photo, design, impression (bon à tirer) ; langues néerlandais et anglais ;
   passerelle vers la pub (module de Mehdi).

### 9. Questions encore ouvertes

Qui facture qui et la TVA (comptable) · contrat-cadre prestataire relu par un juriste ·
conditions générales relues pour la Flandre (langue) · report de date · budgets planchers ·
**langues** : le dépôt est en français seulement, le néerlandais et l'anglais demandent une
infrastructure de traduction qui n'existe pas encore (les textes du module iront dans un
dictionnaire pour que ce soit ajoutable sans réécrire).

## Conséquences

- **Un nouveau rôle** (prestataire) et un troisième type d'espace : garde dédiée
  (`requireProvider`), jamais mélangée aux gardes d'établissement.
- **Stripe devient une dépendance** (clé secrète, webhooks) : n'entre qu'en PR G, tout le
  reste du module fonctionne et se teste sans paiement réel.
- **Le plan d'un établissement décide un prix** : le contrat de prix (§2) est testé en logique
  pure et figé dans la mission.
- **Echo** : les boutons « Je veux des vidéos » (`service_requests`, ADR 0081 §6) pointent vers
  ce module une fois ouvert ; le service `pub` reste celui du module de Mehdi.
- **Trace** : `mission_events`, motifs de refus nommés, compteurs plateforme (briefs refusés
  pour champ manquant, devis refusés, annulations tardives, litiges, J-2 non confirmés,
  prélèvements échoués). Aucun échec silencieux.
