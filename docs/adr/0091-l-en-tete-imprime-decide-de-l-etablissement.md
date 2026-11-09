# ADR 0091 — L'en-tête imprimé décide de l'établissement

**Statut** : Proposé (2026-11-09). Amende l'[ADR 0073](0073-le-format-de-la-cle-du-ticket.md) (§ code d'établissement : il devient le repli).

## Contexte

L'ADR 0073 refuse un ticket quand le code au milieu de la clé (`223`, `258`, `253`…) n'est pas
celui de l'établissement. Ce code est une lecture de trois chiffres : un chiffre mal lu change de
restaurant. Mesure sur 30 jours : 14 tickets dont l'en-tête reconnaît l'établissement mais dont le
code lu est faux ; les tickets d'Ixelles (code 234, établissement pas encore ouvert) n'ont jamais
d'en-tête reconnu. Le porteur le dit : « Belchicken est trop flou là-dessus, l'adresse est
imprimée sur le ticket, il est préférable de se fier à cela. »

Mais l'en-tête n'est reconnu que sur 54 % des tickets lus (51 % Kraainem, 74 % Houba, 52 % De Bue) :
il ne peut pas être obligatoire.

## Décision

1. Le modèle lit **à l'aveugle** le nom et l'adresse imprimés en tête (`printed_name`,
   `printed_address`), sans qu'on lui souffle le nom du restaurant.
2. `lib/receipt-header.ts` (pur, testé) les compare à l'identité enregistrée (`restaurants.name`,
   `address`) de chaque établissement réel. Nom distinctif (ce qui n'est pas la marque) **ou**
   numéro de rue + un mot de la rue ; tolérant aux noms de rue bilingues (Kraainemlaan / Av. de
   Kraainem). Verdict : `own`, `other` ou `unknown`.
3. Décision dans `analyzeReceipt` :
   - `other` → refus « autre établissement », même si la clé porte le bon code ;
   - `own` → la clé est gardée quel que soit son code (un chiffre mal lu n'y change rien) ;
   - `unknown` (absent, illisible, ambigu, restaurant inconnu) → on retombe sur le code de la clé,
     comme avant (ADR 0073). Un en-tête qui ne ressemble à rien de connu ne refuse jamais seul.
4. Le code de la clé reste la solution de repli et la forme de la clé reste vérifiée.

## Trace

`receipt_scans.ocr_trace.header` : verdict, nom et adresse lus, établissement désigné,
`overrode_code` (le code disait « autre / inconnu », l'en-tête a gardé la clé). Aucun nouveau motif
de refus : un refus par en-tête est un `wrong_establishment` comme avant.

## Conséquences

- Moins de refus à tort d'un vrai ticket au code mal lu ; refus plus sûr d'un ticket d'ailleurs
  dont le code est mal lu.
- Un en-tête mal lu qui désigne un autre établissement refuserait à tort : le seuil est strict
  (nom distinctif complet, ou numéro **et** mot de rue) et chaque refus laisse sa trace.
- Dépend de l'exactitude de `restaurants.name` / `address` (De Bue imprime « Uccle De Bue » : le
  mot distinctif « bue » suffit). Un nouvel établissement s'inscrit avec un nom et une adresse
  fidèles au ticket.
- Mesure à 7 jours : part `overrode_code`, refus `other` par en-tête, verdict `unknown`.
