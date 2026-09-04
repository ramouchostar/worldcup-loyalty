# Audit du parcours d'activation — QR → premier ticket validé

**Date** : 2026-09-04 · **Périmètre** : lecture seule, aucune modification de code.
**Établissement de référence** : Belchicken Kraainem (`kraainem`) — seul resto réel
(ADR 0033 : tous les autres sont des comptes démo).

> Cet audit est le livrable de la **phase A**. Il constate, il ne corrige rien.
> Les propositions de correction sont listées en §10 et seront instruites en phase B.

---

## 0. Ce que le code contredit dans les hypothèses du brief

À signaler tout de suite, parce que ça change la lecture des chiffres :

1. **« Un tour guidé a été supprimé cette semaine ; une proposition de photographier
   le ticket a été ajoutée en fin d'inscription. »** Le code raconte autre chose.
   Le tour a bien été retiré ([ADR 0044](adr/0044-retrait-tour-de-bienvenue.md), PR
   fusionnée), mais il **n'existe aucune proposition de scan en fin d'inscription** :
   `/signup` et `/register` redirigent vers `resolvePostLoginDestination()` ou, si un
   ticket est en attente, vers `submit-order?resume=1`. Le CTA « photographie ton
   ticket » vit sur la **vitrine** (`/r/[id]`) et sur le **dashboard**, pas dans le
   tunnel d'inscription.
2. **« L'inscription n'est pas obligatoire d'entrée. »** Exact et déjà implémenté
   (ADR 0040/0045) : la photo, l'OCR et l'affichage du montant tournent **sans
   compte**. Le parcours cible décrit dans le brief (étapes 0 → 3) est donc, pour
   l'essentiel, **déjà construit** — le problème n'est pas son absence mais sa
   mesure et ses trois trous (§10).
3. **« Des clients ont photographié le QR code et l'ont soumis comme ticket. »**
   Depuis le correctif du 2026-09-02 (`receiptProven`, `parse-receipt/route.ts:110`),
   une photo sans en-tête resto **et** sans numéro de commande est refusée à
   l'aperçu. Mais l'affiche QR de Kraainem **porte le nom du restaurant** : une photo
   d'affiche renvoie `has_restaurant_header: true` → `receiptProven` vrai → le refus
   ne se déclenche pas. Le membre voit un formulaire avec un montant vide, le saisit
   à la main, et la commande part en **file admin** (`no_order_key`). Le trou est
   réel, il est simplement en aval de là où on le cherchait.
4. **« Le taux d'installation n'est pas mesuré. »** Faux depuis le 2026-08-22 : la
   table `member_app_installs` + `AppInstallBeacon` mesurent l'ouverture en mode
   installé, colonne « App » sur `/platform/members` et tuile sur `/platform/stats`
   (ADR 0038 complété). Ce qui n'est **pas** mesuré, c'est le taux d'installation
   *rapporté aux visiteurs* — la balise n'existe que pour un membre connecté.
5. **« Un même ticket soumis deux fois est compté comme deux commandes. »** Confirmé
   par le code (§9) : `duplicate_key` est l'unique verrou, il ne repose que sur le
   numéro de commande lu par l'OCR, et un chiffre mal lu produit une clé différente.

---

## 1. La stack, en dix lignes

| Couche | Choix |
|---|---|
| Framework | **Next.js 14 App Router**, TypeScript strict, rendu serveur par défaut (aucun `force-dynamic` sur les pages membres — elles sont dynamiques de fait via cookies/`auth.getUser()`) |
| Routage | Fichiers `app/**` ; espaces `/(public)`, `/(auth)`, `/r/[restaurantId]` (membre), `/admin/[restaurantId]` (resto), `/platform` (super-admin) |
| Auth | **Supabase Auth** — mot de passe, magic link, Google OAuth ; `middleware.ts` (235 l.) garde les routes et fait le routage post-login par rôle (ADR 0030 §1) |
| Base | **Supabase / PostgreSQL**, RLS partout, clé service-role côté serveur uniquement (`lib/supabase.ts`) |
| Styles | Tailwind, variables de marque par établissement (`lib/branding.ts`) |
| PWA | `app/manifest.ts` (`start_url: /membres`, `display: standalone`) + `public/sw.js` (v4, network-first sur `/r/*`, `/api/*`, `/admin`, `/coupon`) |
| Stockage local | `localStorage` (drapeaux d'onboarding PWA/push), `sessionStorage` (brouillon e-mail, balise d'ouverture), **IndexedDB** (`lib/pending-ticket.ts` — photo du visiteur, 30 min) |
| OCR | **Claude Vision** (`claude-haiku-4-5`) via `@anthropic-ai/sdk`, prompt unique renvoyant `{order_number, amount, has_restaurant_header, order_time, items[]}` (`lib/receipt-ocr.ts`) |
| Analytics | **GA4** via `@next/third-parties`, Consent Mode v2 **tout refusé par défaut** ; catalogue typé dans `lib/analytics.ts` ; compteurs serveur `qr_landings` (ADR 0037) et `receipt_scans` (ADR 0036) |
| Déploiement | Vercel, un seul déploiement multi-établissements (ADR 0015) |

---

## 2. Cartographie du parcours réel

### 2.1 Écrans traversés

| # | Route | Ce que l'utilisateur voit | Ce qu'il doit faire | Champs | Chargement (estimé 4G) |
|---|---|---|---|---|---|
| 0 | `GET /r/kraainem?utm_source=qr_code&utm_medium=print&utm_campaign=loyalty_signup` | Titre « Transformer son ticket en récompenses », **bouton rouge « Scanner mon ticket » + icône de cadre de visée** (`lucide-react/Scan`), carte « Ce que ce ticket peut débloquer » (3 noms d'articles réels), « Déjà membre ? Se connecter », CTA final « Pas encore de ticket ? … S'inscrire directement ». Top 5 équipes **masqué** (`teams_hidden` pour kraainem) | Taper le CTA | — | **~0,9 – 2,2 s.** Server Component non caché : `getRestaurant` + `auth.getUser` + 3 requêtes parallèles + `recordLanding` (RPC, **attendu**) + `getTeamsHidden` + `getLandingTierPreview` — soit ~7 allers-retours Supabase dont 3 séquentiels |
| 1 | `GET /r/kraainem/submit-order` (visiteur) | Logo, **H1 « Scanne ton ticket »**, cadre pointillé avec pictogramme de ticket (zone total + n° encadrée), **bouton « Prendre le ticket en photo » + icône de cadre de visée**, « Choisir dans la galerie », deux conseils de cadrage, 3 étapes numérotées | Taper le bouton photo | — | ~0,5 – 1,2 s (`getRestaurantBranding` + `getReceiptConfig`) |
| 1b | *(hors app)* Appareil photo natif | Viseur système | Déclencher, puis confirmer | — | — |
| 2 | même écran, état « photo prise » | Vignette 80×80, puis **« ✅ Scan réussi / 36,10 € / Montant détecté sur ton ticket »**, texte « garder tes points », **[Continuer avec Google]**, **[Continuer avec un e-mail]**, « J'ai déjà un compte » | Choisir un mode de compte | — | Préparation image ~0,3 – 1,5 s (canvas 1600 px) + **appel Vision 2 – 6 s** |
| 3a | *(hors app)* Google OAuth | Sélecteur de compte Google | Choisir le compte | — | — |
| 3b | `GET /register` | « Dernière étape », **une case** (politique + CGU + ≥ 13 ans), bouton | Cocher + valider | 1 case | ~0,4 s |
| — | *(alternative)* `GET /signup` | E-mail, mot de passe, case de consentement, bouton, séparateur, bouton Google | 3 champs + valider, **puis sortir de l'app pour confirmer par e-mail** | 3 | ~0,4 s |
| 4 | `GET /r/kraainem/submit-order?resume=1` | Photo rechargée depuis IndexedDB, **second appel OCR**, puis récap 2 lignes (Montant / Bestelnummer, modifiables au tap), carte « Cadeau visé » ou barre « Prochain cadeau », bouton **« Envoyer mon ticket »**, mention « pas via une plateforme » | Taper Envoyer | 0 si l'OCR a tout lu ; 1–2 sinon | **appel Vision n° 2 : 2 – 6 s** |
| 5 | même écran, état soumission | « Vérification en cours… » | Attendre | — | **3 – 5 s de délai artificiel** (ADR 0008) **+ appel Vision n° 3** (ré-analyse serveur, `api/orders/route.ts:155`) — les deux en parallèle, donc ~3 – 7 s |
| 6 | même écran, état succès | Dégradé vert, « 🎁 {cadeau} débloqué ! », « +N points », barre « Prochain cadeau ». **Par-dessus** : `TeamRecognitionPrompt` (si dû) puis `PostTicketSheet` (interrupteurs « Installer l'app » / « Être notifié ») | Régler la question d'équipe, puis la feuille | — | — |

### 2.2 Le graphe des redirections

```
QR ──► /r/[id] ──(membre connecté)──► /r/[id]/dashboard          [redirect serveur]
        │
        └─(visiteur)─► /r/[id]/submit-order
                          │  photo → IndexedDB (30 min)
                          │  cookies pending_restaurant_id + pending_ticket (30 min)
                          ├─Google─► OAuth ─► /auth/callback ─(pas de consentement)─► /register
                          │                                                            │
                          ├─e-mail─► /signup ─► « vérifie ta boîte mail » ─► (autre app) ─► /auth/callback
                          │                                                            │
                          └─login──► /login ────────────────────────────────────────────┤
                                                                                        ▼
                                                        /r/[id]/submit-order?resume=1 ──► POST /api/orders
```

**Point de rupture connu** : la branche e-mail impose de **sortir de l'application**
pour ouvrir sa boîte. Si le lien de confirmation s'ouvre dans un autre navigateur
(client de messagerie intégré, Gmail app), les cookies `pending_*` **et** la photo en
IndexedDB restent dans le navigateur d'origine → l'utilisateur atterrit sur `/join`
et son ticket est perdu. C'est exactement la raison pour laquelle l'ADR 0040 met
« Google en un tap d'abord » — mais rien ne protège celui qui choisit quand même
l'e-mail.

---

## 3. Comptage des écrans et des taps

Un « tap » = une action de doigt de l'utilisateur, dialogues système inclus (ils
coûtent aussi).

### Parcours A — visiteur sans compte (le cas du brief)

| # | Tap | Écran |
|---|---|---|
| 1 | « Scanner mon ticket » | vitrine |
| 2 | « Prendre le ticket en photo » | scan |
| 3 | déclencheur de l'appareil photo | *système* |
| 4 | « Utiliser la photo » / ✓ | *système* |
| 5 | « Continuer avec Google » | scan |
| 6 | choix du compte Google | *Google* |
| 7 | case de consentement | `/register` |
| 8 | « Valider » | `/register` |
| 9 | « Envoyer mon ticket » | scan (`?resume=1`) |

> **9 taps, 4 écrans applicatifs** (vitrine, scan, `/register`, scan-resume) **+ 2
> écrans système**. Avec la voie e-mail : **12 à 14 taps** et une sortie de
> l'application. À cela s'ajoutent, après le succès, **2 à 5 taps** pour la question
> d'équipe et la feuille app/notifications.
>
> **Trois appels Claude Vision** sont facturés pour un seul ticket qui aboutit
> (aperçu anonyme + aperçu à la reprise + ré-analyse serveur). L'ADR 0045 l'assume et
> le documente ; c'est néanmoins **3 × la latence et 3 × le coût** sur le chemin
> critique.

### Parcours B — membre déjà inscrit, app non installée

| # | Tap | Écran |
|---|---|---|
| — | *(le QR redirige tout seul vers le dashboard)* | vitrine → dashboard |
| 1 | bouton rond central de la BottomNav (ou carte « Scanner mon ticket ») | dashboard |
| 2 | « Prendre le ticket en photo » | scan |
| 3 | déclencheur | *système* |
| 4 | « Utiliser la photo » | *système* |
| 5 | « Envoyer mon ticket » | scan |

> **5 taps, 2 écrans applicatifs**, **2 appels Vision**. C'est bon — le problème du
> membre inscrit n'est pas le nombre de taps, c'est qu'il **ne revient jamais dans
> l'app** (cf. §6).

### Parcours C — membre inscrit, app installée

Identique à B, moins l'ouverture du navigateur : l'icône mène à `/membres` qui
redirige vers la destination par rôle. **5 taps.**

---

## 4. Toutes les occurrences de « scan » dans l'interface

### 4.1 Surfaces client — action « envoyer un ticket » (à bannir)

| Fichier:ligne | Texte / élément | Gravité |
|---|---|---|
| `app/r/[restaurantId]/page.tsx:168` | **« Scanner mon ticket »** + `<Scan/>` (icône **cadre de visée**, celle des scanners de QR) — le CTA principal de la vitrine | 🔴 |
| `app/r/[restaurantId]/page.tsx:3` | `import { Scan } from "lucide-react"` | 🔴 |
| `components/member/SubmitOrderClient.tsx:572` | H1 **« Scanne ton ticket »** | 🔴 |
| `components/member/SubmitOrderClient.tsx:650` | Bouton « Prendre le ticket en photo » **+ `<Scan/>`** (cadre de visée) — le libellé est bon, l’icône le contredit | 🔴 |
| `components/member/SubmitOrderClient.tsx:6` | `import { Scan }` | 🔴 |
| `components/member/BottomNav.tsx:48,53` | `aria-label="Scanner mon ticket"` + bouton rond `<Scan/>` — **l'action n°1 de l'app n'a pour tout label qu'une icône de cadre de visée de scanner** | 🔴 |
| `components/member/BottomNav.tsx:5` | `import { Scan }` | 🔴 |
| `app/r/[restaurantId]/dashboard/page.tsx:414,418,3` | Carte **« Scanner mon ticket »** + `<Scan/>` | 🔴 |
| `components/member/SubmitOrderClient.tsx:530,558` | « **Scanner** un autre ticket » + `<Scan/>` (×2, écrans succès et attente) | 🟠 |
| `components/member/SubmitOrderClient.tsx:466` | Titre de succès de repli : **« Beau scan ! »** | 🟠 |
| `components/member/SubmitOrderClient.tsx:710` | Badge **« Scan réussi »** (preuve visiteur) | 🟠 |
| `app/r/[restaurantId]/my-team/page.tsx:233,240` | « **scanne** le tien » + bouton « 🧾 **Scanner** mon ticket » | 🟠 |
| `components/LeaderboardRealtime.tsx:58` | « la première équipe qui **scanne** un ticket » | 🟡 |
| `lib/hero-copy.ts:18,22` | « Un dernier **scan** et c'est à toi ! 🔥 », « Chaque ticket **scanné**… » | 🟡 |
| `components/restaurateurs/MemberAppMockup.tsx:102` | Onglet de maquette libellé **« Scanner »** | 🟡 |

### 4.2 Supports imprimés — ici « scanne » désigne bien le QR (ambigu, pas faux)

| Fichier:ligne | Texte |
|---|---|
| `app/admin/[restaurantId]/qr/print/kraainem-sheet.tsx:67,179` | Étape 1 : **« Scanne le code »** |
| `app/admin/[restaurantId]/qr/print/kraainem-sheet.tsx:82,149,193` | Titre **« Scanne et gagne des cadeaux »** |
| `app/admin/[restaurantId]/qr/print/kraainem-sheet.tsx:104,152,196` | NL : **« Scan en win cadeaus »** |
| `app/admin/[restaurantId]/qr/print/page.tsx:32,41,51` | « Scanne pour gagner », « Scanne, rejoins… », « Scanne le code, rejoins… » |

> **C'est la racine du malentendu.** L'affiche apprend au client que « scanner » =
> viser un code avec l'appareil photo. Trois écrans plus loin, la même app lui dit
> « Scanne ton ticket » avec **le même cadre de visée**. Le client fait
> exactement ce qu'on lui a appris : il vise un code. Le mot n'est pas ambigu par
> accident — **l'app enseigne elle-même la mauvaise action.**

### 4.3 Surfaces restaurateur — usage métier légitime, à conserver

`app/admin/**` et `components/restaurateurs/**` : « tickets scannés », « CA scanné »,
« ventes scannées ». Ce sont des termes de la console (glossaire CONTEXT.md,
**Scan** = un passage d'image dans Vision). Aucun changement requis.

---

## 5. Comment la capture photo est déclenchée aujourd'hui

`components/member/SubmitOrderClient.tsx:672-688` — **deux `<input type="file">`
cachés**, pilotés par `ref.click()` :

```tsx
<input ref={cameraInputRef} type="file" accept="image/*" capture="environment" className="hidden" … />
<input ref={fileInputRef}   type="file" accept="image/*"                        className="hidden" … />
```

- **Pas de `getUserMedia`**, pas de flux vidéo dans la page, pas de canvas de visée.
  C'est le bon choix pour une PWA (aucune permission caméra persistante à demander,
  aucun code de cadrage à maintenir, qualité native de l'appareil).
- Le bouton principal (« Prendre le ticket en photo ») déclenche **l'input `capture`**,
  le lien secondaire (« Choisir dans la galerie ») l'input sans `capture`.
- Le glisser-déposer est géré (`handleDrop`) — utile sur ordinateur uniquement.
- Après capture : `prepareReceiptImage()` (`lib/receipt-image-client.ts`) décode via
  `createImageBitmap` (gère l'EXIF **et le HEIC iPhone**), redimensionne à 1600 px,
  ré-encode en JPEG q=0,85. Passe-plat si l'image fait déjà < 1,2 Mo et est
  JPEG/PNG/WebP.

**Comportement attendu par plateforme** *(non testé sur appareil réel — voir §11)* :

| Plateforme | Comportement de `capture="environment"` |
|---|---|
| **Safari iOS 17+** | Ouvre une **feuille d'action** (« Photothèque / Prendre une photo / Choisir un fichier ») plutôt que la caméra directe dans certaines versions ; sur iOS 14+ avec `capture`, l'appareil photo s'ouvre généralement en direct. **Un tap de plus possible.** HEIC est converti côté client → OK. |
| **Chrome Android** | Ouvre la caméra arrière directement. Puis écran de confirmation natif (✓/↺). Conforme à la cible. |
| **Navigateur intégré (Instagram, Facebook, Gmail)** | `capture` souvent ignoré, IndexedDB parfois cloisonnée, OAuth Google **bloqué** par Google (`disallowed_useragent`). **Cas non traité dans le code** — aucune détection, aucun message. |

---

## 6. Comment l'installation de la PWA est proposée

Trois surfaces, une seule bibliothèque (`lib/pwa-install.ts`) :

1. **`lib/pwa-install.ts`** capte `beforeinstallprompt` **au chargement du module**
   (avant React — sinon l'événement est raté), le mémorise, et le distribue par
   abonnement. Expose `estInstallee()` (`display-mode: standalone` ||
   `navigator.standalone`) et `estIosSafari()` (UA). `lancerInstallation()` consomme
   l'événement **une seule fois** et renvoie `accepted` / `dismissed` / `unavailable`.
2. **`PostTicketSheet`** (`components/member/PostTicketSheet.tsx`) — feuille modale
   posée **sur l'écran de succès du premier ticket validé**, deux interrupteurs
   (installer / notifier). **Une seule apparition par appareil** (`localStorage:
   post_ticket_sheet_done`). Sur iOS ou si le prompt natif est indisponible :
   affiche les deux gestes (Partager ⬆️ → « Sur l'écran d'accueil ») + un bouton
   « C'est fait ✅ » **déclaratif** (aucune vérification).
3. **`InstallAppCard`** (ADR 0038) — carte permanente, montée sur
   `/r/[id]/dashboard:217` (membre) et `/admin/[id]:211` (restaurateur). Disparaît
   d'elle-même quand `estInstallee()`. Trois chemins : bouton natif / gestes iOS /
   chemin manuel du navigateur.

**Détection du mode installé** : `AppInstallBeacon` (`app/r/[id]/layout.tsx:177`)
signale une ouverture en mode installé à `POST /api/me/app-install` → table
`member_app_installs` (plateforme, `opens`, `last_opened_at`). Une fois par session
d'onglet.

**Trois trous** :

- **Aucune proposition d'installation n'est faite à un visiteur sans compte.** Les
  trois surfaces exigent une session (`PostTicketSheet` vit sur l'écran de succès,
  `InstallAppCard` sur le dashboard). Un visiteur qui abandonne avant le compte n'a
  jamais vu de proposition — et il n'y a **rien** à quoi revenir.
- **La proposition arrive après un ticket validé.** C'est un choix défendable (le
  cadeau vient de tomber), mais il exclut mécaniquement les ~100 inscrits qui n'ont
  **jamais** soumis de ticket : ils n'ont vu ni la feuille, ni — s'ils ne sont pas
  retournés sur le dashboard — la carte.
- **La modale se ferme au clic sur le fond** (`onClick={close}` sur l'overlay,
  `PostTicketSheet.tsx:171`) et pose alors `pwa_prompted = true` : un tap à côté
  consomme définitivement le seul moment prévu.

---

## 7. Le ticket photographié sans compte : conservé, rattaché, ou perdu ?

**Réponse courte : conservé 30 minutes, rattaché uniquement si l'utilisateur va au
bout de l'inscription dans la foulée, perdu dans tous les autres cas.**

Le détail :

| Support | Contenu | Durée | Portée |
|---|---|---|---|
| **IndexedDB** `boosteats-pending-ticket` (`lib/pending-ticket.ts`) | le JPEG préparé, clé = `restaurantId` | **30 min** (`MAX_AGE_MS`), vérifié à la lecture | ce navigateur, cet appareil |
| **Cookies** `pending_restaurant_id` + `pending_ticket` (`submit-order/actions.ts`) | httpOnly, `maxAge` 30 min | 30 min | ce navigateur |
| **Serveur** | **rien** | — | — |

Le rattachement se fait par `?resume=1` : `auth/callback`, `login/actions.ts` et
`register/actions.ts` lisent les deux cookies et redirigent vers
`submit-order?resume=1` ; `SubmitOrderClient` recharge alors la photo et relance
l'OCR. La chaîne est complète et survit au détour par `/register`.

**Ce qui casse :**

1. **L'utilisateur quitte l'app et revient plus tard sans passer par la connexion.**
   `loadPendingTicket()` n'est appelé que sous `resume === true`
   (`SubmitOrderClient.tsx:166`). Rouvrir la vitrine ou l'écran de scan **ne
   propose jamais** de reprendre la photo qui dort en IndexedDB. Le brief demande
   explicitement l'inverse (« rattaché à la prochaine ouverture »).
2. **Navigation privée / iOS Safari avec « Empêcher le suivi » agressif** : IndexedDB
   est effacée à la fermeture de l'onglet → `loadPendingTicket` renvoie `null` →
   l'écran redemande simplement une photo (dégradation propre, mais silencieuse).
3. **Confirmation par e-mail ouverte dans un autre navigateur** : cookies + IndexedDB
   restent de l'autre côté → atterrissage sur `/join`, ticket perdu, **aucun
   message**.
4. **Au-delà de 30 minutes** : le ticket est perdu sans avertissement — pas de trace,
   pas de « ton ticket a expiré, reprends-le en photo ».

**Et côté mesure, c'est pire** : quand `user` est absent,
`parse-receipt/route.ts:112` **saute `storeScan`** (ADR 0045 §3 —
`receipt_scans.user_id` est `NOT NULL`). Un visiteur qui photographie puis abandonne
**ne laisse strictement aucune trace** : ni ligne, ni image, ni compteur. C'est le
scénario le plus probable derrière « très peu de tickets soumis », et c'est
précisément celui qu'on ne sait pas voir.

---

## 8. Les événements analytics existants, et ce qui manque

### 8.1 Ce qui existe

**GA4** (`lib/analytics.ts`, catalogue typé — un nom hors map ne compile pas) :

| Événement | Émis depuis | État |
|---|---|---|
| `restaurant_landing_viewed` | `TrackOnMount`, vitrine | ✅ |
| `order_submit_started` | `SubmitOrderClient:123` | ✅ |
| `visitor_ticket_captured` | après `savePendingTicket` | ✅ |
| `visitor_signup_started` | `continueWith()` | ✅ |
| `visitor_ticket_resumed` | reprise `?resume=1` | ✅ |
| `sign_up` / `login` | file `analytics-pending` | ✅ |
| `order_submitted` (`amount_band`) | avant `POST /api/orders` | ✅ |
| `order_result` (`validated` / `pending_review` / `rejected`) | après réponse | ✅ |
| `pwa_installed`, `pwa_install_prompted` | `pwa-install.ts`, `InstallAppCard` | ✅ |
| `push_permission_granted`, `team_joined`, `team_declined`, `reward_*`, `referral_shared` | divers | ✅ |
| `visitor_tour_*` | **plus aucun émetteur** (ADR 0044) | 🗑️ déclaré mort dans la map |

**Compteurs serveur** (les seuls fiables) :

- `qr_landings` (ADR 0037, m60) — arrivées par jour × provenance × visiteur.
- `receipt_scans` (ADR 0036, m58) — une ligne par appel Vision **authentifié**, avec
  l'image 30 j, la lecture OCR et l'issue (`parsed` / `header_rejected` / `submitted`).
- `member_app_installs` — ouverture en mode installé.
- `/platform/scans` agrège les quatre étages + `detectScanFrictions` (≥ 3 scans en
  10 min sans soumission).

### 8.2 Ce qui manque pour lire l'entonnoir

| Manque | Conséquence | Gravité |
|---|---|---|
| **GA4 est aveugle** : Consent Mode v2 refuse tout par défaut (ADR 0025), la bannière est refusée par l'écrasante majorité. **Tous** les événements du tableau ci-dessus sont donc mesurés sur un échantillon inconnu et biaisé. C'est écrit noir sur blanc dans l'ADR 0037 — mais aucun des événements du parcours de scan n'a d'équivalent serveur | Le tunnel `landing → capture → compte → envoi` n'est **pas mesurable** aujourd'hui | 🔴 |
| **Aucune trace serveur du scan visiteur** (`storeScan` sauté sans `user`) | L'étage le plus décisif du tunnel — la photo prise avant le compte — n'existe dans aucune table | 🔴 |
| **Aucun motif de rejet enregistré** : `order_result: "rejected"` ne distingue pas `qr_detected` / `unreadable` / `duplicate` (le 409 doublon et le 422 illisible tombent dans le même seau) | Impossible de savoir si le problème est la photo, le QR ou le doublon | 🔴 |
| **Aucun identifiant de session côté serveur** | Impossible de relier une arrivée à un scan puis à une inscription : `qr_landings` compte des chargements, `receipt_scans` des membres. Les deux ne se joignent jamais | 🟠 |
| **`install_prompt_shown` / `install_completed` invisibles pour un visiteur** | On mesure l'installation des membres, pas la conversion visiteur → app | 🟠 |
| **Pas de `home_viewed`** | Aucun dénominateur pour « revient-il au dashboard ? » | 🟡 |
| **`visitor_tour_*` encore dans la map** (`analytics.ts:104-106`) alors qu'aucun code ne l'émet (ADR 0044) | Bruit dans le plan de tracking | 🟡 |

**Le tableau que le brief demande** (`qr_landing`, `ticket_capture_opened`,
`ticket_submitted`, `ticket_validated`, `ticket_rejected{motif}`, `signup_started`,
`signup_completed`, `install_prompt_shown`, `install_completed`, `home_viewed`)
n'existe **dans aucune surface**. `/platform/scans` en montre 4 étages sur 10, et
seulement pour les membres authentifiés.

---

## 9. La logique de validation d'un ticket, aujourd'hui

### 9.1 Ce que l'OCR extrait

`lib/receipt-ocr.ts::analyzeReceipt` — **un seul** appel `claude-haiku-4-5`,
`max_tokens: 1024`, qui renvoie :

| Champ | Validation post-parse | Utilisé pour |
|---|---|---|
| `order_number` | testé contre `key_pattern` de l'établissement (ADR 0019, table `restaurant_receipt_config`) ; année réparée / date invalidée par `sanitizeKeyDate` | **la clé d'anti-doublon** + la date de commande |
| `amount` | nombre, **1 ≤ x ≤ 500**, arrondi au centime | montant, écart vs déclaré |
| `has_restaurant_header` | booléen strict | preuve de ticket |
| `order_time` | `^([01]\d|2[0-3]):[0-5]\d$` | `orders.order_time` — **stocké, jamais utilisé** |
| `items[]` | ≤ 30, nom ≤ 120 car., 0 < qté ≤ 99, prix 0–500 | `order_items` (ADR 0020/0046) — **stocké, jamais utilisé pour l'anti-fraude** |
| `confidence` | **calculée**, pas lue : `90` si clé + montant, `65` si l'un des deux, `35` sinon | flag `low_confidence` |

### 9.2 La clé de doublon

```
duplicate_key = "<restaurant_id>:<order_number>"                       si clé lisible
duplicate_key = "<restaurant_id>:NOBN_<user_id>_<timestamp>"           sinon
```
`orders.duplicate_key` porte une contrainte **UNIQUE globale** (m2) ; l'isolation par établissement est
obtenue en **préfixant la valeur** par `restaurant_id` (m32), pas par la contrainte. Le conflit `23505` renvoie un **409** au client, présenté comme
« Commande déjà soumise ». Depuis l'étape 06, un **`POST /api/orders/precheck`**
débouncé signale le doublon **avant** l'envoi.

### 9.3 Les tolérances

| Contrôle | Seuil | Effet si dépassé |
|---|---|---|
| Format de la clé | regex ancrée de l'établissement | **400** — rejet dur |
| Date issue de la clé | ≥ `NEXT_PUBLIC_PROGRAM_START_DATE`, ≤ aujourd'hui, ≥ `restaurants.created_at` | **400** |
| Montant | 0 < x ≤ 500 (`validateAmount`) | **400** |
| Montant élevé | > 200 € | flag `high_amount` → file admin |
| Écart OCR ↔ déclaré | **> 5 %** | flag `amount_mismatch` → file admin |
| Confiance OCR | **< 70** | flag `low_confidence` → file admin |
| Commandes du jour, même membre | **≥ 3** | flag `too_many_today` → file admin |
| En-tête absent **et** clé absente | — | flag `no_restaurant_header` → file admin |
| Clé absente | — | flag `no_order_key` → file admin |
| **Auto-validation** | `flags.length === 0 && montant ≥ 8 €` | `status = 'validated'` immédiat |

### 9.4 Pourquoi un même ticket peut être crédité deux fois — la démonstration

Le verrou anti-doublon **est** `duplicate_key`, et rien d'autre. Or :

1. **Un chiffre mal lu change la clé.** `2026-08-22/223/08228` lu
   `2026-08-22/223/08223` reste **conforme au pattern**
   `^(\d{4}-\d{2}-\d{2})/\d{3}/\d{5}$` et passe `sanitizeKeyDate` (la date, elle, est
   juste). Deux clés distinctes → **deux commandes validées** → **deux crédits**.
   La signature du bug est visible dans les tests existants
   (`lib/scan-frictions.test.ts:22,24` : `2025-08-22/223/08229` vs
   `2026-08-22/223/08228` sur le même ticket).
2. **Rien d'autre n'est comparé.** Ni le montant, ni l'heure, ni les articles, ni
   l'image. `orders.order_time` et `order_items` sont pourtant **déjà remplis** —
   la matière première d'une empreinte existe, elle n'est simplement jamais lue.
3. **Aucun hash d'image.** Deux photos du même ticket sont, pour le système, deux
   objets sans rapport.
4. **Sans clé lisible, il n'y a aucun anti-doublon du tout** : la clé synthétique
   `NOBN_<user>_<timestamp>` est unique par construction. Ces commandes partent en
   file admin, mais **un admin qui valide deux fois le même ticket ne voit rien**.
5. **`precheck` a le même angle mort** : il n'interroge que `duplicate_key`.

**Le risque symétrique**, que la correction devra éviter : deux clients qui commandent
la même chose à la même minute (rush du midi, deux menus identiques) produisent des
tickets **presque** identiques. Un dédoublonnage trop large les rejetterait. C'est
pour ça que le numéro de commande, même mal lu, reste un **signal** utile — et que
l'empreinte doit intégrer l'utilisateur et une file « à vérifier » plutôt qu'un rejet
sec.

---

## 10. Frictions, classées

### 🔴 Bloquant

| # | Friction | Où | Correction proposée | Effort |
|---|---|---|---|---|
| B1 | **Le mot et l'icône « scan » enseignent la mauvaise action.** L’affiche dit « Scanne le code », l’app dit « Scanne ton ticket » avec **le même cadre de visée** (`lucide/Scan`) sur la vitrine, la BottomNav, le dashboard et l'écran de capture | §4.1 | Bannir « scanner » de l'action ticket ; icône **ticket papier** (`lucide/ReceiptText`) partout ; libellé unique « **Photographier mon ticket** » | **S** (≈ 12 fichiers, aucun changement de logique) |
| B2 | **Un même ticket peut être crédité deux fois** dès que l'OCR se trompe d'un chiffre | §9.4 | Empreinte composite (resto + heure ±2 min + montant + lignes normalisées) + tolérance aux confusions OCR + pHash + garde « même utilisateur / 24 h » + file « à vérifier » | **L** — c'est la phase C |
| B3 | **Le scan d'un visiteur ne laisse aucune trace serveur** (`storeScan` sauté sans `user`) : l'étage le plus décisif du tunnel est invisible | §7, §8.2 | Rendre `receipt_scans.user_id` nullable et enregistrer les scans anonymes avec un identifiant de session opaque (aucune donnée personnelle, esprit ADR 0037) | **M** (1 migration + 2 fichiers) |
| B4 | **L'entonnoir demandé par le brief n'existe pas** : 10 événements attendus, aucun mesuré de bout en bout côté serveur ; GA4 est refusé par défaut donc structurellement aveugle | §8.2 | Table de compteurs serveur par étape × jour (même patron que `qr_landings`) + vue entonnoir sur `/platform/scans` | **M** |
| B5 | **Aucun motif de rejet n'est distingué** — `qr_detected`, `unreadable`, `duplicate` tombent tous dans `order_result: "rejected"` | `SubmitOrderClient:386-393` | Paramètre `reason` sur l'événement + colonne sur la table de compteurs | **S** |

### 🟠 Majeur

| # | Friction | Où | Correction proposée | Effort |
|---|---|---|---|---|
| M1 | **Le ticket en attente n'est jamais reproposé** : `loadPendingTicket` n'est lu que sous `?resume=1`. Rouvrir l'app ne récupère pas la photo qui dort en IndexedDB | `SubmitOrderClient:166` | Vérifier IndexedDB au montage de la vitrine **et** de l'écran de scan → bandeau « Ton ticket t'attend — envoie-le » | **S** |
| M2 | **La branche e-mail fait sortir de l'application** (confirmation par mail) et perd cookies + photo si le lien s'ouvre ailleurs | §2.2 | Désactiver la confirmation e-mail pour ce parcours, ou afficher un écran d'attente explicite (« reviens dans cet onglet ») + message de récupération à l'atterrissage | **M** (dépend d'un réglage Supabase) |
| M3 | **Une photo d'affiche QR peut passer** : l'affiche porte le nom du resto → `has_restaurant_header: true` → `receiptProven` vrai → formulaire ouvert, montant saisi à la main, commande en file admin | `parse-receipt/route.ts:110` | Détecter un QR dans l'image (`BarcodeDetector` côté client, repli serveur) et refuser avec le message dédié ; exiger un montant OCR non nul en plus de l'en-tête | **M** |
| M4 | **Trois appels Claude Vision** pour un ticket qui aboutit (aperçu anonyme + aperçu reprise + ré-analyse serveur) | ADR 0045 § Coût | Mettre en cache la lecture de l'aperçu anonyme (clé = hash de l'image) et la réutiliser à la reprise. La ré-analyse serveur reste la seule source de vérité | **M** |
| M5 | **L'installation n'est jamais proposée à un visiteur**, et pour un membre elle n'arrive qu'après un ticket validé — donc jamais aux ~100 inscrits sans ticket | §6 | Proposer l'installation sur l'écran de résultat (avant même le compte) et sur la vitrine d'un membre connecté sans ticket | **S** |
| M6 | **La feuille post-ticket se ferme au tap sur le fond** et consomme définitivement `pwa_prompted` | `PostTicketSheet.tsx:171` | Ne poser les drapeaux que sur « Continuer » explicite | **XS** |
| M7 | **Deux modales empilées sur l'écran de succès** (question d'équipe puis feuille app/notifications) sur le seul moment de joie du parcours | `SubmitOrderClient:440-451` | Ne garder qu'une sollicitation ; l'autre devient une carte permanente du dashboard | **S** |
| M8 | **Le délai artificiel de 3–5 s s'ajoute à un appel Vision de 2–6 s** : jusqu'à 7 s d'attente après « Envoyer », sur un parcours déjà long | `SubmitOrderClient:34-36,358` | Le délai est déjà en parallèle du fetch ; réduire la borne haute à 3 s tant que l'OCR serveur reste sur le chemin critique | **XS** |

### 🟡 Mineur

| # | Friction | Où | Correction proposée | Effort |
|---|---|---|---|---|
| m1 | La vitrine ne porte **aucune phrase de promesse** — le titre « Transformer son ticket en récompenses » est un slogan, pas un bénéfice daté | `r/[id]/page.tsx:150` | « Votre ticket d'aujourd'hui vaut déjà un cadeau. » | **XS** |
| m2 | Pas de lien secondaire « Je n'ai pas de ticket » sur la vitrine — seulement « Déjà membre ? Se connecter » et, tout en bas, « Pas encore de ticket ? » | `r/[id]/page.tsx:208,269` | Remonter la sortie « Je n'ai pas de ticket » sous le CTA principal | **XS** |
| m3 | Le guide de cadrage est un **schéma SVG générique**, pas un vrai ticket Belchicken | `SubmitOrderClient:621-642` | Vignette d'un vrai ticket avec la zone à cadrer (source : préfixe `echantillons/` du bucket, ADR 0036 §3) | **S** |
| m4 | `visitor_tour_viewed/completed/skipped` encore dans `AnalyticsEventMap` sans émetteur | `analytics.ts:104-106` | Retirer (ADR 0044 l'a déjà acté pour le doc, pas pour le code) | **XS** |
| m5 | Sur l'écran de succès, **tout est dévoilé d'un coup** (équipe, jetons, réserve, classement via la BottomNav) alors que le brief demande un dévoilement progressif | BottomNav + dashboard | Masquer Équipe/Actions tant qu'aucun ticket n'est validé | **M** — arbitrage produit, contredit « on ne cache jamais » (ADR 0030 §4) ⚠️ |
| m6 | `sw.js` précache `/`, `/membres`, `/offline` mais **pas** la vitrine `/r/[id]` ni l'écran de scan — le premier chargement au comptoir est toujours réseau | `public/sw.js:8-13` | Laisser tel quel (les pages sont personnalisées), mais précacher les polices et l'icône | **XS** |
| m7 | `middleware.ts` interroge Supabase **à chaque navigation** (`auth.getUser`, puis 1 à 4 requêtes selon la route) — s'ajoute à chaque temps de chargement | `middleware.ts` | Hors périmètre de ce chantier ; à instruire séparément | **L** |

> ⚠️ **m5 contredit une règle établie.** L'ADR 0030 §4 pose « on ne cache jamais une
> fonctionnalité, on montre ce qui manque pour l'utiliser ». L'étape 5 du parcours
> cible demande l'inverse. C'est un arbitrage produit à trancher explicitement en
> phase B — et, s'il est tranché en faveur du masquage, à acter par un ADR qui amende
> l'ADR 0030.

---

## 11. Ce qui n'a pas pu être vérifié

- **Aucun test sur appareil réel** : cette session tourne dans un conteneur sans
  Safari iOS ni Chrome Android. Les comportements de `capture="environment"` en §5
  sont déduits de la spécification et des notes de compatibilité, **pas observés**.
  À valider sur un iPhone et un Android avant toute décision d'implémentation.
- **Aucun accès à la base de production** : le connecteur Supabase de cette session
  n'est pas autorisé et aucune variable `SUPABASE_*` n'est présente dans
  l'environnement. Les chiffres du test (100 inscrits, tickets doublés) n'ont donc
  **pas** pu être recoupés. Le script d'audit rétroactif de la phase C sera écrit
  pour être lancé avec `SUPABASE_SERVICE_ROLE_KEY`, mais **il devra être exécuté de
  ton côté** (ou la connexion Supabase autorisée depuis les réglages de connecteurs
  claude.ai).
- **Les temps de chargement sont des estimations** déduites du nombre d'allers-retours
  Supabase par page, pas des mesures.
- **L'état réel des migrations en production** (`20260831-1029` pour le rate-limit IP,
  m58, m60) n'a pas pu être vérifié — le code est fail-open partout, donc l'absence
  d'une migration se traduit par une mesure manquante, jamais par une panne.

---

## 12. Ce qu'il faut retenir

Le parcours cible décrit dans le brief est, à 80 %, **déjà construit** : la photo
avant le compte, la preuve OCR avant l'inscription, l'inscription à trois champs, la
reprise après connexion, la feuille d'installation. Ce n'est pas un problème de
parcours manquant.

Ce sont **trois choses précises** qui coincent :

1. **L'app enseigne la mauvaise action.** Le mot « scanner » et l'icône de cadre de visée
   sont cohérents d'un bout à l'autre — cohérents avec l'affiche, donc avec le QR.
   C'est la friction la moins chère à corriger et probablement la plus rentable.
2. **On ne voit rien.** GA4 est refusé par défaut, le scan visiteur ne laisse aucune
   trace serveur, et les motifs de rejet ne sont pas distingués. Toute décision prise
   aujourd'hui sur « pourquoi si peu de tickets » est une conjecture. Instrumenter
   côté serveur est le préalable à tout le reste.
3. **Le verrou anti-doublon repose sur une seule lecture OCR.** Un chiffre mal lu, et
   le ticket compte deux fois. La matière première d'une empreinte robuste
   (`order_time`, `order_items`, l'image conservée 30 j) est **déjà en base** — elle
   n'est simplement jamais lue.

Phase B (parcours cible) et phase C (dédoublonnage) sont indépendantes et peuvent
avancer en parallèle, comme prévu.
