# ADR 0072 — Sonnet lit le ticket, Fable le relit quand il n'a pas été lu en entier

**Statut** : Accepté (2026-09-29) — à confirmer par la trace après sept jours (§5). Complète
l'[ADR 0058](0058-le-ticket-ne-se-corrige-pas.md) §4 (une seule lecture, celle du serveur),
l'[ADR 0066](0066-la-carte-identite-du-ticket.md) (une lecture peut inventer) et l'[ADR 0036](0036-receipt-scan-retention.md)
(chaque lecture est conservée). Remplace la « seconde lecture de la clé » du 2026-09-18
(modèle plus précis, clé seule). **§2 précisé par l'[ADR 0073](0073-le-format-de-la-cle-du-ticket.md)** :
une clé de mauvaise forme ou de code inconnu déclenche la relecture (les clés courtes valides ne sont plus refusées) ;
seule une clé d'un autre établissement ne la déclenche pas. Appliqué avec le bouclier de l'[ADR 0065](0065-le-bouclier-scene-trace-echos.md).

## Contexte

Le serveur lisait chaque ticket avec **Haiku 4.5**, puis relançait un second modèle sur la clé
seule quand le total était lu mais pas la clé. Deux constats sont venus du terrain.

**1. Haiku invente.** Le ticket de 73,30 € de Kraainem (2026-09-20, ADR 0066), photographié de loin,
avait été lu « 73,50 € » avec un numéro inexistant. Rejoué le 2026-09-29 sur la même photo :
Haiku redonne 73,50 € et une heure fausse (22:25) ; **Sonnet, Opus et Fable lisent 73,30 € et
20:35, justes, et ne lisent pas de clé** au lieu d'en inventer une.

**2. Un banc d'essai sur nos propres photos** (2026-09-29, 199 photos de tickets Kraainem et
Houba conservées avant leur purge de 30 jours, lues par Haiku, Sonnet, Opus et Fable avec la
consigne exacte de production) :

- Sonnet, Opus et Fable donnent quasiment les mêmes lectures ; **Haiku s'écarte de leur majorité
  sur 34 numéros sur 73** (sous-ensemble choisi parce que Haiku et Sonnet divergeaient : ce n'est
  pas son taux d'erreur général) et n'a pas su lire 28 photos sur 199 que Sonnet lit.
- Vérifiées **à l'œil par le porteur** sur 13 tickets : numéro exact **Sonnet 11/13 (0 faux)**,
  Opus 11/13 (0 faux), Fable 11/13, **Haiku 4/13 (6 faux : chiffres altérés)**. Sur T008, Haiku a
  recopié le numéro **d'exemple de la consigne** (« …/03993 »).
- Cohérence date/heure avec le moment du scan : Sonnet, Opus et Fable 100 % plausibles ; Haiku
  9 dates ou heures impossibles.

**Ce que cette mesure ne dit pas** : 13 tickets vérifiés seulement ; les 147 photos lisibles ne
sont que **94 tickets distincts** (certains photographiés jusqu'à 15 fois) ; les lectures ont été
faites par des sous-agents Claude Code (lots de 20 photos), pas par des appels API isolés ; l'œil
humain se trompe aussi (le porteur a noté une clé fausse sur la photo de loin de l'incident). Elle
justifie de **changer de lecteur**, pas de croire un pourcentage. D'où la trace (§5).

Coûts (tarifs API au 2026-09-25 : Sonnet 5.5 2 $ / 10 $ par million de jetons entrée / sortie,
Fable 5.1 10 $ / 50 $, Haiku 4.5 1 $ / 5 $ ; image ≈ (largeur ÷ 28) × (hauteur ÷ 28) jetons)
— **estimation, pas mesure** : Sonnet ≈ 0,01 à 0,04 $ par ticket (3 à 11 $ par mois à 285 tickets),
Fable ≈ 0,05 à 0,20 $ par relecture, selon les jetons de réflexion, inconnus avant la trace.

## Décision

### 1. Sonnet 5.5 lit en premier

`analyzeReceipt` (lib/receipt-ocr.ts) appelle `claude-sonnet-5-5`, même consigne qu'avant, effort
`medium` (réglé sans mesure), `max_tokens` porté à 4 096 (la réflexion compte dans cette limite : 1 024
tronquait le JSON). Le JSON est cherché dans le **bloc de texte** de la réponse, plus dans
`content[0]` (avec la réflexion, le premier bloc est une réflexion).

### 2. Fable 5.1 relit quand la lecture est incomplète

Déclencheur (`needsRescue`, pur et testé) : **total absent**, ou — là où l'établissement a une clé
fiable — **aucune clé lue du tout**. Fable relit la photo entière avec la même consigne, précédée d'un
rappel (ticket possiblement petit, tourné, froissé ; bloc de paiement en bas ; « mieux vaut null qu'une
valeur inventée »).

Pas de relecture dans trois cas où elle coûterait sans servir :
- **une affiche** (refusée telle quelle par `judgeReceipt`) ;
- **une clé lue mais refusée par le format** (ex. « …/223/036 » : 20 photos sur 199 le 2026-09-29,
  confirmées à l'œil) — Fable la lirait pareil ; c'est une question de format, pas de lecture (§7) ;
- **une année de clé réparée** : la clé existe, le membre reprend la photo (ADR 0058).

### 3. La relecture comble, elle ne remplace rien

`mergeReadings` : Fable ne remplit que les **trous** (clé, total, heure, articles…). Une valeur déjà
lue par Sonnet n'est jamais réécrite, même si Fable lit autre chose : un désaccord est **mesuré**
(`rescue_conflict`), pas tranché. Raison : l'incident du 2026-09-20 a montré qu'une lecture peut
inventer des valeurs plausibles ; on ne laisse pas une seconde lecture en réécrire une première.
Seule exception : c'est Fable qui dit « affiche » quand Sonnet n'avait rien trouvé.

### 4. Une relecture ne fait jamais échouer un scan

- Fable refuse (`stop_reason: refusal`), dépasse son délai (25 s) ou tombe en panne : on garde la
  première lecture, l'échec est écrit dans la trace.
- **Secours** : si Sonnet est indisponible (panne, modèle non activé sur la clé), la lecture se fait
  par Haiku comme avant l'ADR 0072, et la trace l'écrit (`fell_back_from`). Jamais de 502 pour un
  modèle qui manque.
- Budget de temps : 52 s en tout, les routes passent à `maxDuration = 60` ; une relecture n'est pas
  lancée s'il reste moins de 8 s.

### 5. La trace (bouclier)

`receipt_scans.ocr_trace` (migration 20260929-0900) : modèle, délai et jetons de chaque lecture, ce que
la relecture a comblé, désaccord, refus, secours. Affichée sur `/platform/scans`
(« Sonnet 8,2 s → Fable 14,1 s : clé comblée »). Requêtes de suivi dans la migration. **Ce qui dira que
la règle est fausse** :
- relectures qui **ne comblent presque jamais** (`combles` ≪ `relus`) → le déclencheur dépense pour rien ;
- **désaccords fréquents** → regarder les images ;
- **refus de Fable** ou **secours Haiku** qui augmentent ;
- **délai** Sonnet p95 > 15 s ou Fable p95 > 25 s → l'écran d'attente du client est trop long ;
- **jetons réels** au-dessus de l'estimation (0,04 $ par ticket au total) ;
- part de « numéro non lu » qui ne baisse pas après le 2026-09-29.

À sept jours : ces chiffres, puis décision sur l'effort (`medium`), le déclencheur et le modèle de relecture.

### 6. Ce qui ne change pas

Une lecture incomplète après relecture reste refusée « reprends la photo » (ADR 0058 §2). Aucune
saisie, aucun aperçu. La règle de format de la clé n'est pas touchée. Le nombre de lectures par heure
(20) est inchangé.

### 7. Hors périmètre, à décider

Le format de la clé (5 chiffres) refuse des tickets réels à Kraainem : 17 clés à 4 chiffres et 3 à
3 chiffres sur 199 photos, toutes lues à l'identique par Sonnet, Opus et Fable, et 3 confirmées à
l'œil. C'est un autre sujet (règle de format, risque de lecture partielle = doublon) : ADR à part.

## Conséquences

- Coût par ticket : ×4 à ×10 pour la lecture principale (Haiku ≈ 0,004 $ → Sonnet ≈ 0,01 à 0,04 $) plus
  une relecture Fable sur environ **un ticket sur quatre** d'après l'échantillon gelé (48 photos sur 199
  sans aucune clé lue — à confirmer par la trace, l'échantillon contient beaucoup de photos ratées).
- Fable exige 30 jours de conservation des données côté Anthropic et n'est pas disponible en zéro
  rétention : si la clé de l'organisation ne le permet pas, la relecture échoue proprement (400, tracé)
  et le scan continue avec la première lecture.
- Le premier vrai ticket lu par Sonnet 5.5 et Fable 5.1 via l'API est la première mesure : le banc
  d'essai n'est pas passé par l'API. Ouvrir `/platform/scans` après les premiers scans.
- Faute corrigée au passage (lib/receipt-ocr.ts, lib/receipt-scans.ts) : `/^d{4}-d{2}-d{2}$/` sans `\d`
  jetait **toutes** les dates imprimées — 0 date enregistrée sur 35 scans depuis la mise en service de
  l'ADR 0066, et le contrôle `key_date_matches_printed` ne pouvait jamais échouer. Effet : dès cette PR,
  les dates imprimées sont enregistrées et ce contrôle devient actif (toujours non bloquant, phase 1).

## Alternatives rejetées

**Fable pour tous les tickets.** Environ 5× le coût de Sonnet ; sur les 13 tickets vérifiés il ne fait
pas mieux (11/13 comme Sonnet et Opus) ; réflexion toujours active, délai plus long pour un client qui
attend.

**Garder Haiku et ne changer que la relecture.** Haiku invente et altère des chiffres (6 faux sur 13
vérifiés) : c'est la première lecture qui déclenche le crédit de points, elle doit être la plus fiable.

**Laisser Fable réécrire les valeurs quand il diffère.** Une seconde lecture peut inventer aussi ;
on mesure d'abord les désaccords.

**Croiser deux lecteurs sur la clé et refuser en cas de désaccord.** Bonne idée, à décider sur la
trace : la relecture ne se déclenche aujourd'hui que sur une lecture incomplète.

**Passer par le batch (moitié prix).** Asynchrone : le client attend son résultat.
