import { contentFingerprint, type FingerprintLine } from "./receipt-fingerprint";
import { detectDuplicate, type DuplicateVerdict } from "./duplicate-detection";

// ============================================================
// Audit rétroactif des doublons — phase C.
//
// Rejoue la logique de dédoublonnage sur l'historique des commandes validées,
// dans l'ordre chronologique : chaque commande est confrontée à celles qui la
// PRÉCÈDENT, exactement comme l'aurait fait la soumission en temps réel.
//
// Module PUR : il reçoit les lignes, il rend des constats et un rapport. Aucune
// lecture, aucune écriture — c'est ce qui le rend testable, et c'est aussi ce
// qui garantit qu'un audit ne peut pas modifier un solde par accident.
// scripts/audit-doublons.mjs se charge des entrées/sorties.
// ============================================================

export type AuditOrder = {
  id: string;
  restaurant_id: string;
  user_id: string;
  amount: number;
  order_date: string;
  order_time: string | null;
  order_number: string | null;
  submitted_at: string;
};

export type AuditFinding = {
  restaurantId: string;
  order: AuditOrder;
  matched: AuditOrder | null;
  verdict: DuplicateVerdict;
  items: FingerprintLine[];
};

/**
 * Rejeu chronologique. `itemsByOrder` peut être incomplet : une commande sans
 * ligne d'article produit une empreinte faible, que le moteur traite déjà
 * comme telle (elle ne suffit jamais à accuser deux membres différents).
 *
 * Le hachage perceptuel n'est jamais fourni ici : les images de plus de
 * 30 jours ont été effacées (ADR 0036). L'audit est donc CONSERVATEUR — il
 * peut manquer des doublons, il n'en invente pas.
 */
export function replayDuplicates(
  orders: AuditOrder[],
  itemsByOrder: Map<string, FingerprintLine[]>
): AuditFinding[] {
  const parResto = new Map<string, AuditOrder[]>();
  for (const o of orders) {
    const list = parResto.get(o.restaurant_id) ?? [];
    list.push(o);
    parResto.set(o.restaurant_id, list);
  }

  const findings: AuditFinding[] = [];

  for (const [restaurantId, list] of parResto) {
    const chronologique = [...list].sort((a, b) => a.submitted_at.localeCompare(b.submitted_at));
    const parId = new Map(chronologique.map((o) => [o.id, o]));
    const vues: { order: AuditOrder; fingerprint: string }[] = [];

    for (const order of chronologique) {
      const items = itemsByOrder.get(order.id) ?? [];
      const fingerprint = contentFingerprint({
        restaurantId,
        amount: order.amount,
        items,
      });

      const verdict = detectDuplicate(
        {
          userId: order.user_id,
          orderDate: order.order_date,
          orderTime: order.order_time,
          amount: order.amount,
          orderNumber: order.order_number,
          fingerprint,
          imagePhash: null,
          submittedAt: order.submitted_at,
          items,
        },
        vues.map((v) => ({
          id: v.order.id,
          user_id: v.order.user_id,
          order_date: v.order.order_date,
          order_time: v.order.order_time,
          amount: v.order.amount,
          order_number: v.order.order_number,
          content_fingerprint: v.fingerprint,
          image_phash: null,
          submitted_at: v.order.submitted_at,
          items: itemsByOrder.get(v.order.id) ?? [],
        }))
      );

      if (verdict.decision !== "ok") {
        findings.push({
          restaurantId,
          order,
          matched: verdict.matchedOrderId ? parId.get(verdict.matchedOrderId) ?? null : null,
          verdict,
          items,
        });
      }

      vues.push({ order, fingerprint: fingerprint.hash });
    }
  }

  return findings;
}

// ── Rapport ─────────────────────────────────────────────────────────────────

export type AuditReportInput = {
  findings: AuditFinding[];
  ordersExamined: number;
  itemsByOrder: Map<string, FingerprintLine[]>;
  /** user_id → nom lisible. */
  memberById: Map<string, string>;
  since: string;
  restaurantId: string | null;
  /** YYYY-MM-DD HH:MM */
  generatedAt: string;
};

const euros = (n: number) => `${Number(n).toFixed(2).replace(".", ",")} €`;
// ADR 0021 : « mettre de côté » crédite floor(montant) points. C'est la mesure
// la plus parlante de ce qu'un doublon a coûté côté membre.
const points = (n: number) => Math.floor(Number(n));
const heure = (t: string | null) => (t ? String(t).slice(0, 5) : "—");

function articles(lines: FingerprintLine[]): string {
  if (lines.length === 0) return "_aucune ligne lue_";
  return lines.map((l) => `${l.quantity > 1 ? `${l.quantity}× ` : ""}${l.name}`).join(", ");
}

function cell(value: string | number): string {
  return String(value).replace(/\|/g, "\\|").replace(/\n/g, " ");
}

function table(rows: AuditFinding[], memberById: Map<string, string>): string {
  if (rows.length === 0) return "_Aucun._\n";
  const lines = [
    "| Membre | Date | Heure | Montant | Articles lus | N° soumis | N° déjà en base | Points crédités | Règle | Commandes |",
    "|---|---|---|---|---|---|---|---|---|---|",
  ];
  for (const f of rows) {
    lines.push(
      "| " +
        [
          memberById.get(f.order.user_id) ?? f.order.user_id.slice(0, 8),
          f.order.order_date,
          `${heure(f.order.order_time)}${f.matched ? ` vs ${heure(f.matched.order_time)}` : ""}`,
          euros(f.order.amount),
          articles(f.items),
          f.order.order_number ?? "—",
          f.matched?.order_number ?? "—",
          points(f.order.amount),
          `\`${f.verdict.rule}\``,
          `\`${f.order.id.slice(0, 8)}\` ← \`${(f.matched?.id ?? "?").slice(0, 8)}\``,
        ]
          .map(cell)
          .join(" | ") +
        " |"
    );
  }
  return lines.join("\n") + "\n";
}

/** Le rapport complet, en Markdown. */
export function buildAuditReport(input: AuditReportInput): string {
  const { findings, ordersExamined, memberById, since, restaurantId, generatedAt } = input;

  const certains = findings.filter((f) => f.verdict.decision === "duplicate");
  const aVerifier = findings.filter((f) => f.verdict.decision === "review");

  const parRegle = new Map<string, number>();
  for (const f of findings) {
    const rule = f.verdict.rule ?? "?";
    parRegle.set(rule, (parRegle.get(rule) ?? 0) + 1);
  }

  const pointsEnTrop = certains.reduce((s, f) => s + points(f.order.amount), 0);
  const eurosEnTrop = certains.reduce((s, f) => s + f.order.amount, 0);

  const regles =
    parRegle.size === 0
      ? ""
      : `Par règle déclenchée :\n\n${[...parRegle.entries()]
          .sort((a, b) => b[1] - a[1])
          .map(([r, n]) => `- \`${r}\` — ${n}`)
          .join("\n")}\n`;

  return `# Audit rétroactif des doublons

_Généré le ${generatedAt} par \`scripts/audit-doublons.mjs\`._
_Périmètre : commandes **validées** depuis le ${since}${
    restaurantId ? `, établissement \`${restaurantId}\`` : ", tous établissements"
  }._

> **Ce rapport ne modifie rien.** Aucun statut de commande, aucun score
> d'équipe, aucun solde de points n'a été touché. Les corrections proposées
> en §5 attendent une décision explicite.

## 1. Ce qui a été fait

La logique de dédoublonnage de la phase C (\`lib/duplicate-detection.ts\`) a été
rejouée sur l'historique, **dans l'ordre chronologique** : chaque commande est
confrontée à celles qui la précèdent, exactement comme l'aurait fait la
soumission en temps réel.

Trois des quatre signaux sont exploitables rétroactivement :

| Signal | Rejoué ? |
|---|---|
| Empreinte de contenu (resto + montant + lignes, heure à ±2 min) | ✅ |
| Numéro de commande, tolérant aux confusions OCR (0/8, 1/7, 3/8, 5/6, 6/8, 2/7) | ✅ |
| Même membre, même heure, même montant, moins de 24 h | ✅ |
| Hachage perceptuel de la photo | ❌ — les images de plus de 30 jours sont effacées (ADR 0036) |

L'absence du signal image rend cet audit **conservateur** : il peut manquer des
doublons dont l'OCR n'a lu ni les lignes, ni l'heure, ni un numéro comparable.
Il n'en invente pas.

## 2. Résumé

| | |
|---|---|
| Commandes validées examinées | **${ordersExamined}** |
| Doublons **certains** | **${certains.length}** |
| Cas **à vérifier** (ambigus) | **${aVerifier.length}** |
| Points crédités en trop (doublons certains) | **${pointsEnTrop}** |
| Dépense comptée en double dans les scores | **${euros(eurosEnTrop)}** |

${regles}
## 3. Doublons certains

Même membre, même ticket. La seconde commande n'aurait pas dû être créée.

${table(certains, memberById)}
## 4. Cas à vérifier

Trop ressemblants pour être ignorés, pas assez pour trancher sans regarder les
tickets. Le cas typique : deux membres qui commandent la même chose à la même
minute — parfaitement légitime au coup de feu du midi.

${table(aVerifier, memberById)}
## 5. Correction proposée — à valider avant toute exécution

Pour **chaque doublon certain** de la section 3 :

1. \`orders.status\` → \`rejected\`, \`rejection_reason\` = « Doublon confirmé —
   audit rétroactif du ${generatedAt.slice(0, 10)} ». La ligne est **conservée**
   (pièce comptable, ADR 0036 §3), jamais supprimée.
2. **Score communautaire** : \`community_scores\` se recalcule sur les commandes
   validées — repasser la commande en \`rejected\` retire mécaniquement sa
   dépense du score de l'équipe. À vérifier après coup plutôt qu'à recalculer
   à la main.
3. **Réserve de points** (ADR 0021) : si le cadeau de la commande en double a
   été **mis de côté**, \`point_transactions\` porte un crédit de
   \`floor(montant)\` points. Le ledger est append-only : la correction est une
   **écriture de compensation**, jamais une suppression.
4. **Cadeau déjà récupéré au comptoir** (\`pending_rewards.status = 'redeemed'\`) :
   **ne rien reprendre**. Le client a le produit en main ; le lui retirer coûte
   plus cher que le cadeau. À constater, pas à corriger.
5. **Budget cadeaux du mois** (ADR 0012) : \`reward_budget_tracking\` a compté le
   CA du doublon. À décrémenter pour que le plafond du mois reste juste.

Ordre recommandé : 1 → 2 (vérification) → 3 → 5. Le point 4 est une non-action
délibérée.

**Rien de tout cela n'est fait par le script d'audit.** Un second script, écrit
pour ça et rejouable, sera nécessaire — et seulement après accord explicite.

## 6. Limites

- Les commandes \`pending\` et \`rejected\` sont hors périmètre : elles n'ont rien
  crédité.
- Un doublon dont l'OCR n'a lu **ni ligne d'article, ni heure, ni numéro
  comparable** reste invisible : aucun des trois signaux rejouables ne
  s'accroche.
- Deux commandes réellement identiques du **même membre** à plus de 2 minutes
  d'intervalle sont tenues pour légitimes (il est repassé commander). C'est un
  choix assumé : l'inverse rejetterait des habitués.
`;
}
