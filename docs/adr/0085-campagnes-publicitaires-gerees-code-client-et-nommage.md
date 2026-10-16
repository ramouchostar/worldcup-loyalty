# ADR 0085 — Campagnes publicitaires gérées : un compte Boosteats, un code client, un nommage lu par le système

**Statut** : Proposé (2026-10-16). Décidé par le porteur en session pendant la création de
l'application Meta et du System User (2026-10-16), **à valider par l'associé**. C'est l'« ADR
pub » annoncé par l'[ADR 0081](0081-le-jeu-de-la-croissance.md) §6 et les conséquences de
l'ADR 0081 : il précise ce qui se passe **après** une demande de service `pub`. Il s'appuie sur
les pages légales BE Campaign Hub (`docs/legal/campaign-hub-*.md`, fusionnées le 2026-10-14)
et ne les contredit pas. Il précise l'[ADR 0033](0033-console-plateforme-demo-chiffres-backlog.md)
(une colonne de plus sur `restaurants`, les comptes démo n'en ont pas). Il n'amende **ni
l'ADR 0007 ni l'ADR 0028** : tout ce qui suit est console restaurateur et plateforme, le membre
n'en voit rien. Appliqué avec le bouclier de l'[ADR 0065](0065-le-bouclier-scene-trace-echos.md).

## Contexte

L'ADR 0074 vend la **publicité payante gérée** en option, et l'ADR 0081 §6 fixe les frais de
service selon le forfait (`AD_FEE_PCT` : Gratuit 20 %, Croissance 15 %, Pro 5 % du budget). Une
demande « Je veux une pub » crée aujourd'hui une ligne `service_requests` ; ensuite, rien n'est
outillé : la campagne se monte à la main dans le Gestionnaire de publicités et ses résultats ne
reviennent pas dans Boosteats.

Le 2026-10-16, le porteur a fixé le modèle d'exploitation :

- **un seul compte publicitaire Meta**, possédé par le portefeuille business Boosteats, pour
  tous les clients — pas un compte par client, pas de compte partagé par le client ;
- les clients **paient le budget à l'avance** ; Boosteats alimente ensuite le compte en fonds ;
- les résultats sont **enregistrés dans Supabase** pour être montrés au client vite et
  simplement, dans un tableau de bord à lui.

Avec un seul compte pour tous, la question devient : **à quel client appartient chaque
campagne ?** Meta ne le sait pas. Il faut que le nom de la campagne le dise, et que le système
le lise sans se tromper.

Conséquence côté Meta, vérifiée en session : comme le compte appartient au portefeuille
business de l'application, l'**accès standard** à la Marketing API suffit. L'accès avancé
(App Review, vérification de l'entreprise, historique d'appels) ne devient nécessaire que si
l'on gère un jour des comptes possédés par les clients — voie prévue par la politique de
confidentialité BE Campaign Hub §2, pas ouverte par cet ADR.

## Décision

### 1. Un code client par établissement réel : `BE001`, `BE002`…

- Colonne `restaurants.client_code`, **unique**, de forme `^[A-Z]{2}[0-9]{3}$`. Le préfixe est
  le pays (`BE` aujourd'hui ; `FR001` le jour où l'on s'étend, numérotation propre au pays).
- **Attribué dans l'ordre d'entrée dans Boosteats** : la date d'entrée est `activated_at`
  (ADR 0033), à défaut `created_at` — Houba et De Bue sont actifs sans `activated_at`.
- **Attribué une seule fois, au moment où l'établissement devient un vrai client** : `status =
  'active'` **et** `is_demo = false`. Un établissement `pending` n'en a pas encore ; un compte
  démo n'en a **jamais** ; un compte démo qui devient réel reçoit le numéro suivant à ce
  moment-là.
- **Jamais réutilisé, jamais réattribué** : un client qui part ou qui est désactivé garde son
  code ; le suivant prend le numéro d'après. Sinon les résultats d'une ancienne campagne
  `BE003` iraient au mauvais client.
- Attribution **en base** (déclencheur sur `restaurants`), comme le plafond des sièges
  (ADR 0041) : jamais une vérification applicative qu'une route oublierait.
- Un code par **établissement**, pas par restaurateur : la campagne, la page Facebook qui
  signe la publicité, le budget et les résultats sont ceux d'un lieu. Un restaurateur à deux
  établissements a deux codes.

État vérifié en lecture seule le 2026-10-16 (dates d'entrée et premiers tickets concordent) :

| Code | Établissement | Entrée |
|---|---|---|
| BE001 | Belchicken Kraainem (`kraainem`) | activé le 2026-07-01 |
| BE002 | Belchicken Houba (`houba`) | créé le 2026-08-18 23:46:09 |
| BE003 | Belchicken De Bue (`de-bue`) | créé le 2026-08-18 23:46:11 |

Les trois établissements `pending` (deux Krusty Smash Burgers, Chaussée d'Ixelles) recevront
le numéro suivant à leur validation, dans l'ordre où elle se fait.

### 2. La convention de nommage des campagnes

Au niveau **campagne** (pas ensemble de publicités, pas publicité) :

```
<code client> | <établissement> | <objectif> | <AAAAMM> | <libellé libre>
BE001 | kraainem | TRAFIC | 202610 | lancement points
BE002 | houba | UBEREATS | 202611 | match belgique
```

- **code client** : la clé de rattachement (§ 3).
- **établissement** : l'identifiant exact en base (`restaurants.id`). Il ne rattache pas, il
  **contrôle** : un code et un identifiant qui ne vont pas ensemble bloquent le rattachement.
- **objectif** : une liste fermée, en majuscules, sans accent :

  | Code | Ce que la campagne pousse |
  |---|---|
  | `TRAFIC` | les visites au restaurant |
  | `NOTORIETE` | la connaissance du lieu dans la zone |
  | `MESSAGES` | les conversations WhatsApp / Messenger |
  | `INSCRIPTION` | les adhésions au programme de fidélité |
  | `UBEREATS` | la vitrine de l'établissement sur Uber Eats |
  | `DELIVEROO` | la vitrine sur Deliveroo |
  | `TAKEAWAY` | la vitrine sur Takeaway.com |

  La liste **s'allonge** (« rien n'est exclu », porteur, 2026-10-16) : ajouter un objectif =
  une ligne dans le module qui tient la liste, et une ligne de `CONTEXT.md`. Une campagne dont
  l'objectif n'est pas dans la liste **reste rattachée** à son client (c'est le code qui
  compte) mais est signalée « objectif inconnu » sur `/platform`.
- **AAAAMM** : le mois de lancement.
- **libellé libre** : pour l'humain, jamais lu par le système.
- Séparateur ` | ` (barre verticale entourée d'espaces) : absent de tout `restaurants.id`, il
  coupe sans ambiguïté. La lecture tolère les espaces en trop et la casse du code client.

La convention vaut pour toute régie (TikTok, Google le jour venu) : elle ne dépend pas de Meta.

### 3. Le nom détecte, l'identifiant rattache

1. À la **première** lecture d'une campagne, on lit son nom : code client connu **et**
   établissement cohérent → la campagne est rattachée, le lien `identifiant de campagne Meta →
   établissement` est enregistré.
2. Ensuite, c'est **ce lien** qui fait foi. Renommer la campagne ou corriger une faute plus
   tard ne déplace pas ses résultats.
3. **Aucune campagne ignorée en silence.** Nom illisible, code inconnu, code et établissement
   incohérents : la campagne va dans une liste **« campagnes non rattachées »** sur
   `/platform`, avec sa dépense, et un super-admin la rattache à la main (rattachement tracé
   comme manuel). Une campagne qui dépense sans client est de l'argent que personne ne
   refacturera : c'est l'alerte la plus importante de ce chantier.

### 4. Les résultats arrivent dans Supabase une fois par jour

- **Un seul jeton** : celui du **System User** du portefeuille business Boosteats, rangé dans
  une variable d'environnement serveur (Vercel, sensible). Jamais dans le dépôt, jamais un
  jeton personnel (il expire et tombe au changement de mot de passe). Identifiant du compte
  publicitaire en configuration aussi.
- Une **tâche planifiée** lit les statistiques par campagne et par jour (dépense, impressions,
  portée, clics, résultat de l'objectif) et les **réécrit sur les derniers jours** : Meta
  corrige les chiffres récents pendant plusieurs jours. Statistiques **agrégées uniquement**,
  comme le promet la politique de confidentialité BE Campaign Hub §3.
- **V1 en lecture seule** : les campagnes se créent et se modifient dans le Gestionnaire de
  publicités. Créer ou modifier une campagne depuis Boosteats (et les limites d'action
  convenues avec le client, conditions BE Campaign Hub §4) est une décision à part.

### 5. Le budget prépayé : un registre, jamais un solde stocké

- **Registre des versements** par établissement (versement, correction), sur le modèle de
  `point_transactions` (ADR 0061) : jamais de colonne solde.
- **Restant = versements − dépense lue chez Meta** des campagnes rattachées. La dépense ne se
  recopie pas dans le registre : elle vient des statistiques du § 4, une seule source.
- Le registre ne porte que le **budget de diffusion**. Les frais de service (`AD_FEE_PCT`) se
  facturent à part : ils ne réduisent pas le budget que le client voit fondre.
- **Le compte est commun, les fonds aussi.** Rien chez Meta n'empêche les campagnes d'un client
  de dépenser au-delà de ce qu'il a versé, avec l'argent des autres. Deux garde-fous :
  - chaque campagne porte un **plafond de dépense** (`spend_cap`) égal au restant du client
    au moment de son lancement — geste manuel en V1, vérifié par la tâche planifiée qui
    signale toute campagne active **sans plafond** ;
  - alerte sur `/platform` quand le restant d'un client passe sous **3 jours** de sa dépense
    moyenne, et quand il devient **négatif**.

### 6. Ce que voit le restaurateur

Une page de la console de son établissement (primitives `components/admin/ui/`, ADR 0054 ;
présente dans « Plus » en vue simple, ADR 0064) : ses campagnes, le résultat de chacune selon
son objectif, la dépense et le budget restant. Les euros y sont permis : c'est sa dépense, en
console (ADR 0007 ne protège que le membre). Il ne voit **jamais** les campagnes d'un autre
client ni le solde global du compte. L'écran est montré en maquette et validé avant d'être
construit (ADR 0065).

## Conséquences

- **Migration horodatée** (`docs/migrations/`) : `restaurants.client_code` et son déclencheur
  d'attribution, l'attribution des trois codes existants (§ 1), les tables des campagnes
  rattachées, des statistiques par jour et du registre des versements. RLS sans policy
  (service-role) comme `service_requests` ; le code reste tolérant à son absence (fail-open :
  pas de page, pas de tâche, rien ne casse ailleurs).
- **`/platform`** : le code client sur l'onglet Réseau (on l'a sous les yeux en nommant une
  campagne), les campagnes non rattachées, les alertes budget et plafond.
- **Lecture du nom** : fonction pure et testée (cas : nom correct, espaces, minuscules, code
  inconnu, incohérence code/établissement, objectif inconnu, séparateur absent).
- **Trace** (ADR 0065) :
  - par exécution de la tâche planifiée : campagnes lues, rattachées, non rattachées, en
    erreur, avec la cause ; un appel Meta en échec est journalisé, jamais avalé ;
  - **dépense non rattachée** (en euros, sur 7 jours) : doit rester à 0. Si elle ne l'est pas
    deux semaines de suite, la convention est mal comprise ou mal appliquée — on la simplifie
    ou on outille la création des campagnes ;
  - campagnes actives sans plafond de dépense ; clients en restant négatif.
- **Échos à suivre dans les PR d'implémentation** :
  - la mission « Une pub dans ta zone » (ADR 0081 §6) et `service_requests` : la demande
    traitée peut renvoyer vers la campagne créée ;
  - les pages légales BE Campaign Hub et le registre des traitements (T9) : rien à changer pour
    la V1 en lecture ; à relire quand l'écriture via l'API arrivera ;
  - la facturation (TVA de l'espace publicitaire revendu) : à valider avec le comptable ;
  - `listLiveRestaurants()` et les chiffres réseau : le code client ne change aucune
    visibilité, il suit `is_demo` ;
  - `CONTEXT.md` (code client, campagne publicitaire, objectif de campagne, campagne non
    rattachée).
- **Côté Meta, préalables hors code** : application de type Business en mode Live, System User
  admin avec le compte publicitaire et l'application assignés, et **la page Facebook de chaque
  client partagée en partenaire** au portefeuille business Boosteats (une publicité est signée
  par la page du restaurant, pas par Boosteats).

## Alternatives rejetées

- **Un compte publicitaire par client** : rattachement trivial, mais un compte à créer, à
  alimenter et à surveiller par client, et un moyen de paiement par compte. Écarté par le
  porteur. Reste possible : le code client suffit aussi à rattacher un compte entier.
- **Rattacher par le seul nom, à chaque lecture** : un renommage ou une faute déplace
  l'historique d'un client vers un autre, sans bruit.
- **Rattacher par l'identifiant d'établissement (`kraainem`)** : un identifiant peut changer,
  il est long à taper et proche d'un autre (`krusty-smash-burgers-anderlecht` /
  `…-koekelberg`). Le code est court, stable et contrôlé par l'identifiant.
- **Numéroter les comptes démo** : des numéros brûlés pour des établissements fictifs, des trous
  dans la suite et un risque de campagne réelle rattachée à un faux client.
- **Stocker un solde de budget** : dérive dès la première correction de Meta ; recalculé depuis
  le registre et les statistiques, il se vérifie.
- **L'accès avancé à la Marketing API dès maintenant** : inutile pour un compte possédé, et
  impossible à obtenir sans historique d'appels.
