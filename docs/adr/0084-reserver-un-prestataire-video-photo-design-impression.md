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
   *Précisé le 2026-10-14 (PR M)* : demandée **après l'acceptation du devis et jusqu'à J-7** du tournage
   (au-delà, l'équipe est prévenue et le prestataire s'est organisé). Une demande = des catégories (plats,
   cuisine ou salle, ton, format ou durée, personnes, autre) + une explication d'au moins 30 caractères +
   pièces jointes éventuelles. Le prestataire a **3 jours** pour répondre : un **supplément** (jusqu'à
   5 000 €, **éventuellement nul**) et des jours de livraison en plus, ou un **refus avec sa raison**. Le
   restaurateur accepte ou non le supplément (jusqu'à J-7). **Refus ou silence : le brief d'origine tient**,
   rien d'autre ne change. **Une seule demande ouverte à la fois, deux au total** ; une demande que le
   prestataire refuse, laisse expirer ou que le restaurateur retire ne compte pas dans les deux. À
   l'acceptation, le supplément est **figé** (plan et conditions du moment, même commission que le devis) et
   ajouté aux montants de la mission ; avant Stripe il se règle à la main avec le solde, la plateforme est
   alertée par e-mail. Les dates convenues ne changent pas.

*Les règles sont écrites dans le produit, avec une VERSION* (amendé le 2026-10-14, PR N ; `lib/mission-rules.ts`) :
une liste dans les mots du restaurateur (11 règles : brief verrouillé, devis ferme, idées, décideurs, contact,
équipe, retours, validation automatique, date liante et barème, acompte, médiation) et une dans ceux du prestataire
(9 règles). Le **restaurateur** coche « j'ai lu les règles et je les accepte pour ce brief » **à chaque brief envoyé**
(sans la case, l'envoi est refusé) ; le **prestataire** les accepte **une fois par version**, avant son premier devis (il
peut refuser un brief sans les avoir acceptées). Une acceptation garde : qui, quand, **quelle version**, pour quelle
mission (`rules_acceptances` et la trace `rules_accepted`). Changer un mot des règles change la version (un test épingle
l'empreinte du texte). **Brouillon à faire relire par un juriste** avant l'ouverture au public (§9).

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
- **Propositions créatives** (amendé le 2026-10-13, PR K) : **après** la date bloquée, le prestataire
  propose **2 ou 3 idées** de tournage, la première étant celle qu'il recommande. Une idée = un titre,
  l'idée en quelques phrases, ce qu'il faut prévoir sur place (plats, personnes) et un lien d'exemple
  (https). Le prestataire dépose avant **J-4** (rappel ce jour-là, accepté jusqu'à J-3, alerte
  plateforme dès J-2 sans proposition). Le restaurateur choisit **avant J-2** ; la choisie est
  **verrouillée**. **Silence : la première est retenue d'office à J-2**, tout le monde est prévenu par
  e-mail. **Aucune ne plaît** (jusqu'à J-3) : **UNE seule** nouvelle série, avec une raison par idée
  refusée (12 caractères au moins) ; le prestataire a jusqu'à J-2, le restaurateur choisit jusqu'à J-1,
  sinon la première de la nouvelle série est retenue ; sans nouvelle série, on retombe sur la première
  de la première. Le message d'équipe de J-7 part avant le choix : une fois l'idée retenue, un
  **second message** (« on tourne X, prévoir Y ») est proposé à partager. Les idées ne bloquent pas
  le tournage : sans idée, la plateforme appelle le prestataire, le jour J reste possible.
- **Pièces jointes** (amendé le 2026-10-14, PR L) : trois endroits — le **brief** (restaurateur : logo,
  photos de plats, charte, exemples ; 10 fichiers, verrouillés à l'envoi), les **idées** (prestataire :
  une image ou un PDF de référence, 3 par idée) et les **retouches** (restaurateur : captures, 5 par
  tour). **25 Mo** par fichier, **200 Mo** par mission. Formats utiles seulement : images (jpg, png,
  webp, gif, heic, svg sans code actif), PDF, Office, vidéo (mp4, mov, webm), audio, polices, `.zip`.
  **Refusés** : programmes, scripts, pages web, fichiers à macros, archives rar/7z — vérifié sur le
  nom (double extension comprise) ET sur le **contenu réel** (les premiers octets doivent être ceux
  du format annoncé). Espace **privé** ; téléchargement forcé par un lien signé de 60 s, jamais
  ouvert dans la page. **Les livraisons restent des liens** : les vidéos lourdes demandent un
  stockage à bas coût et un envoi en morceaux (Cloudflare R2 ou Infomaniak, à trancher). Une
  analyse antivirus (service externe) viendra dans une PR dédiée ; en attendant, la liste blanche,
  le contrôle du contenu et le téléchargement forcé limitent le risque.
- Droits à l'image des figurants : **préparés par le prestataire**. Clients en salle : floutés.

### 5 bis. Les métiers d'atelier : graphiste, imprimeur (amendé le 2026-10-19, PR O)

Deux familles de métiers (`lib/mission-metier.ts`). Les **métiers de tournage** (vidéo, photo) sont liés par une
**date** (§5). Les **métiers d'atelier** (design, impression) n'ont pas de date de tournage : le restaurateur indique
**pour quand** il veut son travail (au moins 5 jours devant), le prestataire dit **dans son devis** s'il peut le tenir.

- **Parcours** : brief → devis → devis accepté → le prestataire touche **« Je commence »** (`accepte → production`, ce geste
  fait foi) → livraison par liens → deux tours de retours → validation. Ni message d'équipe, ni présence, ni compte-rendu
  de tournage, ni idées de tournage, ni rappels de J-7.
- **Annulation** (décision du porteur) : **gratuite tant que le prestataire n'a pas commencé**. Une fois commencé, **l'acompte
  reste au prestataire** (sa part au prorata, le reste à Boosteats) et le reste est rendu ; le prestataire qui annule après
  avoir commencé rembourse tout et reçoit un avertissement. Pour l'imprimeur, la même règle vaudra jusqu'à la signature du
  bon à tirer, après laquelle on n'annule plus (PR suivante).
- **Brief du graphiste** (d'après la maquette V4DesignBrief) : ce qu'on dessine (carte ou menu, menu du jour, flyer, affiche,
  logo et charte, visuels réseaux), l'usage, la charte (« rien choisi » : le graphiste fait choisir couleurs, polices et
  modèle), les langues, le style, ce qu'on aime et n'aime pas, le **contenu final** — case d'engagement : ajouter un plat
  ensuite est une demande de modification —, les décideurs, le budget, le jour souhaité.
- **Retouches** d'un visuel : deux tours (§3 règle 8), remarques classées (texte, prix, couleur, logo, photo, mise en page) et
  motivées. Les épingles posées sur l'image (maquette) viendront avec un visualiseur d'images.
- **Règles du jeu d'atelier** : leur propre texte et leur propre version (`STUDIO_RULES_VERSION`), à accepter comme celles du
  tournage.
- **Modification** (règle 9) : possible après le devis accepté **et pendant la création**, sans limite de J-7 (il n'y a pas de date).

### 5 ter. L'imprimeur et le bon à tirer (amendé le 2026-10-20, PR P)

L'impression est un métier d'atelier (§5 bis) avec un **bon à tirer (BAT)** entre le devis et le papier.

- **Brief** (maquette V4PrintBrief) : produit (menus, flyers, affiches, banderoles, chevalets, sets de table, sacs et
  emballages, autocollants, cartes de visite), quantité, format, papier, finition, fichier (prêt, ou « à faire faire » : un
  graphiste d'abord ; un fichier « prêt » exige une pièce jointe, vérifié par le serveur), **QR code** (adresse https
  **testée avant l'envoi** : le serveur va chercher l'adresse, jamais une adresse interne — `lib/safe-url.ts` — et la
  retestera à l'envoi), réception (livraison ou retrait), reçu au plus tard le.
- **Le BAT** : l'imprimeur envoie une **épreuve** (liens https) ; le restaurateur coche chaque point (textes et prix, visuel,
  QR code s'il y en a un, quantité et format) et **signe de son nom**, ou demande des **corrections** (deux tours, chacun en un
  seul envoi : trois épreuves au plus). **Une fois signé** : plus d'annulation, plus de correction, le **solde est dû**
  (réglé à la main avant Stripe, la plateforme est alertée), et une erreur visible sur le BAT n'est **pas réimprimée
  gratuitement**. L'imprimeur n'imprime ni ne livre qu'après la signature.
- **Livraison** : un objet, pas des fichiers — un mot qui dit où et quand (« livré au restaurant le 3 », « prêt au
  retrait »), un lien de suivi facultatif ; le restaurateur **confirme la réception** (automatique au bout de 7 jours). Pas de
  tours de retouche après l'impression : les corrections se font sur l'épreuve.
- **Annulation** : comme le graphiste (§5 bis) jusqu'à la signature du BAT, après laquelle plus personne n'annule (seule la
  plateforme arrête).
- **Règles du jeu d'impression** : leur propre texte et leur propre version, avec la règle « Le bon à tirer fait foi ».

### 5 quater. La messagerie (amendé le 2026-10-20, PR Q)

Restaurateur et prestataire s'écrivent **dans la mission** (`lib/mission-messages.ts`), de l'envoi du brief à la livraison
validée ; une mission annulée ou versée se lit, elle ne s'écrit plus. Tout est **gardé** : c'est une pièce du litige, que la
plateforme lit avec le **texte d'origine**.

- **Contacts masqués jusqu'au début du travail** (décision du porteur) : numéros de téléphone (écritures belges et
  internationales), adresses e-mail (y compris « nom (at) site (dot) be ») et liens de messagerie (WhatsApp, Telegram,
  Messenger, Signal) sont remplacés par « [numéro masqué] »… tant que la mission n'est pas en production. Prix, dates, heures et
  quantités restent lisibles ; un lien ordinaire (exemple, épreuve) aussi. Le **contact sur place** du jour J reste affiché dans
  la mission, comme avant. Chaque masquage laisse une ligne dans la trace (`message_masked`, nombre de e-mails / numéros /
  liens) : c'est la mesure de ceux qui tentent de sortir de la plateforme. Le masquage est une **dissuasion**, pas un blocage :
  on ne détecte pas un numéro écrit en toutes lettres.
- **Prévenir l'autre** : un e-mail **sans le contenu**, seulement si le message n'a pas été lu et **au plus un toutes les 30
  minutes** ; un compteur « n messages » dans les listes. Pas de temps réel : le fil se recharge à l'envoi.
- **Limite** : 30 messages par heure et par personne et par mission, 1 500 caractères au plus.

### 5 quinquies. Les rappels d'atelier (amendé le 2026-10-21, PR R)

Un métier d'atelier n'a pas de J-7 ni de J-2 ; le cron quotidien réveille pourtant ce qui dort, **sans jamais décider à la place de
personne** (aucun rappel ne signe, n'annule, ne valide ni ne sanctionne) :

| Situation | Qui est prévenu | Quand |
|---|---|---|
| Devis accepté, travail non commencé | le prestataire | de J-6 à J-3 du jour souhaité |
| idem | la **plateforme** | dès J-2 |
| En cours, rien livré | le prestataire | J-2 à J |
| Jour souhaité passé sans livraison | le prestataire **et** la plateforme | J+1 |
| Épreuve (BAT) sans réponse | le restaurateur | 2 jours, puis encore à 5 jours |
| Corrections sans nouvelle épreuve | le prestataire | 2 jours |

Chaque rappel part **une seule fois** (clé primaire de `mission_reminders`, réservée avant l'envoi). Le jour souhaité n'est
**pas un engagement** du prestataire : son délai de devis fait foi, et le rappel de retard le dit.

### 5 sexies. Les revenus et le profil du prestataire (amendé le 2026-10-21, PR S)

**Revenus** (`/prestataire/revenus`) : ce que le prestataire **reçoit**, jamais le prix du devis comme gain. Quatre cases, additionnées
en centimes sur les montants **figés** de la mission (aucune commission recalculée à l'écran) : *à venir* (acceptée, pas encore
validée), *en attente d'une décision* (litige, ou part d'une annulation non réglée), *à verser* (validée, virement manuel à venir),
*versé* (ce mois-ci à l'heure de Bruxelles, et au total). Pas d'IBAN ni de Stripe avant l'approbation des associés ; l'écran dit que
Boosteats verse à la main pendant le pilote.

**Profil** (`/prestataire/profil`, colonne `providers.profile`) : ce que le restaurateur lit avant de confier un brief — ce qu'il fait,
**ce qu'il ne fait pas** (drone, voix off : dit d'avance, il évite le malentendu), matériel, zone, langues FR/NL/EN, jusqu'à huit
exemples de travaux (liens https). Même règle que la messagerie : **aucun numéro, e-mail ni lien de messagerie** dans le profil, lu
par tous les restaurateurs ; l'enregistrement est tout ou rien, chaque refus dit le champ. Le restaurateur le voit sur la page de sa
mission (« À propos du prestataire ») ; le prestataire peut le prévisualiser tel quel (« Voir comme un restaurateur »). Un profil vide
n'affiche aucune carte.
### 5 septies. Le bon à tirer dans le dossier de litige (amendé le 2026-10-21, PR T)

Pour une impression, le dossier de la plateforme montre le bon à tirer **tel que l'arbitre doit le lire** : chaque épreuve (tour,
date d'envoi, liens, message de l'imprimeur, corrections demandées une à une) et, si elle est signée, **qui a signé, quand, et chaque
point de la liste de contrôle coché ou non** (un point non coché est en rouge). Une phrase de tête dit où en est le dossier (aucune
épreuve · en attente · corrections · signée). Lecture seule : le dossier n'ajoute aucune règle, la décision reste à l'arbitre ; une
épreuve signée garde le sens de §5 ter (c'est ce qui devait être imprimé).

### 5 octies. La photo (amendé le 2026-10-21, PR U)

Le photographe suit **exactement le parcours du vidéaste** (métier de tournage : une date lie les deux parties, idées de séance, compte-rendu
du jour J, barème d'annulation en heures, règles du tournage), avec **ses propres questions** : pour quoi faire, ce qu'on photographie,
combien d'images retouchées, plats, personnes sur les photos, style. Les questions de la phase « tournage » ont les **mêmes clés** que
celles de la vidéo : toute la mécanique du jour J les réutilise telle quelle. Catégories de retours propres à la photo (cadrage, lumière,
couleurs, retouche, sélection, texte, autre) : ni son, ni rythme, ni musique. Les tuiles **Photo** et **Impression** de la page
« Prestataires » du restaurateur s'ouvrent (l'impression restait affichée « Bientôt » alors qu'elle était construite).

### 5 nonies. Les budgets planchers pour les quatre métiers (amendé le 2026-10-21, PR V)

La page « Réglages » de la plateforme règle maintenant le **plancher de budget** de chaque métier (vidéo, photo, design, impression), plus
seulement celui de la vidéo. Sous le plancher, le brief est refusé avec un message clair, dit AVANT le clic. Le seuil d'**ambition
réaliste** (un avertissement, jamais un refus) reste propre au métier qui a une question « format » (la vidéo) : les autres n'en ont pas.
Un métier sans modèle de questions ne peut pas être enregistré. Le premier enregistrement d'un métier fige son questionnaire du code en
base (comme pour la vidéo) : pour changer ensuite une question, il faut passer par la base.

### 5 decies. Les avis (amendé le 2026-10-21, PR W)

Une fois la mission **validée ou versée**, chaque côté peut donner **un avis, définitif** (un par mission et par sens ; la base refuse le
doublon) :

| Sens | Contenu | Qui le lit |
|---|---|---|
| Restaurateur → prestataire | note de 1 à 5, commentaire facultatif (obligatoire en une phrase pour 1 ou 2) | **public** aux restaurateurs, sans nom de restaurant : la moyenne à partir de **3 avis**, les 3 derniers commentaires |
| Prestataire → restaurateur | note de 1 à 5, commentaire | **privé** : la plateforme seule (dossier de litige, page « Avis ») |

Le commentaire n'accepte ni numéro, ni e-mail, ni lien de messagerie (même règle que la messagerie et le profil). La plateforme peut
**masquer** un avis (il sort de la moyenne et des commentaires affichés, reste lisible pour elle, avec qui l'a masqué). Pas de réponse du
prestataire à un avis, pas de modification : on ne réécrit pas après un désaccord. Un litige ouvert ferme l'avis jusqu'à la décision.

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
