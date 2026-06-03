#!/bin/bash
# Crée les 9 issues GitHub pour le projet World Cup Loyalty
# Usage : bash worldcup-loyalty/docs/create-issues.sh
# Prérequis : gh CLI authentifié, repo ramouchostar/worldcup-loyalty

REPO="ramouchostar/worldcup-loyalty"
LABELS="ready-for-agent,worldcup-loyalty"

# gh issue create retourne l'URL — on extrait le numéro depuis la fin
num() { echo "$1" | grep -oE '[0-9]+$'; }

echo "🚀 Création des issues World Cup Loyalty..."

# ─────────────────────────────────────────────
# ISSUE 1 — Migrations schéma (aucun bloquant)
# ─────────────────────────────────────────────
I1=$(num "$(gh issue create --repo "$REPO" --label "$LABELS" \
  --title "[WCL] Migrations schéma — toutes les tables et triggers (ADRs 0001–0009)" \
  --body "## What to build

Migration SQL complète appliquant les décisions des ADRs 0001–0009. Fondement de toutes les autres slices.

**Nouvelles tables :**
- \`pending_rewards\` — récompenses 3 couches par commande validée (ADR 0006)
- \`referral_links\` — code unique par membre + compteurs clicks/conversions
- \`referrals\` — une ligne par ami inscrit, \`referee_id UNIQUE\`
- \`notification_log\` — journal anti-spam des notifications (ADR 0009)

**Nouvelles colonnes :**
- \`orders\` : \`order_number TEXT UNIQUE\` (Bestelnummer), \`receipt_url TEXT NOT NULL\`, \`eft_reference TEXT\`, \`declared_amount\`, \`ocr_amount\`
- \`teams\` : \`round_advanced_at TIMESTAMPTZ\`
- \`profiles\` : \`last_notified_at TIMESTAMPTZ\`
- Toutes les tables : \`restaurant_id TEXT NOT NULL\` (ADR 0005)

**Triggers :**
- \`on_order_validated\` : calcule les 3 couches et insère dans \`pending_rewards\`
- \`on_round_reached_change\` : met à jour \`round_advanced_at = NOW()\`
- \`on_team_change\` : migre \`total_spent\` du membre entre équipes (ADR 0001)

Bucket Supabase Storage \`receipts\` (privé) si non existant. Seeds : 32 équipes + community_scores + paliers par défaut.

## Acceptance criteria

- [ ] Toutes les nouvelles tables existent avec types et contraintes corrects
- [ ] \`order_number\` a une contrainte \`UNIQUE\` et remplace l'ancien \`duplicate_key\`
- [ ] \`restaurant_id TEXT NOT NULL\` sur toutes les tables
- [ ] Trigger \`on_order_validated\` insère dans \`pending_rewards\` avec les 3 items séparés
- [ ] Trigger \`on_round_reached_change\` met à jour \`round_advanced_at\` automatiquement
- [ ] Trigger \`on_team_change\` migre correctement \`total_spent\` entre équipes
- [ ] Bucket \`receipts\` est privé
- [ ] Seeds présents : 32 équipes, community_scores, paliers par défaut
- [ ] Migration testée en local et sur Supabase

## Blocked by

None — peut démarrer immédiatement.")")
echo "✅ Issue #$I1 — Migrations schéma"

# ─────────────────────────────────────────────
# ISSUE 2 — Google & Facebook OAuth (aucun bloquant)
# ─────────────────────────────────────────────
I2=$(num "$(gh issue create --repo "$REPO" --label "$LABELS" \
  --title "[WCL] Google & Facebook OAuth — débloquer les boutons existants" \
  --body "## What to build

Les boutons Google et Facebook OAuth sont déjà présents sur le frontend mais ne fonctionnent pas. Cette slice configure les providers Supabase et valide le flow end-to-end.

**Ce qui manque :**
1. Google Cloud Console → OAuth 2.0 Client ID → URI de redirection : \`https://[project].supabase.co/auth/v1/callback\`
2. Supabase Dashboard → Authentication → Providers → Google → Client ID + Secret
3. Meta Developer Console → Facebook Login → même URI de redirection
4. Supabase Dashboard → Authentication → Providers → Facebook → App ID + Secret
5. Vérifier que le frontend appelle bien \`supabase.auth.signInWithOAuth({ provider: 'google' })\` et \`provider: 'facebook'\`

Le code Next.js ne doit pas changer — uniquement la configuration Supabase et les consoles OAuth.

## Acceptance criteria

- [ ] Bouton Google redirige vers Google OAuth et crée un profil Supabase au retour
- [ ] Bouton Facebook redirige vers Facebook OAuth et crée un profil Supabase au retour
- [ ] Le trigger \`handle_new_user\` crée bien l'entrée dans \`profiles\` après OAuth
- [ ] Le membre est redirigé vers le choix d'équipe s'il n'en a pas encore
- [ ] Testé sur mobile (le flow OAuth doit fonctionner en webview)

## Blocked by

None — peut démarrer immédiatement.")")
echo "✅ Issue #$I2 — Google & Facebook OAuth"

# ─────────────────────────────────────────────
# ISSUE 3 — Auto-validation OCR + Bestelnummer (bloqué par #1)
# ─────────────────────────────────────────────
I3=$(num "$(gh issue create --repo "$REPO" --label "$LABELS" \
  --title "[WCL] Auto-validation tickets — OCR, Bestelnummer, détection header (ADR 0008)" \
  --body "## What to build

Pipeline complet de validation automatique des tickets de caisse. Le membre photographie son ticket dans l'app, le serveur valide sans intervention humaine dans 95% des cas.

**Pipeline de validation (dans l'ordre) :**
1. Photo uploadée dans bucket \`receipts\` (Supabase Storage privé)
2. OCR Google Vision API → détecter le header restaurant (\`NEXT_PUBLIC_RESTAURANT_NAME\`, ex. \"Belchicken Houba\") — rejet si absent (ticket caissier/cuisine)
3. OCR extrait le Bestelnummer (format \`YYYY-MM-DD/NNN/NNNNN\`) — flag admin si illisible
4. OCR extrait le montant — flag admin si écart > 5% avec montant déclaré
5. Vérification \`order_number\` absent de la base (anti-doublon)
6. Montant entre €8 et €200
7. Si tout OK → \`status = 'validated'\` immédiatement
8. Délai artificiel 3–5 secondes côté client avec message \"Vérification en cours...\"
9. Affichage \"✅ Ticket vérifié\" — jamais le mot \"automatique\"

**Cas suspects → \`status = 'pending'\` :**
- Montant > €200
- Confiance OCR < 70%
- 3+ commandes le même jour même membre
- Header restaurant absent
- Écart montant > 5%

Variable d'env : \`AUTO_VALIDATE=false\` désactive l'auto-validation en dev.

## Acceptance criteria

- [ ] Un ticket client valide est auto-validé en < 6 secondes (délai artificiel inclus)
- [ ] Un ticket caissier/cuisine (sans header) est rejeté avec message explicatif
- [ ] Le Bestelnummer est stocké dans \`order_number\` avec contrainte UNIQUE
- [ ] La soumission d'un Bestelnummer déjà en base est rejetée silencieusement
- [ ] Les cas suspects apparaissent dans la file admin (\`/admin/orders\`)
- [ ] \`AUTO_VALIDATE=false\` fait passer toutes les commandes en pending
- [ ] La photo reste accessible aux admins pour litige même après auto-validation

## Blocked by

- #$I1")")
echo "✅ Issue #$I3 — Auto-validation OCR"

# ─────────────────────────────────────────────
# ISSUE 4 — Système récompenses 3 couches (bloqué par #1)
# ─────────────────────────────────────────────
I4=$(num "$(gh issue create --repo "$REPO" --label "$LABELS" \
  --title "[WCL] Système de récompenses 3 couches — pending_rewards (ADR 0006)" \
  --body "## What to build

À chaque validation de commande, calculer les 3 couches de récompenses et insérer dans \`pending_rewards\`. Interface admin pour marquer les récompenses comme récupérées au comptoir.

**Couche 1 — Palier solo (toujours présent, non soumis au double verrou) :**
- < €15 → aucune récompense solo (comptabilisé pour le score communautaire)
- €15–24 → Churros 6 pcs
- €25–39 → Finest burger
- €40–59 → Menu 4 Tenders
- €60+ → Chef's Combo

**Couche 2 — Bonus communautaire (soumis au double verrou) :**
- < 1 000 pts → rien
- 1 000–2 999 → +Frites Medium
- 3 000–5 999 → +Churros 12 pcs
- 6 000–9 999 → +Finest burger
- 10 000+ → +Menu 4 Tenders

**Couche 3 — Récompense d'avancement (non soumise au double verrou) :**
- Huitièmes → +Churros 6 pcs
- Quarts → +Finest burger
- Demi-finale → +Menu 4 Tenders
- Finale → +Chef's Combo

**Interface admin (/admin/pending-rewards) :** liste des récompenses par membre, bouton \"Marquer comme récupéré\" → \`redeemed_at = NOW()\`.

## Acceptance criteria

- [ ] Chaque commande validée génère exactement une ligne dans \`pending_rewards\`
- [ ] Les 3 items sont correctement calculés et stockés séparément (\`solo_item\`, \`community_item\`, \`advancement_item\`)
- [ ] Le bonus communautaire est NULL si le double verrou n'est pas satisfait
- [ ] La récompense d'avancement est NULL si l'équipe est éliminée
- [ ] Une commande < €15 génère \`solo_item = NULL\` mais est quand même insérée (pour le score)
- [ ] L'admin peut marquer une récompense comme récupérée depuis /admin/pending-rewards
- [ ] La récompense apparaît dans le dashboard membre dès la validation

## Blocked by

- #$I1")")
echo "✅ Issue #$I4 — Récompenses 3 couches"

# ─────────────────────────────────────────────
# ISSUE 5 — Dashboard hero card + gamification (bloqué par #4)
# ─────────────────────────────────────────────
I5=$(num "$(gh issue create --repo "$REPO" --label "$LABELS" \
  --title "[WCL] Dashboard hero card + gamification (ADR 0010)" \
  --body "## What to build

Refonte du dashboard membre autour de la question : \"Qu'est-ce que je gagne si je commande ce soir ?\". Une seule fonction serveur \`getDashboardData()\` alimente toutes les sections. Rafraîchissement SWR toutes les 30s.

**Section 1 — Hero card (priorité maximale)**
Aperçu de la récompense totale (couches 1+2+3) pour une commande type. Chaque ligne porte un label expliquant son origine. Fallback si pas d'historique : prévisualisation pour €25.
- Ne jamais afficher le bonus communautaire si double verrou non satisfait
- Ne jamais afficher le bonus d'avancement si équipe éliminée
- Jamais le mot \"automatique\" ou \"instantané\"

**Section 2 — Community progress card**
Score en points (jamais en euros) + barre de progression + conséquence concrète du prochain palier (\"À 1 500 pts du prochain bonus : +Menu 4 Tenders\"). Message d'activation si communauté faible.

**Section 3 — World Cup card**
Chemin du tournoi avec position actuelle. Phrase : \"Tant que [équipe] avance, ton bonus d'avancement reste actif.\" Alerte + CTA transfert si équipe éliminée.

**Section 4 — Stats personnelles (discret)**
Commandes validées · €X dépensés · récompenses récupérées. Les euros sont autorisés ici (dépenses personnelles du membre, voir ADR 0007).

**Principe : conséquences, pas chiffres.** Jamais \"Score : 8 500\" seul — toujours \"À 1 500 pts du prochain bonus\".

## Acceptance criteria

- [ ] La hero card affiche les 3 couches avec labels corrects
- [ ] Le fallback €25 s'affiche si le membre n'a aucune commande validée
- [ ] La community progress card affiche le prochain palier avec l'article concret
- [ ] La World Cup card affiche le bon tour atteint avec ✅ sur chaque étape passée
- [ ] L'état \"équipe éliminée\" affiche le CTA transfert et masque le bonus d'avancement
- [ ] L'état \"communauté faible\" affiche le CTA parrainage WhatsApp
- [ ] Le score communautaire est affiché en \`pts\`, jamais en \`€\`
- [ ] SWR rafraîchit toutes les 30s sans rechargement complet de la page
- [ ] La route \`/api/dashboard\` n'expose jamais \`target_revenue\`, \`current_revenue\`, \`is_unlocked\`

## Blocked by

- #$I4")")
echo "✅ Issue #$I5 — Dashboard hero card"

# ─────────────────────────────────────────────
# ISSUE 6 — Liens de parrainage WhatsApp (bloqué par #1)
# ─────────────────────────────────────────────
I6=$(num "$(gh issue create --repo "$REPO" --label "$LABELS" \
  --title "[WCL] Liens de parrainage WhatsApp — referral_links + wa.me" \
  --body "## What to build

Système de parrainage basé sur un lien unique par membre partagé via WhatsApp. Aucune API WhatsApp nécessaire — uniquement le schéma universel \`wa.me/?text=...\`. Le jeton parrainage est crédité uniquement quand l'ami complète son inscription.

**Flux complet :**
1. Membre va dans \"Inviter des amis\" → son lien unique s'affiche (\`/join?ref=K7X2P9\`)
2. Bouton \"Partager sur WhatsApp\" → ouvre WhatsApp avec message pré-rempli via \`wa.me/?text=...\`
3. L'ami clique le lien → la landing \`/join?ref=K7X2P9\` stocke le code en session
4. L'ami s'inscrit → insertion dans \`referrals\` (lien referrer → referee)
5. Le champ \`referee_id UNIQUE\` garantit qu'un ami ne compte que pour un seul parrain
6. Tous les 5 \`referrals\` validés → 1 jeton parrainage crédité au parrain
7. Tableau de bord parrainage : X clics · Y inscrits · Z/5 pour le prochain jeton

**Tables :**
- \`referral_links\` : \`code TEXT UNIQUE\`, \`user_id\`, \`restaurant_id\`, \`clicks INT\`, \`conversions INT\`
- \`referrals\` : \`referrer_id\`, \`referee_id UNIQUE\`, \`referral_code\`, \`restaurant_id\`

Générer le code via \`nanoid(6)\` ou équivalent. Le jeton parrainage est calculé à l'affichage (conversions ÷ 5), non stocké.

## Acceptance criteria

- [ ] Chaque membre a exactement un lien de parrainage actif par établissement
- [ ] Le bouton WhatsApp ouvre WhatsApp avec le message et le lien pré-remplis
- [ ] \`referral_links.clicks\` s'incrémente à chaque clic sur le lien
- [ ] \`referrals\` reçoit une ligne quand l'ami complète son inscription
- [ ] Un ami déjà inscrit ne peut pas être parrainé une deuxième fois (\`referee_id UNIQUE\`)
- [ ] Le jeton parrainage est calculé à l'affichage : \`FLOOR(conversions / 5)\`
- [ ] La barre de progression \"X/5 pour ton prochain jeton\" est visible sur le dashboard

## Blocked by

- #$I1")")
echo "✅ Issue #$I6 — Parrainage WhatsApp"

# ─────────────────────────────────────────────
# ISSUE 7 — Notifications d'incitation communautaire (bloqué par #1, #5)
# ─────────────────────────────────────────────
I7=$(num "$(gh issue create --repo "$REPO" --label "$LABELS" \
  --title "[WCL] Notifications d'incitation communautaire — 4 triggers, anti-spam (ADR 0009)" \
  --body "## What to build

Job cron (Supabase Edge Function, toutes les 30 min) qui évalue 4 triggers et envoie des notifications proactives aux membres avec le cadeau concret qu'ils obtiendraient en commandant maintenant. Toujours spécifique — jamais générique.

**4 triggers (par ordre de priorité) :**
1. **tier_upgrade** (haute) : la communauté vient de dépasser un seuil de score → notifier tous les membres actifs
2. **advancement** (haute) : l'admin vient de valider le passage d'un tour → notifier tous les membres actifs de l'équipe
3. **member_inactive** (moyenne) : membre inactif 72h+ ET score de son équipe a augmenté d'au moins 500 pts absolus depuis sa dernière commande
4. **tier_approaching** (moyenne) : communauté à moins de 10% du prochain seuil

**Règles anti-spam :**
- 48h minimum entre deux notifications au même membre
- Membre ayant commandé il y a < 6h → pas de notification
- Max 3 notifications/semaine par membre tous triggers confondus
- Triggers 1 et 2 ont priorité sur 3 et 4

**Canaux (par ordre) :**
1. PWA push (gratuit) — si permission accordée
2. WhatsApp Business API Meta directe (sans Twilio) — \`fetch\` vers \`graph.facebook.com/v19.0/\` — ~€0,05/conversation
3. In-app — toujours affiché à l'ouverture de l'app

Le message mentionne toujours le cadeau concret calculé via la même logique que \`pending_rewards\`.

## Acceptance criteria

- [ ] Le job cron tourne toutes les 30 min et évalue les 4 triggers
- [ ] \`profiles.last_notified_at\` est mis à jour après chaque envoi
- [ ] L'anti-spam 48h empêche les doublons
- [ ] Le message contient le vrai cadeau calculé pour ce membre (pas un texte générique)
- [ ] Le canal PWA est tenté en priorité, WhatsApp en fallback
- [ ] Toutes les notifications sont loguées dans \`notification_log\`
- [ ] La variable \`WHATSAPP_PHONE_NUMBER_ID\` + \`WHATSAPP_TOKEN\` configurées par déploiement

## Blocked by

- #$I1
- #$I5")")
echo "✅ Issue #$I7 — Notifications d'incitation"

# ─────────────────────────────────────────────
# ISSUE 8 — Interface admin commandes suspectes (bloqué par #3)
# ─────────────────────────────────────────────
I8=$(num "$(gh issue create --repo "$REPO" --label "$LABELS" \
  --title "[WCL] Interface admin commandes suspectes — swipe mobile, < 2h SLA" \
  --body "## What to build

Interface mobile-first pour traiter les commandes flaggées par l'auto-validation (status = 'pending'). Objectif : chaque commande suspecte est traitée en moins de 2h pendant les heures d'ouverture.

**Commandes flaggées (depuis ADR 0008) :**
- Montant > €200
- Confiance OCR < 70% ou Bestelnummer illisible
- 3+ commandes le même jour même membre
- Écart montant déclaré vs OCR > 5%
- Header restaurant absent de la photo

**Interface /admin/orders :**
- Liste des commandes pending triée par ancienneté
- Pour chaque commande : photo du ticket (full-screen tap), montant déclaré, montant OCR, Bestelnummer extrait, profil membre
- Swipe droite → valider → déclenche le calcul \`pending_rewards\` et mise à jour score communautaire
- Swipe gauche → rejeter → raison obligatoire (liste déroulante + champ libre)
- Notification automatique au membre après validation ou rejet
- Indicateur visuel si délai > 2h depuis soumission

**Validation en batch :** sélection multiple pour valider plusieurs commandes similaires d'un coup.

## Acceptance criteria

- [ ] Les commandes suspectes sont visibles dans /admin/orders et triées par ancienneté
- [ ] La photo du ticket s'affiche en plein écran au tap
- [ ] Swipe droite valide et déclenche le trigger \`on_order_validated\` (pending_rewards)
- [ ] Swipe gauche rejette avec raison obligatoire
- [ ] Le membre reçoit une notification (push ou in-app) après validation ou rejet
- [ ] Les commandes > 2h d'attente sont visuellement signalées
- [ ] La validation en batch fonctionne pour plusieurs commandes sélectionnées
- [ ] L'interface est utilisable sur mobile (écran 375px)

## Blocked by

- #$I3")")
echo "✅ Issue #$I8 — Interface admin"

# ─────────────────────────────────────────────
# ISSUE 9 — PWA + polish mobile (bloqué par tous)
# ─────────────────────────────────────────────
I9=$(num "$(gh issue create --repo "$REPO" --label "$LABELS" \
  --title "[WCL] PWA + polish mobile — manifest, push permissions, responsive" \
  --body "## What to build

Dernière slice : transformer l'app en PWA installable, activer les push notifications, auditer le responsive mobile, et finaliser les meta tags pour le partage WhatsApp des liens de parrainage.

**PWA :**
- \`manifest.json\` : nom, icônes, couleurs Belchicken, \`display: standalone\`
- Service worker pour cache offline (pages statiques + dashboard)
- Bannière d'installation sur mobile (\"Ajouter à l'écran d'accueil\")

**Push notifications :**
- Demande de permission au bon moment (après la première commande validée, pas au chargement)
- Enregistrement du \`pushSubscription\` dans \`profiles\`
- Canal prioritaire pour les notifications d'incitation (ADR 0009)

**Meta tags Open Graph :**
- Pour les liens \`/join?ref=CODE\` partagés sur WhatsApp : preview avec image Belchicken, titre accrocheur
- Balises \`og:title\`, \`og:description\`, \`og:image\` sur les pages publiques

**Audit responsive :**
- Vérification sur 375px (iPhone SE), 390px (iPhone 14), 412px (Android standard)
- Hero card lisible en < 2s sur petit écran
- Formulaire de soumission de commande utilisable sans zoom

## Acceptance criteria

- [ ] L'app est installable sur iOS et Android (manifest valide)
- [ ] Le service worker met en cache le dashboard pour une utilisation offline partielle
- [ ] La demande de permission push s'affiche après la première commande validée
- [ ] Les push notifications arrivent via le bon canal (PWA d'abord, WhatsApp en fallback)
- [ ] Les liens de parrainage affichent une preview correcte sur WhatsApp
- [ ] L'interface est utilisable sans scroll horizontal sur 375px
- [ ] La hero card affiche 3 lignes maximum sur petit écran sans troncature
- [ ] Lighthouse PWA score ≥ 90

## Blocked by

- #$I1 #$I2 #$I3 #$I4 #$I5 #$I6 #$I7 #$I8")")
echo "✅ Issue #$I9 — PWA + polish"

echo ""
echo "🎉 9 issues créées avec succès !"
echo "Issues : #$I1 #$I2 #$I3 #$I4 #$I5 #$I6 #$I7 #$I8 #$I9"
echo "Voir : https://github.com/$REPO/issues"
