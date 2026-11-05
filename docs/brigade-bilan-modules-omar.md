# La brigade — ce qu'Omar a livré (bilan du 2026-11-05)

> Pour Mehdi, et pour son Claude Code. À lire en 5 minutes. Tout ce qui suit est **déjà fusionné dans
> `master`** (PR #391 à #397). Rien n'est encore visible pour un gérant : il manque le contrat commun,
> la table et l'écran « Idées du jour », qui sont tes Brigades 01 à 03.

## En une phrase

Les six modules « assistants » d'Omar produisent des idées, testées et sans effet de bord ; **ils attendent ton
contrat (`lib/agents/types.ts`), ta table `agent_proposals` et ton écran pour devenir visibles.**

## Ce qui est livré

| Brigade | Assistant | Fichiers | Ce que ça fait | PR |
|---|---|---|---|---|
| 07 | Chloé | `lib/agents/chloe.ts` | Jour creux → promo ; plat à mettre en avant. Relais vers Hugo. | #392 |
| 09 | Chloé | `lib/agents/chloe-ca.ts` | « Tu n'as pas noté hier : 30 secondes ? » (ouvre la saisie du CA, ADR 0087). | #393 |
| 11 | Léa | `lib/agents/lea.ts` | Tickets en attente > 2 h ; cadeau à ajouter au catalogue « Mes points ». | #394 |
| 08 | Hugo | `lib/agents/hugo.ts`, `execute-hugo.ts` | Relance des clients absents 21–90 jours (10 % de témoins) ; annonce de la promo de Chloé. | #395 |
| 10 | Emma | `lib/agents/emma.ts`, `execute-emma.ts`, `acceptPubIdea` dans `pub/actions.ts` | Propose une demande de pub toute prête ; le « Oui » crée la demande existante. | #396 |
| 14 | Max | `lib/agents/max.ts` | Constats de l'analyse Google → idées. Se tait si l'analyse a plus de 30 jours. | #397 |

Hors brigade mais lié : **#391** — les pages de la console lisaient en silence 1 000 lignes au plus ;
`fetchAllRowsStrict` (`lib/paged-select.ts`) lit tout ou échoue franchement. Tous les modules l'utilisent.

Dans le backlog : les Brigades 07 à 11 et 14 sont « fait ». Les 20 lignes ont été insérées à la main
(idempotent par titre) parce que le plan n'est que dans la PR #390, toujours ouverte.

## Ce que tu dois décider en premier : le contrat

Chaque module définit des **types provisoires**, sans les partager. Remplace-les par ton `types.ts` : on
change les types, pas la logique. Ce qui revient dans les six :

```ts
// Champs communs à toutes les idées
assistant: "chloe" | "lea" | "hugo" | "emma" | "max"
type: string                                   // ex. "jour_creux_promo", "cadeau_a_ajouter"
title: string; question: string                // « Tu n'as pas noté hier » / « 30 secondes ? »
lines: { what: string; who: string; cost: string }   // les 3 lignes de la carte
estimate: { low: number; high: number; unit: string; basis: string } | null
decideBy: string                               // ISO, au-delà l'idée expire
evidence: Record<string, number | string | string[]> // les chiffres qui l'ont produite (trace)
```

Ce qui **diffère** et que le contrat doit trancher : le **geste** à exécuter sur « Oui ».

| Assistant | Forme actuelle du geste | Qui l'exécute |
|---|---|---|
| Chloé | `relay: HugoRelay` (message, produit, remise, dates) | Hugo |
| Léa | `action: { kind: "open" \| "call", … }` | écran existant, ou `PATCH /api/admin/menu/eligible` |
| Hugo | `action: { kind: "send_to_members" \| "schedule_broadcast", … }` | `executeHugoAction` |
| Emma | `action: { kind: "create_ad_request" }` + `proposal` + `creative` | `acceptEmmaIdea` |
| Max | `action: { kind: "update_fiche" \| "relay", via: "api" \| "equipe", needsInput }` | l'équipe aujourd'hui, l'API (Brigade 12) plus tard |

Aucune de ces unions n'est figée : à toi de les ramener à une forme commune (par exemple un `action` générique
plus des `payload` typés par assistant).

## Ce qui est prêt à brancher

- **Générateurs purs** (testés, sans base) : `chloeIdeas`, `caReminderIdea`, `ticketsToVerifyIdea`,
  `giftToAddIdea`, `lapsedIdea`, `promoAnnouncementIdea`, `emmaDecision`, `maxDecision`.
- **Lecteurs de base** (un par module, `load…`) : paginés et stricts. Une table absente se lit « rien », jamais
  une erreur ; toute autre erreur remonte.
- **Exécuteurs** : seuls Hugo et Emma en ont (ils engagent des envois ou de l'argent). Les autres ouvrent un écran
  ou appellent une route existante. **Aucun n'est branché à un écran.**
- **Emma** : `ad_requests.origin` et `origin_evidence` (migration `20261105-0300`, appliquée par Omar) notent
  qu'une demande vient d'une idée, pour comparer ses résultats à ceux des gérants.

## Règles que tous les modules respectent

- **Un jour sans bonne idée vaut mieux qu'une idée de remplissage** : en cas de doute, ils renvoient `null` ou une liste
  vide, et disent **pourquoi** (`reason`) quand c'est utile à la trace.
- **Rien ne part sans « Oui »** et aucun euro n'est dépensé sans « Oui ». Emma ne coche jamais les conditions de la Pub à
  la place du gérant (seul `termsAccepted === true` passe).
- **Aucun euro côté membre** (ADR 0007), aucune promesse de gain : `estimate` est `null` quand il n'y a rien d'honnête à
  chiffrer, sinon une fourchette.
- **Fail-open** sur ce qui peut manquer (migration, table), **fail-closed** sur ce qui engage (Hugo ne part pas sans
  journal des messages).
- Le plafond de **3 idées par jour** n'est **pas** appliqué par les modules : c'est ta couche (`proposals.ts`).

## Ce que les données réelles disent aujourd'hui : aucune idée ne sort

Lecture en base, en lecture seule, sur les établissements réels et les démos. Les causes sont différentes à chaque fois :

| Module | Pourquoi rien ne sort |
|---|---|
| Chloé (jour creux) | volumes de ventes trop faibles pour son seuil |
| Léa | aucune file en attente ; catalogues déjà fournis |
| Hugo | plus de 9 anciens clients sur 10 n'ont pas accepté les offres |
| Emma | la Pub n'est ouverte qu'à certains établissements ; Chloé ne trouve pas de promo |
| Max | les analyses des établissements réels datent de plus de 40 jours |

Le chemin « une idée est produite » n'est donc prouvé **que par les tests**, pas par un cas réel. Ton écran sera le
premier vrai test.

## Questions ouvertes pour toi (aussi écrites dans chaque PR)

1. **Contrat commun** : voir plus haut. C'est ta Brigade 01, tout en dépend.
2. **Chloé #392 et #393** : le rappel du CA peut doubler les rappels push et e-mail de l'ADR 0087 (10 h, 15 h, 18 h).
   Faut-il le taire quand un rappel est déjà parti ? (`planReminders` sait déjà le faire avec `sent`.)
3. **Léa #394** : le seuil « catalogue maigre » (< 3 articles) ne concerne que les établissements neufs. Faut-il aussi
   suggérer des cadeaux pour les paliers (`suggestRewardGrid`, ADR 0013) ?
4. **Hugo #395** : « tu nous manques » peut-il être un message de programme (ADR 0039 §2) plutôt qu'une promo ? C'est une
   question juridique. Et confirmer qu'on ne reprend pas l'anniversaire (déjà fêté par `member-strategies.ts`).
5. **Emma #396** : le délai de départ de 3 jours, l'objectif Visites seul, et l'**amendement de l'ADR 0086** (qui
   propose / qui valide) — c'est une de tes décisions, à relire.
6. **Max #397** : qui relance l'analyse mensuelle des clients ? Sans elle Max reste muet. Faut-il recouper avec une
   seconde source (Places) avant d'afficher un manque comme le téléphone ?

## Hypothèses à réviser quand les idées seront visibles

| Seuil | Valeur | Où |
|---|---|---|
| Client « absent » | 21 à 90 jours | `hugo.ts` (`LAPSED_DAYS`, `LAPSED_MAX_DAYS`) |
| Cohorte minimale pour une relance | 10 (pour qu'un témoin à 10 % existe) | `hugo.ts` (`MIN_AUDIENCE`) |
| Cadeau « atteignable » | 8 tickets moyens | `lea.ts` (`GIFT_MAX_TICKETS`) |
| Ticket « en retard » | plus de 2 h (celui de l'écran Commandes) | `lea.ts` (`TICKET_SLA_HOURS`) |
| Analyse « récente » | 30 jours | `max.ts` (`MAX_AUDIT_AGE_DAYS`) |
| Pub proposée | 14 jours, départ J+3, 3 km, 12 € par jour | `emma.ts` (`EMMA_*`) |

Chaque idée garde dans `evidence` le chiffre qui l'a produite : c'est ce qui permet de recalibrer.

## Ce qui n'est PAS fait (à toi, ou à une suite)

- **Brigades 01, 02, 03, 12** (contrat, table, écran, accès Google) et le reste de ta liste.
- **Persistance, plafond de 3 par jour, refus avec raison, expiration** : `proposals.ts`.
- **Hugo : l'anniversaire** (volontairement non repris) ; **Max : le rapport mensuel de place sur Google Maps**
  (ADR 0088, dépend de la grille DataForSEO).
- **Louis (Brigade 13)** attend ton accès API ; **mesures `/platform` (06)** attendent la table ; **landing (17)** attend
  l'écran.

## Pièges rencontrés (pour ne pas les refaire)

- **Windows / fins de ligne** : les fichiers sont en CRLF dans la copie de travail ; une édition multi-lignes qui ne
  trouve pas son motif vient presque toujours de là.
- **Commentaires du bot Vercel** reçus comme « commentaires de revue » par l'Auto-fix : ce sont des statuts de
  déploiement, pas des retours.
- **Le build CI peut échouer sur `next/font/google`** (téléchargement de la police) sans lien avec le code : relancer le
  job suffit.
- **Un `sed`/script qui touche plusieurs fichiers CRLF** doit conserver les fins de ligne (voir les scripts utilisés).
