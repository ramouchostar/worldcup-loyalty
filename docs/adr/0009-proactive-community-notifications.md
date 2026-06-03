# ADR 0009 — Notifications d'incitation à commander basées sur le score communautaire

**Statut** : Accepté

## Contexte

Un membre peut ne pas savoir que sa communauté a progressé depuis sa dernière commande. Sans notification, il revient au restaurant par habitude — pas par motivation communautaire. La notification transforme un score abstrait en argument concret et immédiat : "voici exactement ce que tu gagnes si tu commandes ce soir."

La valeur de la notification tient à sa **spécificité** : elle ne dit pas "ta communauté progresse" mais "ta communauté est à 8 500 pts → ton cadeau de base Finest burger est upgradé avec +Finest burger en bonus. Commande maintenant."

## Décision

### Les 4 déclencheurs

**Trigger 1 — Franchissement de palier communautaire** (priorité haute)
La communauté vient de dépasser un seuil de score (ex. 2 999 → 3 000 pts).
Message : *"🇧🇪 Belgique vient de passer 3 000 points ! Ton cadeau passe de Finest burger à Finest burger + Churros 12 pcs. Commande maintenant pour profiter du nouveau bonus 🎁"*

**Trigger 2 — Membre inactif, communauté qui a progressé** (priorité moyenne)
Le membre n'a pas commandé depuis 72h+ ET le score de son équipe a augmenté d'au moins **500 points absolus** depuis sa dernière commande (seuil absolu, pas relatif — évite les faux positifs quand le score de départ est proche de zéro).
Message : *"🇧🇪 Pendant ton absence, ta communauté a gagné X points. Tu es maintenant dans la tranche bonus +[article]. Ton cadeau t'attend 🔥"*

**Trigger 3 — Proche du prochain seuil** (priorité moyenne)
La communauté est à moins de 10% du prochain palier.
Message : *"🇧🇪 Belgique est à X points du prochain bonus communautaire. Une commande ce soir peut tout changer pour toi et tes coéquipiers."*

**Trigger 4 — Avancement Coupe du Monde** (priorité haute)
L'admin vient de valider le passage d'un tour. Complémentaire à la récompense d'avancement (ADR 0006 couche 3).
Message : *"🇧🇪 Belgique en quarts ! Ton bonus d'avancement est actif : +Finest burger sur ta prochaine commande directe."*

### Règles anti-spam

- Délai minimum **48h** entre deux notifications au même membre
- Le Trigger 2 (inactivité) ne s'active que si le membre n'a pas commandé depuis **72h+**
- Un membre qui vient de commander (< 6h) ne reçoit aucune notification
- Maximum **3 notifications par semaine** par membre, tous triggers confondus
- Les Triggers 1 et 4 ont priorité sur 2 et 3 si plusieurs conditions sont vraies simultanément

### Canaux par ordre de priorité

1. **PWA push** (gratuit) — si le membre a installé la PWA et accepté les permissions
2. **WhatsApp Business API** (payant, ~€0,05/conversation Belgique) — fallback si push non disponible
3. **In-app** (gratuit) — toujours affiché à l'ouverture de l'app, en complément

### Estimation du coût WhatsApp notifications

- 3 restaurants × ~200 membres = 600 membres
- 20% reçoivent une notification WhatsApp/semaine (les autres via push ou inactifs) = 120/semaine
- Coût : ~€6/semaine → **~€25/mois** pour les 3 restaurants
- Acceptable dans le budget de fonctionnement de €800/mois par restaurant

## Pourquoi c'est un ADR

Une fois que les membres sont habitués aux notifications d'incitation, les supprimer entraîne une baisse d'engagement perçue comme une dégradation du service. C'est une décision difficile à inverser — et le coût WhatsApp s'accumule si les règles anti-spam ne sont pas respectées dès le départ.

## Conséquences sur le schéma

```sql
-- Contrôle anti-spam
ALTER TABLE profiles
  ADD COLUMN last_notified_at TIMESTAMPTZ;

-- Journal des notifications (analytics + audit anti-spam)
CREATE TABLE notification_log (
  id            UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id       UUID REFERENCES profiles(id) NOT NULL,
  restaurant_id TEXT NOT NULL,
  trigger_type  TEXT NOT NULL CHECK (trigger_type IN (
                  'tier_upgrade',
                  'member_inactive',
                  'tier_approaching',
                  'advancement'
                )),
  channel       TEXT NOT NULL CHECK (channel IN ('whatsapp', 'push', 'in_app')),
  community_score_at_send NUMERIC(14,2),
  message_body  TEXT NOT NULL,
  sent_at       TIMESTAMPTZ DEFAULT NOW()
);

-- Index pour vérifier rapidement la dernière notification d'un membre
CREATE INDEX idx_notification_log_user_sent
  ON notification_log (user_id, sent_at DESC);
```

## Conséquences sur le code

- Un job Supabase Edge Function (ou cron Next.js) tourne toutes les 30 minutes pour évaluer les triggers
- La fonction vérifie `last_notified_at` avant tout envoi
- Après chaque envoi : `UPDATE profiles SET last_notified_at = NOW() WHERE id = ?`
- Le message est construit dynamiquement avec le score réel et la récompense calculée (même logique que `pending_rewards`)
