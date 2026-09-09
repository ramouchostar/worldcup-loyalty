# ADR 0051 — L'entonnoir à dix étages, compté côté serveur et sans identifiant

**Statut** : Accepté (2026-09-09). Étend l'[ADR 0037](0037-qr-funnel-measurement.md)
(qui a réglé le premier étage avec `qr_landings`) aux neuf suivants. Contraint par
l'[ADR 0025](0025-gdpr-data-governance.md) (minimisation, consentement). Complète le
plan de mesure (`docs/tracking-plan.md` §7). Lot 3 du parcours cible « le ticket
avant tout », annoncé comme non fait par les [ADR 0048](0048-le-gain-avant-le-compte.md)
et [0049](0049-le-cadeau-paie-chaque-demande.md) (§Mesure : « aucun événement ajouté »).
Ne change rien au parcours client : aucun écran, aucun texte, aucun euro.

## Contexte

Les ADR 0048 et 0049 ont refait l'écran de conversion et la feuille post-ticket, et
tous deux se terminent sur le même aveu : **on ne saura pas si ça a marché.** Les
événements GA4 existants (`visitor_ticket_captured`, `visitor_signup_started`) sont
émis, mais le Consent Mode v2 refuse tout par défaut (ADR 0025) : l'écrasante
majorité des parcours n'y remonte jamais. Décider sur cet échantillon, c'est décider
sur un biais de taille inconnue — le constat exact de l'ADR 0037.

Ce même ADR 0037 avait déjà tranché pour le premier étage : un compteur serveur
(`qr_landings`, m60), sans IP, sans cookie, sans identifiant. Mais il s'arrêtait à
quatre étages, dont trois dérivés de tables existantes. Entre « arrivée » et
« commande », tout le parcours refait par les ADR 0048/0049 — photo prise, compte
demandé, app proposée — n'était mesuré **nulle part**.

Le bilan du pilote Kraainem (2026-09-09) l'a rendu concret : 369 arrivées, 54
adhésions, et **2 arrivées seulement** portant l'`utm_source` des QR imprimés. Donc
impossible de trancher l'hypothèse du restaurateur (« les gens ne scannent pas le
QR ») — c'était pourtant la question que l'ADR 0037 avait été écrit pour régler.

## Décision

### 1. Dix compteurs, un par étage, sur le modèle exact de `qr_landings`

Table `funnel_events (restaurant_id, day, step, reason, count)` (migration
`20260909-2340`), un `INSERT … ON CONFLICT DO UPDATE` par franchissement,
service-role only, best-effort — un échec de comptage ne casse jamais un parcours
(même règle que `recordLanding`, ADR 0037 §4, et que le métering, ADR 0029 §6).

Les dix étages, dans l'ordre du parcours réel des ADR 0048/0049 :

| Étage | Source |
|---|---|
| `qr_landing` | **dérivé** de `qr_landings` (m60) |
| `ticket_capture_opened` | balise navigateur |
| `signup_started` | balise navigateur |
| `signup_completed` | **dérivé** de `memberships.joined_at` |
| `ticket_submitted` | `POST /api/orders` |
| `ticket_validated` | `POST /api/orders` **et** la file d'arbitrage |
| `ticket_rejected` (+ motif) | aperçu OCR, doublon, rejet manuel |
| `install_prompt_shown` | ouverture de la feuille post-ticket |
| `install_completed` | balise `AppInstallBeacon` (ADR 0038) |
| `home_viewed` | rendu du dashboard membre |

Motifs de refus : `unreadable`, `header_rejected`, `duplicate`, et `qr_detected`
— ce dernier **défini mais encore émis par personne**, en attente du verrou « photo
de QR ou d'affiche » (chantier séparé). Le définir maintenant coûte une ligne et
évite qu'il arrive plus tard sous un autre nom.

### 2. Aucun identifiant de session — la vraie décision de cet ADR

Le brief d'origine demandait « horodatage **et identifiant de session** ». C'est
refusé, et il faut que la raison reste écrite ici, sinon quelqu'un « améliorera » la
mesure dans six mois.

Un identifiant de parcours — **même en `sessionStorage`, même sans cookie** — fait
basculer la mesure dans le champ du consentement ePrivacy. Soit on le demande, et on
retombe dans l'angle mort que l'ADR 0037 avait précisément choisi de sortir ; soit on
ne le demande pas, et on est en faute. Le gain (reconstituer des parcours individuels
anonymes) ne vaut ni l'un ni l'autre.

Ce qu'on garde à la place : les **taux de passage entre étages**, qui suffisent à
répondre à « où décroche-t-on ? » — la seule question qu'on pose à cet outil. Ce
qu'on perd : le parcours d'une personne. Et il reste disponible là où la base légale
existe, sur la partie **authentifiée** (`receipt_scans`, `orders`).

Comme `qr_landings`, la table compte donc des **événements, pas des personnes** : un
rechargement compte deux fois. C'est écrit à côté du tableau plutôt que masqué
(ADR 0037 §2) — un chiffre grossier mais honnête vaut mieux qu'un chiffre juste que
personne n'autorise.

### 3. Trois étages seulement sont déclarés par le navigateur

`CLIENT_REPORTABLE_STEPS` est une **liste close** : `ticket_capture_opened`,
`signup_started`, `install_prompt_shown`. Tout le reste est **constaté côté serveur**,
là où c'est un fait et non une déclaration.

Le partage n'est pas arbitraire, il suit l'incitation à mentir. Un POST forgé sur ces
trois étages ne peut que faire paraître la conversion **pire** qu'elle n'est (ils sont
tous des dénominateurs). Les étages qu'on aurait envie de gonfler — « compte créé »,
« ticket validé » — ne sont jamais acceptés d'un client : `signup_completed` est
dérivé de `memberships`, `ticket_validated` est écrit par la route qui valide.

`install_completed` passe par une route **authentifiée** existante
(`/api/me/app-install`, ADR 0038), déjà dédoublonnée une fois par session d'onglet :
il n'a donc pas besoin de la liste close.

La balise client utilise `navigator.sendBeacon` et non `fetch`, et ce n'est pas du
confort : `signup_started` est suivi dans la milliseconde d'une redirection OAuth, qui
annulerait une requête ordinaire. Une balise perdue, c'est un étage qui paraît vide.

### 4. Deux étages restent dérivés de tables existantes

`qr_landing` et `signup_completed` ne sont **pas** écrits dans `funnel_events`. Ils
sont déjà des faits serveur en base (`qr_landings` depuis m60, `memberships.joined_at`
depuis toujours) : les recompter perdrait l'antériorité et risquerait un double
comptage, pour une donnée qu'on a déjà.

### 5. Le taux de passage se lit sur un dénominateur déclaré, jamais « l'étage du dessus »

Le parcours n'est pas une file unique : un membre déjà inscrit saute les deux étages
de compte, et « validé » / « refusé » sont deux **sorties du même étage**, pas deux
étapes successives. Chaque étage déclare donc explicitement son `rateFrom`
(`lib/funnel.ts`), et les étages sans dénominateur n'affichent aucun taux.

Un rapport entre deux étages qui ne se suivent pas serait un chiffre faux **mais
crédible** — le pire des deux. C'est aussi pour ça que la table des taux est une
fonction pure testée (`computeStepTotals`) : un dénominateur qui glisse ne casse rien
de visible.

Un dénominateur nul donne `null`, jamais `0 %` : afficher zéro laisserait croire à un
décrochage total là où il n'y a rien à comparer.

### 6. La lecture vit sur `/platform/scans`, un établissement à la fois

Additionner les étages de plusieurs restaurants ne veut rien dire (ADR 0037 §3). Le
tableau par jour des quatre étages historiques reste au-dessus — il a de
l'antériorité ; le nouveau tableau dit **où** ça décroche, étage par étage, avec les
motifs de refus en dessous.

Surface super-admin exclusivement : aucun de ces chiffres ne redescend vers un membre
(ADR 0007) ni vers un restaurateur (ADR 0015 §7).

## Alternatives rejetées

- **Un identifiant de session anonyme** (le brief). Voir §2 : bascule dans le champ
  du consentement, donc retour à l'angle mort. C'est l'écart assumé par rapport à la
  cible demandée.
- **S'appuyer sur GA4 / le Measurement Protocol.** Refusé par défaut chez la quasi
  totalité des visiteurs ; renvoyer les événements serveur vers GA4 ajouterait une
  dépendance à un consentement dont on n'a pas besoin pour compter.
- **Un `CHECK` en base sur la liste des étapes.** Imposerait une migration à chaque
  étape ajoutée pendant qu'on cherche encore où le parcours décroche. Le vocabulaire
  vit dans `lib/funnel.ts` ; la vue n'affiche que les étapes connues, donc une étape
  inconnue est inerte plutôt que bloquante.
- **Tout déclarer depuis le navigateur** (une seule route, dix étapes). Rendrait
  falsifiables exactement les deux chiffres qu'on a intérêt à gonfler (§3).
- **Un tableau jour × étape à dix colonnes.** Illisible sur dix étages, et ce n'est
  pas la question : on compare des étages entre eux, pas des jours.
- **Une table par événement, avec horodatage à la seconde.** Volumétrie sans usage :
  on n'a aucune question qui demande la seconde, et ça rouvrirait la tentation de
  rattacher les lignes entre elles.

## Conséquences

### Code
- `docs/migrations/20260909-2340-funnel-events.sql` — table + RPC `record_funnel_event`,
  service-role only, idempotente. La RPC prend un incrément (`p_times`, 1 par défaut) :
  une validation en lot depuis la file d'arbitrage franchit l'étage autant de fois
  qu'elle valide de tickets, en un seul aller-retour.
- `lib/funnel.ts` — vocabulaire (`FUNNEL_STEPS`, `STEP_VIEW`, `REJECTION_REASONS`),
  `recordFunnelStep` (best-effort), `computeStepTotals` (**pur, testé**),
  `getFunnelReport`.
- `lib/funnel-beacon.ts` — côté navigateur, `sendBeacon` d'abord. Module séparé :
  `lib/funnel.ts` embarque la clé service-role.
- `app/api/funnel/route.ts` — liste close, réponse toujours 200 (c'est une balise,
  pas une transaction).
- Instrumentation : `api/orders`, `api/orders/parse-receipt`, `api/admin/orders`,
  `api/me/app-install`, `dashboard/page.tsx`, `SubmitOrderClient`, `PostTicketSheet`,
  `AppInstallBeacon` (prop `restaurantId`).
- `components/platform/FunnelStepsTable.tsx` + `app/platform/scans/page.tsx`.
- `docs/tracking-plan.md` §7 — dit désormais que le tunnel ticket **ne se lit pas
  dans GA4**, et pourquoi.

### Opérationnel
- La migration doit être appliquée dans l'éditeur SQL Supabase à la fusion (règle de
  collaboration). Tant qu'elle ne l'est pas, `recordFunnelStep` échoue en silence et
  les huit étages comptés restent à zéro — les deux dérivés remontent quand même.
- Une écriture de plus par franchissement, sur une table minuscule. Négligeable,
  y compris devant l'appel Vision qu'elle accompagne.

### À surveiller
- **Les compteurs déclarés par le navigateur peuvent être gonflés** par des robots ou
  des rechargements, comme les arrivées le sont déjà. Si les chiffres paraissent
  faux, la piste est d'exclure les requêtes de préchargement — **pas** d'ajouter un
  cookie (ADR 0037, § alternatives rejetées).
- `qr_detected` restera à zéro jusqu'au verrou « photo de QR / d'affiche ». Un zéro
  attendu, pas un bug.
- `home_viewed` compte des rendus de dashboard, donc beaucoup pour un même membre.
  C'est un repère de retour, jamais un dénominateur — et il n'en est le `rateFrom` de
  personne.
