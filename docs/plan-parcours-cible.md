# Plan — parcours cible « le ticket avant tout »

**Phase B du chantier d'activation.** Fait suite à [`audit-parcours.md`](audit-parcours.md).
**Statut : arbitrages du §2 et de l'étape 3 tranchés par le porteur le 2026-09-04.**
**Lots 1 et 2 implémentés ; lots 3 à 8 en attente de validation du plan.**

---

## 1. Le principe directeur, réécrit

> **Un client qui scanne le QR doit photographier un ticket. Tout le reste —
> équipes, actions sociales, réserve, classement — est une conséquence.**

Cela ne dit pas « cacher le reste » : l'ADR 0030 §4 pose que l'on ne cache jamais une
fonctionnalité, on montre ce qui manque pour l'utiliser. Ça dit **hiérarchiser** :
une seule action primaire par écran, et cette action est toujours le ticket tant
qu'aucun ticket n'a été validé. C'est une règle de **rang**, pas de visibilité — ce
qui permet de l'appliquer sans amender l'ADR 0030.

### Le déclencheur affectif, dans l'ordre

Le parcours s'articule autour d'une seule chose : **le cadeau**. Il est gagné avant
qu'on demande quoi que ce soit, puis c'est lui qui paie chaque demande suivante.

```
photo du ticket ──► « tu as gagné X »  ──► « pour le réclamer, installe l'app »
                    (ou « il te manque      ──► « pour le garder, ton e-mail »
                     un rien pour X »)      ──► « pour savoir quand il t'attend, les notifs »
                                            ──► équipes / actions sociales
```

Chaque demande est **payée par le cadeau déjà gagné**, jamais par une promesse.

---

## 2. ⚠️ Le point qui casse cet ordre — à trancher avant d'écrire une ligne

Tu demandes : **gain → installation de l'app → e-mail → notifications**.

**Sur iOS, cet ordre perd le ticket.** Ajouter un site à l'écran d'accueil crée un
**conteneur de stockage séparé** de Safari : ni les cookies, ni l'IndexedDB de Safari
ne suivent. Or c'est exactement là que vit la photo du ticket
(`lib/pending-ticket.ts`) et la chaîne de reprise (`pending_restaurant_id`,
`pending_ticket`). Le client installerait l'app, l'ouvrirait… et trouverait un écran
vierge, sans ticket, sans cadeau. Le pire moment possible pour perdre quelqu'un.

Il n'existe aucun contournement propre : depuis Safari, aucun lien ne peut ouvrir
l'app installée en lui passant un jeton ; l'app installée démarre toujours sur
`start_url`. Sur **Android** le problème ne se pose pas (stockage partagé avec Chrome,
et `beforeinstallprompt` permet une installation sans quitter la page).

*Cette limite iOS est une contrainte connue de la plateforme, mais elle n'a pas pu
être vérifiée sur un appareil réel dans cette session (§9).*

### Les trois options

| | Ordre | Avantages | Inconvénients |
|---|---|---|---|
| **A — recommandée** | gain → **e-mail** → **app** → notifs | Fonctionne à l'identique sur iOS et Android. Le ticket est **sauvé côté serveur** dès le compte créé : plus rien à perdre ensuite. L'argument reste le tien : le compte n'est plus « garde tes points » mais « **réclame ton cadeau** ». L'app se propose juste après, avec un argument concret (« ton cadeau t'attend à ta prochaine visite »). Aucune divergence de code par plateforme | Ce n'est pas l'ordre que tu as demandé. L'installation arrive un cran plus tard, donc probablement un peu moins souvent |
| **B — ton ordre, tel quel** | gain → **app** → e-mail → notifs | Exactement l'intention : l'app est la porte du cadeau, donc elle se mérite en premier | **Casse iOS** — ticket et session perdus à l'ouverture de l'app installée. Sur ~50 % du parc belge en restauration, le parcours s'arrête là. Rédhibitoire en l'état |
| **C — deux parcours** | Android : ton ordre · iOS : ordre A | Prend le meilleur des deux | Deux tunnels à écrire, à mesurer et à maintenir ; la détection de plateforme repose sur l'UA (contournable, imprécis) ; double surface de bugs pour un gain marginal sur un seul OS |

**Ma recommandation : A.** Elle garde 100 % de ton intention produit — le cadeau
gagné d'abord, chaque demande justifiée par lui, l'app présentée comme la clé du
cadeau — et déplace seulement l'installation d'un cran, là où elle ne détruit rien.
Concrètement, entre le compte et l'app il n'y a **aucun écran supplémentaire** : les
deux s'enchaînent sur le même écran de résultat.

> ### ✅ Tranché le 2026-09-04 — **option A**
>
> Le porteur retient l'ordre **gain → compte (« réclame ton cadeau ») → app
> (« pour le récupérer ») → notifications**. L'intention est intégralement
> conservée : le cadeau est gagné avant qu'on demande quoi que ce soit, et
> c'est lui qui paie chaque demande. Seule l'installation glisse d'un cran,
> sur le même écran, pour ne pas perdre le ticket sur iOS.

---

## 3. Le parcours cible, écran par écran

### Étape 0 — Arrivée par le QR · `/r/[restaurantId]`

| | |
|---|---|
| **Action unique** | **« Photographier mon ticket »** |
| **Icône** | `lucide-react/ReceiptText` (ticket papier). **Jamais** `Scan` |
| **Promesse** | « Ton ticket d'aujourd'hui vaut déjà un cadeau. » |
| **Sortie secondaire** | « Je n'ai pas de ticket » (discret, sous le CTA) |
| **Conservé** | La carte « Ce que ce ticket peut débloquer » (ADR 0043) — elle *est* la preuve de la promesse |
| **Retiré** | Le CTA final rouge « Pas encore de ticket ? / S'inscrire directement » — c'est une seconde action primaire qui concurrence le ticket |

**Changement structurel proposé : le CTA ouvre directement l'appareil photo.**
Aujourd'hui il navigue vers `/r/[id]/submit-order` où il faut retaper un second bouton
— deux taps et un chargement de page pour un seul geste. Le CTA devient un composant
client portant l'`<input type="file" capture="environment">` ; à la sélection, la photo
part en IndexedDB et la navigation vers l'écran de résultat se fait **avec la photo
déjà prise**.

- **Gain** : −1 tap, −1 chargement de page, et la caméra s'ouvre « en un tap » comme
  demandé.
- **Risque** : un client qui tape par curiosité se retrouve dans son appareil photo.
  Mitigé par le libellé explicite (« Photographier… ») et l'icône ticket.
- **Repli** : si l'`<input>` est indisponible (navigateur intégré Instagram/Facebook),
  on retombe sur la navigation actuelle. Détection : absence de `capture` supportée.

### Étape 1 — Capture

- `<input type="file" accept="image/*" capture="environment">` — **inchangé**, c'est
  déjà le bon choix (pas de `getUserMedia` : aucune permission persistante, qualité
  native, zéro code de visée à maintenir).
- **Guide visuel avant capture** : le pictogramme SVG actuel est remplacé par la
  **photo d'un vrai ticket Belchicken**, zone « total + Bestelnummer » encadrée.
  ➜ *J'ai besoin de toi* : une photo de ticket Kraainem à déposer dans le préfixe
  `echantillons/` du bucket `receipts` (ADR 0036 §3 prévoit exactement cet usage et
  l'exclut de la purge). Tant qu'elle n'existe pas, le SVG actuel reste.
- **Détection du QR code** — deux niveaux :
  1. **Client** : `BarcodeDetector` (Chrome Android). Détection avant même l'envoi,
     réponse instantanée, zéro coût. **Absent de Safari iOS.**
  2. **Serveur, pour tout le monde** : un champ `looks_like_qr_or_poster` ajouté au
     prompt Vision **existant** — même appel, même coût, aucune latence
     supplémentaire. C'est ce qui couvre iOS.

  Message (le tien, mot pour mot) :
  > **Ce n'est pas un ticket de caisse.**
  > Cherche le ticket papier remis au comptoir ou à la borne.
  > [ Réessayer ]

  ➜ Corrige au passage la faille M3 de l'audit : l'affiche QR de Kraainem porte le nom
  du resto, donc `has_restaurant_header` est vrai et le filtre actuel la laisse passer.

### Étape 2 — Résultat · **l'écran de conversion**

C'est l'écran qui change le plus. Aujourd'hui un visiteur voit seulement
« ✅ Scan réussi · 36,10 € ». Il doit voir **ce qu'il a gagné**.

`POST /api/orders/parse-receipt` (déjà ouvert aux visiteurs, ADR 0045) renvoie en plus,
calculé depuis le catalogue réel de l'établissement (`loadRewardGrid` +
`resolveSoloReward` + `nextSoloTier`, déjà écrits) :

```jsonc
{ "reward": "Finest Burger",              // article de la couche 1 atteint, ou null
  "next_tier": { "item": "Menu 4 Tenders", "pct": 62 } }   // ou null si palier max
```

**Noms d'articles uniquement — jamais un seuil, jamais un euro** (ADR 0007/0028).

Deux états, comme tu les décris :

| Montant lu | Ce que l'écran dit |
|---|---|
| **Palier atteint** (≥ 25 € sur la grille Kraainem) | « **+36 points** » en très gros · « 🎁 **Ton cadeau : Finest Burger** » · « à récupérer au comptoir » · barre vers le palier suivant |
| **Sous le premier palier** (ex. 10 €) | « **+10 points** » en très gros · « 🎁 **Plus que quelques euros et c'est une portion de frites** » · barre de progression à 66 % |

Dans les deux cas le client **a gagné quelque chose de nommé** : soit un cadeau, soit
une distance visible et courte vers un cadeau. Jamais un écran qui dit seulement
« c'est enregistré ».

**Ticket non reconnu** → conseils de prise de vue (lumière, ticket à plat, cadrer la
zone total + numéro de près) + « Réessayer ». Le message actuel est déjà bon, il gagne
juste les trois conseils.

> **⚠️ Deux tensions à acter.**
>
> 1. **ADR 0008** interdit de promettre un cadeau comme acquis (« ne jamais révéler le
>    mécanisme, la validation est différée »). Le mot « gagné » à cet instant est donc
>    à manier : la formulation retenue est « **Ton cadeau : X · à récupérer au
>    comptoir** » — affirmative et concrète, sans dire « validé » ni « instantané ».
> 2. **ADR 0028** bannit tout euro côté client sauf la *saisie* du montant. Afficher
>    « 36,10 € » est un *affichage*. L'ADR 0045 l'a livré quand même, comme preuve de
>    lecture. Proposition : le garder mais le **rétrograder** — les **points** en gros,
>    le montant en petit, présenté comme une valeur **à vérifier et corrigeable**
>    (« Lu sur ton ticket : 36,10 € · Modifier »), ce qui le rend bien de l'ingestion.
>    À acter dans l'ADR (§7).

### Étape 3 — Compte · « Réclame ton cadeau »

- Titre : **« Réclame ton cadeau »** — plus « garde tes points ».
- Sous-titre : « Ton {nom du cadeau} t'attend au comptoir. Un compte, et il est à toi. »
- **[ Continuer avec Google ]** (primaire, un tap) · **[ Continuer avec un e-mail ]**
  (secondaire) · « J'ai déjà un compte » (lien).
- Le ticket de l'étape 2 est rattaché au compte créé — **mécanique existante
  inchangée** (IndexedDB + cookies `pending_*` + `?resume=1`).

**Trois corrections nécessaires ici :**

1. **La reprise doit survivre à la fermeture de l'app.** Aujourd'hui
   `loadPendingTicket()` n'est lu que sous `?resume=1` : rouvrir l'app ne repropose
   jamais la photo qui dort en IndexedDB (friction M1). ➜ Vérifier IndexedDB au
   montage de la vitrine **et** de l'écran de scan, et afficher un bandeau
   « **Ton ticket t'attend — envoie-le** ».
2. **Allonger la conservation locale de 30 min à 24 h** (`MAX_AGE_MS`, et le `maxAge`
   des cookies). 30 minutes, c'est le temps d'un repas — beaucoup reviennent le soir.
3. **La branche e-mail perd tout** si le lien de confirmation s'ouvre dans un autre
   navigateur (friction M2). ➜ Deux voies possibles, à trancher :
   - désactiver la confirmation par e-mail sur ce parcours (réglage Supabase, hors
     code) — le compte est actif tout de suite, l'e-mail est vérifié plus tard ;
   - ou garder la confirmation et afficher un écran d'attente explicite
     (« reviens dans **cet** onglet ») + un message de récupération à l'atterrissage.
   ➜ **Tranché le 2026-09-04 : on désactive la confirmation par e-mail.** Le
   parcours ne sort plus jamais de l'application. Contrepartie assumée : des
   adresses non vérifiées entrent en base, donc des relances qui rebondiront —
   à surveiller sur les taux de délivrabilité Resend.
   ➜ *Action hors code, de ton côté* : Supabase → Authentication → Providers →
   Email → décocher « Confirm email ». Le code gère déjà les deux cas
   (`data.session` présent → on enchaîne directement).

### Étape 4 — Installation · « Pour récupérer ton cadeau »

Posée **immédiatement après la création du compte**, sur le même écran de résultat —
aucun écran supplémentaire.

- Raison affichée, la tienne : « **Pour récupérer ton cadeau à ta prochaine visite et
  être prévenu des offres.** »
- **Android** : bouton qui déclenche le prompt natif (`beforeinstallprompt`, déjà
  capté par `lib/pwa-install.ts`).
- **iOS** : **deux captures d'écran** (Partager ⬆️ → « Sur l'écran d'accueil »).
  ➜ *J'ai besoin de toi* : deux captures d'écran iOS réelles, ou je les remplace par
  des illustrations SVG légendées.
- « Plus tard » visible mais secondaire.
- **Une seule fois par visite** — et non plus « une fois par appareil, définitivement ».
  ➜ Corrige la friction M6 : aujourd'hui un tap sur le fond de la modale ferme la
  feuille **et** consomme définitivement `pwa_prompted`. La clé devient une clé de
  visite (`sessionStorage`), le drapeau définitif n'étant posé que sur un refus
  explicite.

### Étape 5 — Notifications

**Après** le compte et l'installation, jamais avant. C'est déjà l'ordre de la feuille
`PostTicketSheet` (installer / notifier) — on garde le composant, on le repositionne.

### Étape 6 — Accueil · `/r/[id]/dashboard`

Un seul état, une seule action primaire.

| Rang | Bloc | Condition |
|---|---|---|
| 1 | **Progression vers le prochain cadeau** + bouton **« Photographier mon ticket »** | toujours |
| 2 | Cadeau à récupérer au comptoir (48 h) | s'il y en a un |
| 3 | Carte gérant | owner uniquement |
| 4 | Installation de l'app | tant que non installée |
| 5 | Équipe · Actions sociales · Réserve · Classement — **en tuiles à état** | toujours visibles ; **avant le 1ᵉʳ ticket validé**, elles affichent leur condition (« Envoie un premier ticket pour débloquer ») au lieu de leur contenu |

> C'est la lecture stricte de l'ADR 0030 §4 appliquée à ta consigne : **on ne cache
> rien, on rétrograde**. Un client sans ticket voit que les équipes existent et ce
> qu'il faut pour y accéder — mais rien ne concurrence le bouton ticket.

**BottomNav** : le bouton rond central sans libellé devient un bouton **large et
libellé** « Photographier mon ticket ». Une icône seule ne dit pas ce qu'elle fait —
et c'est l'action n°1 de l'app.

---

## 4. Vocabulaire — le mot « scanner » est banni de l'action ticket

| Contexte | Avant | Après |
|---|---|---|
| Action ticket (client) | « Scanner mon ticket », « Scanne ton ticket » | **« Photographier mon ticket »** |
| Relance | « Scanner un autre ticket » | « **Photographier un autre ticket** » |
| Succès de repli | « Beau scan ! » | « **Ticket enregistré !** » |
| Preuve visiteur | « Scan réussi » | « **Ticket lu** » |
| Icône | `lucide/Scan` (cadre de visée) | `lucide/ReceiptText` (ticket papier) |
| **Affiches imprimées** | « Scanne le code » | **inchangé** — là, « scanner » désigne bien le QR, et c'est juste |
| **Console restaurateur** | « tickets scannés », « CA scanné » | **inchangé** — terme métier du glossaire (CONTEXT.md, *Scan*) |

**Une variante à considérer.** « Photographier » est long et un peu formel pour un
client de fast-food debout au comptoir. Deux alternatives testées à voix haute :

- **« Prends ton ticket en photo »** — le plus naturel à l'oral, mais long sur un
  bouton (23 caractères, passe tout juste sur un iPhone SE).
- **« 📸 Mon ticket »** — le plus court, mais le verbe disparaît et l'action devient
  ambiguë.

**Ma recommandation : « Photographier mon ticket »** partout, parce que le verbe
*photographier* est justement ce que le mot *scanner* a échoué à dire. Sa longueur est
un coût acceptable pour lever le malentendu qui nous coûte des tickets aujourd'hui.

**Tutoiement partout côté client** — cohérent avec l'existant (le vouvoiement est
réservé à la console restaurateur).

---

## 5. Mesure — un entonnoir qui existe vraiment

### Le problème

Les dix événements demandés seraient invisibles s'ils partaient dans GA4 : le Consent
Mode v2 refuse tout par défaut (ADR 0025) et l'écrasante majorité des arrivées n'y
remonte jamais. C'est le constat exact de l'ADR 0037.

### Ce que je propose

**Un compteur serveur, sur le modèle exact de `qr_landings`** (ADR 0037) : une table
`funnel_events (restaurant_id, day, step, reason, count)`, un `INSERT … ON CONFLICT`
par franchissement, best-effort et jamais bloquant.

| Étape demandée | Où elle est comptée |
|---|---|
| `qr_landing` | existe déjà (`qr_landings`) |
| `ticket_capture_opened` | ouverture de l'appareil photo (POST léger) |
| `ticket_submitted` | `POST /api/orders` |
| `ticket_validated` | `status = 'validated'` |
| `ticket_rejected` + `reason` | `qr_detected` · `unreadable` · `duplicate` · `header_rejected` |
| `signup_started` / `signup_completed` | départ vers l'auth / retour authentifié |
| `install_prompt_shown` / `install_completed` | affichage de la feuille / `AppInstallBeacon` |
| `home_viewed` | dashboard |

Plus : **rendre `receipt_scans.user_id` nullable** pour que le scan d'un visiteur
laisse enfin une trace (aujourd'hui `storeScan` est purement sauté — angle mort B3 de
l'audit). Pour un scan anonyme on garde **la lecture OCR uniquement, pas l'image** :
conserver la photo du ticket d'une personne non identifiée serait une donnée
personnelle sans base légale ni destinataire (ADR 0025 §7). Suffisant pour répondre à
« le scan a marché mais il est parti ».

**Vue** : un tableau à dix étages sur `/platform/scans`, par établissement et par jour,
avec les taux de passage entre étages.

> **⚠️ Je m'écarte sciemment de la cible sur un point.** Le brief demande « horodatage
> **et identifiant de session** ». Un identifiant de session — même en `sessionStorage`,
> même sans cookie — fait basculer la mesure dans le champ du consentement ePrivacy,
> c'est-à-dire exactement l'angle mort que l'ADR 0037 a choisi de sortir. Je propose
> donc des **compteurs par étape et par jour, sans identifiant** : on perd les
> parcours individuels, on garde les **taux de passage** — la seule chose dont on a
> besoin pour répondre à « où décroche-t-on ? ». Les parcours individuels restent
> disponibles pour la partie **authentifiée** (`receipt_scans`, `orders`), où la base
> légale existe.

---

## 6. Fichiers impactés

### À créer

| Fichier | Rôle |
|---|---|
| `docs/adr/00NN-parcours-ticket-first.md` | acte la hiérarchie « le ticket avant tout », le bannissement du mot « scanner », l'ordre gain → compte → app → notifs, l'affichage du gain avant le compte, et l'arbitrage euro de l'étape 2 |
| `docs/migrations/AAAAMMJJ-HHMM-funnel-events.sql` | table `funnel_events` + RPC `record_funnel_event` |
| `docs/migrations/AAAAMMJJ-HHMM-receipt-scans-anonymes.sql` | `receipt_scans.user_id` nullable |
| `lib/funnel.ts` | `recordFunnelStep()` best-effort + lecture de l'entonnoir |
| `lib/qr-image-detect.ts` | détection `BarcodeDetector` côté client + repli |
| `components/member/TicketCaptureButton.tsx` | bouton + `<input capture>` réutilisable (vitrine, dashboard, écran de scan) |
| `components/member/TicketGainCard.tsx` | l'écran de conversion (points + cadeau / distance au cadeau) |
| `app/api/funnel/route.ts` | POST des étapes non authentifiées |

### À modifier

| Fichier | Changement |
|---|---|
| `app/r/[restaurantId]/page.tsx` | CTA « Photographier mon ticket » + icône ticket + promesse + « Je n'ai pas de ticket » ; retrait du CTA final concurrent |
| `components/member/SubmitOrderClient.tsx` | H1, libellés, icônes ; carte de gain avant le compte ; reprise IndexedDB hors `?resume=1` ; message QR ; 3 conseils de prise de vue |
| `components/member/BottomNav.tsx` | bouton central large et libellé, icône ticket |
| `app/r/[restaurantId]/dashboard/page.tsx` | réordonnancement, tuiles à état, libellés |
| `components/member/PostTicketSheet.tsx` | déclenchement après compte ; « une fois par visite » ; captures iOS |
| `app/api/orders/parse-receipt/route.ts` | renvoie `reward` + `next_tier` ; `looks_like_qr_or_poster` ; `storeScan` anonyme |
| `app/api/orders/route.ts` | comptage entonnoir + motif de rejet |
| `lib/receipt-ocr.ts` | champ `looks_like_qr_or_poster` dans le prompt |
| `lib/pending-ticket.ts` | 30 min → 24 h |
| `app/r/[restaurantId]/submit-order/actions.ts` | `maxAge` des cookies aligné sur 24 h |
| `lib/analytics.ts` · `docs/tracking-plan.md` | nouveaux noms, retrait de `visitor_tour_*` (mort depuis l'ADR 0044) |
| `app/platform/scans/page.tsx` | tableau d'entonnoir à dix étages |
| `app/r/[restaurantId]/my-team/page.tsx`, `components/LeaderboardRealtime.tsx`, `lib/hero-copy.ts` | vocabulaire |

**Non touché** : calcul des points et des cadeaux (`lib/rewards.ts`, `lib/points-model.ts`,
`lib/reward-sizing.ts`, `lib/budget.ts`), affiches imprimées, console restaurateur.

---

## 7. Ordre de livraison proposé

Un commit par lot, chacun livrable seul et sans régression pour les inscrits actuels.

| Lot | Contenu | Effort |
|---|---|---|
| **1** ✅ | **Vocabulaire et icônes** — « scanner » → « photographier », `Scan` → `ReceiptText`. Zéro changement de logique, effet immédiat sur le malentendu | S |
| **2** ✅ | **Le gain avant le compte** — `parse-receipt` renvoie `reward`/`next_tier`, `TicketGainCard` | M |
| **3** | **Mesure** — `funnel_events`, scans anonymes, vue à dix étages. *À faire tôt : c'est ce qui permettra de juger les lots suivants* | M |
| **4** | **Anti-QR** — `looks_like_qr_or_poster` + `BarcodeDetector` + message dédié | M |
| **5** | **Reprise du ticket** — IndexedDB hors `?resume=1`, 24 h, bandeau de récupération | S |
| **6** | **Compte → app → notifs** — libellés « réclame ton cadeau », feuille repositionnée, une fois par visite | M |
| **7** | **Capture en un tap depuis la vitrine** + guide photo réel | M |
| **8** | **Dashboard rétrogradé** + BottomNav libellée | M |

---

## 8. Ce dont j'ai besoin de toi

1. ~~L'arbitrage du §2~~ — ✅ **option A**, tranché le 2026-09-04.
2. ~~La confirmation par e-mail~~ — ✅ **désactivée**, tranché le 2026-09-04.
   *Reste à faire de ton côté, dans la console Supabase (voir §3, étape 3).*
3. **Une photo d'un vrai ticket Belchicken Kraainem** pour le guide de cadrage.
4. **Deux captures d'écran iOS** du geste « Partager → Sur l'écran d'accueil », ou
   l'accord pour des illustrations.
5. **L'accord sur le mot** « Photographier mon ticket » (§4).

---

## 9. Ce qui n'a pas pu être vérifié

- **Aucun test sur appareil réel** (conteneur sans Safari iOS ni Chrome Android) : le
  cloisonnement du stockage iOS (§2), le comportement de `capture="environment"` et la
  disponibilité de `BarcodeDetector` sont déduits des spécifications, **pas observés**.
  À valider sur un iPhone et un Android avant le lot 4 et avant tout arbitrage
  définitif du §2.
- **Aucun accès à la base de production** : les volumes réels (arrivées, scans
  abandonnés) n'ont pas pu être recoupés.
