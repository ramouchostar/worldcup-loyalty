# ADR 0008 — Validation automatique + illusion de contrôle humain

**Statut** : Accepté — amendé par l'ADR 0052 (le numéro de commande n'est plus le seul verrou anti-doublon : empreinte de contenu + photo en signaux complémentaires) et par l'[ADR 0058](0058-le-ticket-ne-se-corrige-pas.md) (l'OCR serveur est la source des VALEURS — montant et numéro —, plus seulement du flagging ; aucune saisie côté membre)

> **Amendé le 2026-09-18 (décision du porteur — les restaurateurs n'ont pas le temps de valider)** : un ticket est validé automatiquement dès que le numéro de commande et le total sont lus et que rien n'est suspect ; l'en-tête ne compte plus (depuis #143) et **le plancher de 8 € est supprimé** (la moitié des validations manuelles de Kraainem en septembre étaient des tickets parfaits sous 8 €). **Deux tickets par client et par jour** au plus (heure de Bruxelles) : le troisième est refusé avant la lecture, le client l'envoie le lendemain. La règle « 3+ le même jour → file » est remplacée par **« 6 tickets ou plus sur 7 jours → file »** (motif `frequent_submitter` : employé qui enregistre à son nom les tickets oubliés). Restent en file : montant > 200 €, lecture incomplète, doublon possible (ADR 0052). Règles dans `lib/ticket-limits.ts`.

## Contexte

La validation humaine de chaque ticket de caisse crée deux problèmes :
1. Friction client : délai entre soumission et récompense visible → perte d'enthousiasme, retour vers Uber Eats.
2. Charge opérationnelle : 3 restaurants × 50+ commandes/jour = 150+ validations/jour si le programme marche bien.

En parallèle, supprimer toute validation humaine ouvre la porte aux commandes inventées.

## Décision

### Validation automatique avec délai artificiel

Le système valide automatiquement si toutes ces conditions sont réunies :
1. Photo du ticket uploadée dans le bucket `receipts`
2. Header restaurant détecté sur la photo (valeur de `NEXT_PUBLIC_RESTAURANT_NAME`, ex. "Belchicken Houba") — rejet automatique des tickets caissier/cuisine sans header. La valeur est configurable par déploiement, pas hardcodée.
3. Bestelnummer extrait par OCR (format `YYYY-MM-DD/NNN/NNNNN`, ex. `2026-06-01/258/03993`)
4. Le montant OCR correspond au montant déclaré (tolérance ±5%)
5. Bestelnummer absent de la base (anti-doublon)
6. Montant entre €8 et €200

Si toutes les conditions sont vraies → `status = 'validated'` immédiatement en base.

**L'interface affiche un délai artificiel de 3–5 secondes** avec le message "Vérification en cours..." avant d'afficher "✅ Ticket vérifié". Ce délai est intentionnel : il entretient la perception d'une vérification humaine sans en avoir le coût. Les membres potentiellement malveillants se croient observés.

### File admin pour les cas suspects

Les commandes suivantes passent en `status = 'pending'` pour revue manuelle :
- Montant > €200
- Confiance OCR < 70% ou Bestelnummer illisible
- 3+ commandes validées le même jour par le même membre
- Écart > 5% entre montant déclaré et montant OCR
- Header restaurant absent de la photo

L'interface admin mobile (/admin/orders) permet validation/rejet en swipe. Objectif : < 2h de délai pour les cas suspects pendant les heures d'ouverture.

### WhatsApp — deux usages distincts, pas de bot de soumission

**Soumission de tickets : via l'app uniquement.**
Le client scanne son ticket directement depuis l'app (caméra téléphone → upload Supabase Storage → OCR). Un bot WhatsApp de soumission serait plus long et plus complexe que le scan direct — il a donc été écarté. L'app est le seul canal de soumission.

**Partage de liens de parrainage : `wa.me/?text=...`**
Schéma universel qui ouvre WhatsApp nativement avec le message pré-rempli. Aucun appel API. Coût zéro.
```
https://wa.me/?text=Rejoins+ma+communauté+Belchicken+🇧🇪+https://belchicken-houba.be/join?ref=K7X2P9
```

**Notifications proactives : API Meta WhatsApp Business directe (sans Twilio)**
Uniquement pour les notifications d'incitation à commander (ADR 0009). Implémentation via `fetch` natif vers `graph.facebook.com/v19.0/` — aucune dépendance npm externe.

Variables d'environnement (par déploiement, pour les notifications uniquement) :
```bash
WHATSAPP_PHONE_NUMBER_ID=   # Meta Developer Console
WHATSAPP_TOKEN=             # token permanent Meta
```

## Coût infrastructure

- Google Vision API : 1 000 requêtes/mois gratuites, puis €1,50/1 000. Sur 100 tickets/jour → ~3 000/mois → ~€3/mois par restaurant.
- Partage lien parrainage (`wa.me`) : **€0** — pas d'API.
- Notifications WhatsApp proactives (Meta directe) : voir ADR 0009 pour le détail du coût.
- Total infra validation : < €5/mois par restaurant.

## Conséquences

- Le bucket `receipts` reste obligatoire même pour les auto-validations — la photo est la preuve en cas de litige a posteriori.
- Le `duplicate_key` est désormais le **Bestelnummer** (`2026-06-01/258/03993`), pas `DATE_HH:MM_MONTANT` — voir ADR 0003 mis à jour.
- La variable d'env `AUTO_VALIDATE=true` permet de désactiver l'auto-validation en dev pour tester le flow admin manuel.
- Les messages client ne mentionnent jamais "automatique" ou "instantané" — toujours "vérifié" sans adverbe.
