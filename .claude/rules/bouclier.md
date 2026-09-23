# Le bouclier — la scène, la trace, les échos (ADR 0065)

Grille de lecture de **tout** chantier : produit, code, texte, migration, mesure. Les trois
questions se posent **avant** d'écrire, et leurs réponses vont dans le corps de la PR.

Pourquoi : sur 184 fusions en trois mois, 109 étaient des correctifs. Cause commune — on
décide à partir de ce qu'on imagine de la scène réelle, et on livre sans moyen de voir qu'on
s'est trompé.

## 1. La scène — qu'est-ce que je n'ai pas vu ?

Qui fait le geste, avec quoi en main, à quel moment, que voit-il juste après ? Pour chaque
réponse, **une preuve** : vraie photo de ticket, capture de l'écran réel, requête en lecture
seule sur la base de production, mock-up validé, phrase du restaurateur.
« Je suppose » = on ne code pas, on va chercher la preuve (5 min contre une PR de retouche).
**Apparence** : ne rien construire avant d'avoir montré le rendu (capture ou aperçu) et reçu un oui.

## 2. La trace — comment saurai-je que c'est faux ?

Quel chiffre contredira la règle si elle est fausse ? Motif de refus nommé, drapeau, compteur
d'entonnoir, valeur brute conservée. S'il n'existe pas, il part **dans la même PR**.
**Aucun échec silencieux** : visible à l'écran pour l'utilisateur, visible dans les données pour nous.

## 3. Les échos — qu'est-ce qui croyait l'ancienne règle ?

À lister avant de coder, à vérifier avant de pousser :
textes membre et restaurateur (écrans, push, courriels) · libellés et motifs · lectures de
données qui supposaient l'ancien invariant (`.single()`, index, filtres) · **tous les chemins**
qui produisent le même effet (les cinq validations de ticket, crons, console, bac à sable) ·
les autres périodes (mois suivant, nouvel établissement) · ADR / `CONTEXT.md` / `CLAUDE.md` ·
les mesures.

## Dans la PR

Trois lignes obligatoires, avec les preuves, jamais « n/a » sans raison :

```
Scène observée : …
Trace laissée : …
Échos suivis : …
```
