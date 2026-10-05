# ADR 0079 — Chaque refus a sa cause, et Fable ne relit que s'il y a un ticket à relire

**Statut** : Accepté (2026-10-06) — décisions du porteur : compter chaque refus avec sa vraie cause, couper
les relectures inutiles, relever le plafond des visiteurs à 60 par heure, la veille d'un arrivage massif de
tickets. Précise l'[ADR 0072](0072-sonnet-lit-fable-relit.md) §2 et amende l'[ADR 0045](0045-preuve-scan-avant-compte.md)
(plafond par IP). Appliqué avec le bouclier de l'[ADR 0065](0065-le-bouclier-scene-trace-echos.md).

## Contexte

Le porteur voit, sur `/platform/scans`, les informations lues d'un ticket refusé **mais pas sa photo**, et ne
comprend pas pourquoi il ne passe pas. Mesuré du 2026-09-30 au 2026-10-06 (établissements réels) :

**Pourquoi la photo manque.** 78 scans, dont 26 refusés ; **16 des 26 refus sont des visiteurs sans compte**
dont l'image n'est jamais conservée (minimisation, ADR 0025 et 0045) ; les 10 refus de membres ont leur photo.

**Pourquoi ces 10 tickets ont été refusés** (photos regardées une par une) : 7 photos inutilisables (flou de
bougé, ticket minuscule ou coupé, papier froissé, presque que la table) ; 1 vieux ticket déjà utilisé,
photographié flou ; **1 vrai ticket valide, net, refusé** (T237/T238 : même ticket photographié deux fois, la clé
`…/223/0726` lue `213` puis `233` — ticket occupant ~15 % du cadre, numéro en petit ; la relecture de Fable ne l'a
pas corrigé). Les refus de photo sont justes : c'est leur **message** qui ne dit pas pourquoi.

**Des refus invisibles.** Deux limites répondaient « Trop de scans en peu de temps » sans laisser la moindre
ligne : 20 scans par heure et par membre, et **8 scans par heure et par adresse IP** pour les visiteurs. Dans
un restaurant, tous les clients partagent le Wi-Fi ou la même antenne mobile : le 9ᵉ visiteur de l'heure aurait
été bloqué. Une panne ou un délai dépassé de la lecture (erreur 502) n'était pas compté non plus.

**Des relectures qui ne servent presque pas.** Fable a relu 39 scans sur 78 et n'a comblé un trou que **4 fois** ;
sur les 35 relectures inutiles, 16 portaient sur un premier passage qui n'avait lu **ni le total ni aucune clé**
(10 sans rien du tout : ni total, ni clé, ni en-tête, ni article) — photo ratée ou pas un ticket. Chaque relecture
ajoute en moyenne 10 secondes (18 au pire) à un refus qui arrive de toute façon.

**Ce que cette mesure ne dit pas** : une semaine, 78 scans ; les 4 relectures utiles ne se distinguent pas des
autres par ce qu'on a conservé (on ne garde que la lecture finale, pas celle du premier passage) ; on ne sait pas
combien de tickets arriveront.

## Décision

### 1. Un refus causé par le système se compte comme un refus de photo

Trois motifs d'entonnoir (`ticket_rejected`, vocabulaire ouvert, sans migration) :
- `rate_limited` — plus de 20 scans par heure pour un membre ;
- `visitor_rate_limited` — le plafond par IP des visiteurs ;
- `reading_unavailable` — la lecture a échoué ou dépassé son délai (le client voit « réessaie »).

Les deux routes de lecture les enregistrent. L'aperçu visiteur lit désormais le formulaire **avant** les limites
(il faut savoir de quel établissement il s'agit pour compter) ; le coût est de lire un corps de 4,5 Mo au plus.
La cause d'un 502 est écrite dans les journaux du serveur.

### 2. Pas de relecture quand rien n'a été lu

`needsRescue` ne relance Fable que si le premier passage a lu le **total** ou **une clé** (même écartée) : un
ticket est bien là. Photo floue, ticket trop loin ou coupé, pas un ticket : « reprends la photo » arrive tout de
suite, sans 10 secondes d'attente. Les autres règles de l'ADR 0072 et 0073 ne changent pas.

### 3. Le plafond des visiteurs passe de 8 à 60 scans par heure et par IP

Une IP est celle de tout un restaurant. 60 laisse passer un afflux et garde un plafond contre quelqu'un qui
enverrait des centaines de photos (chaque scan est un appel Vision facturé). Le plafond des membres (20 par
heure) ne change pas.

## La trace (bouclier)

- Les trois motifs ont leur ligne dans le tableau « refus » de l'entonnoir (`/platform/scans`, par motif).
- **Ce qui dira que la règle est fausse** :
  - `visitor_rate_limited` ou `rate_limited` **non nuls** : le plafond est atteint, donc encore trop bas pour la
    journée ;
  - `reading_unavailable` non nul ou qui monte : la lecture ne tient pas la charge (limites de requêtes chez
    Anthropic, délais) ;
  - la **part de relectures utiles** (`rescue_filled` non vide sur `rescue` non nul) doit **monter** (elle était
    de 4 sur 39) et le nombre de relectures baisser d'environ un tiers ; si elle ne monte pas, le déclencheur doit
    encore se resserrer ;
  - un ticket **valide** qui n'a ni total ni clé lus, donc plus relu — à chercher dans les refus « unreadable » avec photo.

## Ce qui n'est pas fait (décidé : pas maintenant)

- **Corriger le code d'établissement** quand le nom du restaurant est lisible (213 ou 233 lus pour 223) : sauverait
  le ticket T237/T238 sans créer de faux doublon (le code est constant par établissement). Non retenu par le porteur
  pour cette fois.
- **Faire noter la qualité de la photo par le modèle** (floue, trop loin, coupée) pour ajouter une cause lisible même
  sans photo, et un message précis au client : à reprendre.
- **Détecter le flou avant l'envoi**, dans l'appli : à calibrer sur nos photos, après l'arrivage.
- **Conserver la photo des visiteurs refusés** : rompt la minimisation de l'ADR 0025 ; non.

## Conséquences

- Les refus du système apparaissent enfin dans l'entonnoir : « Trop de scans » n'est plus invisible.
- Le visiteur n'est plus bloqué au 9ᵉ scan de l'heure à l'adresse de son restaurant.
- Moins de relectures, donc moins d'attente et moins de coût sur les photos ratées.
- Limite connue, non traitée : les plafonds de requêtes côté Anthropic (palier du compte) ne sont pas vus par le code ;
  un dépassement apparaît comme `reading_unavailable`.

## Alternatives rejetées

**Retirer la limite par IP le jour de l'arrivage.** Plus aucune protection contre un envoi massif de photos
(chaque scan est facturé).

**Relire aussi quand rien n'est lu.** 0 relecture utile sur 16 : de l'attente et du coût pour rien.

**Garder la photo des visiteurs refusés pour comprendre.** Contraire à l'ADR 0025 ; la cause se note, la photo
d'une personne sans compte ne se garde pas.
