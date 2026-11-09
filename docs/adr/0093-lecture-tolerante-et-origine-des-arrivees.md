# ADR 0093 — Lecture tolérante du JSON et origine des arrivées

**Statut** : Proposé (2026-11-09). Complète l'[ADR 0072](0072-sonnet-lit-fable-relit.md) (qui lit le ticket) et amende l'[ADR 0037](0037-qr-funnel-measurement.md) (§ aucun agent utilisateur : il est désormais lu puis jeté, jamais conservé).

## 1. Lecture tolérante du JSON

**Contexte.** Du 2026-10-10 au 2026-11-09, 11 lectures de Sonnet sur 369 (3 %) ont répondu en phrase (« The order number is… ») au lieu du JSON, et sont parties en secours Haiku. Ce secours n'a pas fait de mal : 9 de ces 11 lectures ont fini avec total et clé (8 avec la relecture Fable), contre 199 sur 358 en lecture normale. Un nouvel essai de Sonnet avant Haiku ajouterait ~2,5 s et un appel payant pour presque aucun gain : **non retenu**.

**Décision.** Quand le texte n'est pas du JSON mais contient un objet `{…}` valide, on le prend. Sinon l'erreur reste la même et le secours joue comme avant. La trace de lecture porte `json_salvaged: true` quand cela est arrivé.

## 2. Origine des arrivées

**Contexte.** Sur 30 jours : 3 671 arrivées anonymes « direct » (sans utm) contre 1 963 par QR, soit 65 % sans origine. Ce « direct » mêlait aperçus de lien générés par des robots, réseaux sociaux, recherche, vieux QR sans utm et saisie directe. On ne pouvait donc pas dire d'où viendrait un arrivage.

**Décision.** `lib/arrival-source.ts` (pur, testé) classe chaque arrivée dans une liste close : `qr_code`, `direct`, `apercu_lien`, `reseau_social`, `recherche`, `autre_site`, `boosteats`, `utm_autre`. Il lit le *referer* et l'*agent utilisateur* de la requête, les classe, puis les jette : ni l'en-tête brut ni l'agent ne sont stockés. La colonne `qr_landings.source` est du texte libre, donc aucune migration. Le tableau d'entonnoir de la plateforme garde ses colonnes et ajoute une ligne de détail.

## Conséquences

- Le total des arrivées ne change pas ; seule la répartition du « lien » apparaît. Les arrivées d'avant ce détail restent « sans origine ».
- Les robots (aperçus de lien) restent comptés mais séparés. Le compteur de la console qui prend les arrivées anonymes pour preuve que le QR est affiché (`lib/console-journey-data.ts`) les compte encore : à décider ensuite s'il doit les exclure.
- Un lien envoyé sans utm par une application qui efface le *referer* restera « sans origine » : seuls nos propres liens peuvent être étiquetés par utm.
- À relire à 7 jours : la part de chaque origine dans l'ancien « direct ».
