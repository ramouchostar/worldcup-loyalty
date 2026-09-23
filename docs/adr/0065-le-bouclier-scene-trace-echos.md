# ADR 0065 — Le bouclier : la scène, la trace, les échos

**Statut** : Accepté (2026-09-23). Grille de lecture appliquée à **tout** chantier de l'app
— produit, code, texte, migration, mesure. Ne remplace aucun ADR : il dit *comment* on décide
avant d'écrire, pour que chaque livraison n'appelle pas la suivante.

## Contexte

Trois mois de terrain (juin → septembre 2026) : **184 fusions sur `master`, dont 109 correctifs**,
et **26 ADR sur 64 déjà amendés**. Les retouches sont venues du porteur, de son associé, des
restaurateurs et des clients. Classées par cause réelle :

| Cause du correctif | Nombre | Exemples |
|---|---|---|
| Apparence ou formulation retouchée après coup | 33 | hero de la vitrine repris ~12 fois, titres, couleurs, emojis |
| Règle écrite sans avoir vu la scène réelle | 20 | Bestelnummer cherché « en haut » alors qu'il est en bas ; cadeau récupérable pendant la même visite ; prix de revient au lot au lieu de la pièce ; plancher de 8 € qui envoyait des tickets parfaits en file ; coupon consommé alors que le caissier n'appuie jamais sur « Cadeau remis » |
| Conséquences d'un changement non suivies ailleurs | 9 | second cadeau actif possible mais lectures en `.single()` ; taux du budget remis à 8 % chaque 1er du mois ; sandbox qui comptait deux fois depuis m35 |
| Chiffre qui mesurait autre chose que l'événement | 7 | tuile qui mesurait un clic et non la remise du cadeau ; affiches sans marqueur QR ; clé lue hors format jetée, donc invisible |
| Échec invisible pour l'utilisateur | 3 | inscription annoncée en échec sans vérifier la session ; bouton d'installation muet |

**Le fond est le même partout** : on décide à partir de ce qu'on **imagine** de la scène, et on
livre sans **moyen de voir** qu'on s'est trompé. La correction arrive donc par un humain qui,
lui, était dans la vraie scène — d'où des améliorations qui demandent des améliorations.

## Décision

Avant tout chantier, trois questions. Aucune n'est facultative ; chacune a une réponse
**vérifiable**, pas une intention.

### 1. La scène — qu'est-ce que je n'ai pas vu ?

Qui fait le geste, avec quoi en main, à quel moment, et que voit-il juste après ? Pour chaque
réponse : **quelle preuve ?** Une vraie photo de ticket, une capture de l'écran réel, une
requête en lecture seule sur la base, un mock-up validé, une phrase du restaurateur.
Tant que la réponse est « je suppose », on ne code pas : on va chercher la preuve. Elle coûte
cinq minutes ; la retouche coûte une PR, une migration et la confiance d'un client.
*Cas particulier de l'apparence (33 correctifs sur 109) : rien ne se construit avant d'avoir
montré à quoi ça ressemblera — capture ou aperçu — et obtenu un « oui ».*

### 2. La trace — comment saurai-je que c'est faux ?

Une règle livrée doit laisser un **chiffre qui la contredit** si elle est fausse : motif de
refus nommé, drapeau, compteur d'entonnoir, valeur brute conservée. Si ce chiffre n'existe pas,
il part **dans la même PR** que la règle. Corollaire : **aucun échec silencieux** — si quelque
chose rate, l'utilisateur le voit à l'écran et nous le voyons dans les données.

### 3. Les échos — qu'est-ce qui croyait l'ancienne règle ?

Lister avant de coder, vérifier avant de pousser : les **textes** (membre, restaurateur,
messages, courriels), les **libellés** et motifs, les **lectures de données** qui supposaient
l'ancien invariant, les **autres chemins** qui produisent le même effet (les cinq validations
de ticket, les crons, la console, le bac à sable), les **autres périodes** (mois suivant,
nouvel établissement), la **documentation** (ADR, `CONTEXT.md`, `CLAUDE.md`) et les **mesures**.

## Conséquences

- Chaque PR porte trois lignes — **Scène / Trace / Échos** — remplies avec des preuves
  (`.github/pull_request_template.md`). Une PR qui ne peut pas les remplir n'est pas prête.
- Règle chargée à chaque session : `.claude/rules/bouclier.md`. Le skill `/ship` refuse
  d'ouvrir une PR sans ces trois lignes.
- Ce n'est pas un contrôle qualité de plus en fin de course : c'est **avant** d'écrire que les
  trois questions se posent, sinon elles ne protègent de rien.
- On accepte de **livrer plus lentement une seule fois** plutôt que trois fois la même chose.
  Mesure de l'effet : la part de correctifs dans les fusions du mois (109/184 = 59 % au
  2026-09-23) doit baisser.
