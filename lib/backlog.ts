import { createAdminClient } from "./supabase";
import {
  BACKLOG_PEOPLE,
  clampScale,
  isMissingCoAssignationColumn,
  normalizeOwners,
  statusAfterValidation,
  type BacklogArea,
  type BacklogItem,
  type BacklogPerson,
  type BacklogStatus,
  type BacklogValidation,
} from "./backlog-model";

// ADR 0033 §3 — accès base du backlog plateforme. Table service-role only
// (m56) : donnée interne fondateurs, jamais lisible par la clé anon (m34).
// Rien de tout ça n'existe côté membre ni côté restaurateur.
//
// SERVEUR UNIQUEMENT. Le vocabulaire et le calcul de priorité vivent dans
// `lib/backlog-model.ts`, importable par le tableau côté client.

// `owner` (m56) reste lu et écrit en MIROIR de owners[0] : la co-attribution
// (migration 20260906-2225) vit dans `owners`, mais tant que la colonne
// héritée existe, la tenir à jour permet à un retour en arrière du code de
// retrouver l'attribution. Rien d'autre ne lit `owner`.
const COLUMNS_LEGACY =
  "id, title, details, area, status, impact, effort, owner, restaurant_id, due_date, created_by, created_at, updated_at, done_at";
const COLUMNS = `${COLUMNS_LEGACY}, owners, validations`;

type BacklogRow = Omit<BacklogItem, "owners" | "validations"> & {
  owner: string | null;
  owners?: string[] | null;
  validations?: Record<string, BacklogValidation> | null;
};

// Migration 20260906-2225 pas encore appliquée : le code doit rester tolérant
// à son absence (règle de collaboration — l'auteur de la PR l'applique à la
// fusion, le déploiement peut la précéder de quelques minutes). Le prédicat
// vit dans le modèle, pur et testé.
const isMissingColumn = isMissingCoAssignationColumn;

// Avant la migration, l'attribution est ce qu'elle a toujours été : une
// personne, aucune validation individuelle. La page fonctionne à l'identique.
function mapRow(row: BacklogRow): BacklogItem {
  const owners = normalizeOwners(row.owners?.length ? row.owners : [row.owner]);
  const { owner: _legacy, ...rest } = row;
  return { ...rest, owners, validations: row.validations ?? {} };
}

// Lecture fail-open : m56 pas encore appliquée → backlog vide, jamais un 500
// sur la console plateforme.
export async function listBacklog(): Promise<BacklogItem[]> {
  try {
    const admin = createAdminClient();
    const q = (columns: string) =>
      admin.from("platform_backlog").select(columns).order("created_at", { ascending: false });

    let res = await q(COLUMNS);
    if (isMissingColumn(res.error)) {
      console.warn("[backlog] colonnes owners/validations absentes — migration 20260906-2225 à appliquer.");
      res = await q(COLUMNS_LEGACY);
    }
    if (res.error) throw res.error;
    return ((res.data as unknown as BacklogRow[]) ?? []).map(mapRow);
  } catch (e) {
    console.error("[backlog] listBacklog failed:", (e as Error).message);
    return [];
  }
}

async function readItem(id: string): Promise<BacklogItem | null> {
  const admin = createAdminClient();
  const q = (columns: string) => admin.from("platform_backlog").select(columns).eq("id", id).maybeSingle();

  let res = await q(COLUMNS);
  if (isMissingColumn(res.error)) res = await q(COLUMNS_LEGACY);
  if (res.error) throw new Error(res.error.message);
  return res.data ? mapRow(res.data as unknown as BacklogRow) : null;
}

export type BacklogInput = {
  title: string;
  details?: string | null;
  area?: BacklogArea;
  status?: BacklogStatus;
  impact?: number;
  effort?: number;
  owners?: string[];
  restaurantId?: string | null;
  dueDate?: string | null;
  createdBy?: string | null;
};

// Écritures : l'erreur REMONTE (contrairement aux lectures). Ce sont des
// actions explicites — l'appelant doit pouvoir rapporter un échec plutôt que
// laisser croire que l'item est enregistré. Seule exception, le repli
// ci-dessous quand les colonnes de co-attribution manquent encore : on écrit
// alors la première personne dans `owner`, comme avant.
export async function createBacklogItem(input: BacklogInput): Promise<void> {
  const admin = createAdminClient();
  const owners = normalizeOwners(input.owners ?? []);
  const base = {
    title: input.title,
    details: input.details ?? null,
    area: input.area ?? "produit",
    status: input.status ?? "idee",
    impact: clampScale(input.impact),
    effort: clampScale(input.effort),
    owner: owners[0] ?? null,
    restaurant_id: input.restaurantId ?? null,
    due_date: input.dueDate ?? null,
    created_by: input.createdBy ?? null,
  };

  let { error } = await admin.from("platform_backlog").insert({ ...base, owners, validations: {} });
  if (isMissingColumn(error)) {
    ({ error } = await admin.from("platform_backlog").insert(base));
  }
  if (error) throw new Error(error.message);
}

export type BacklogPatch = Partial<
  Pick<BacklogItem, "title" | "details" | "area" | "status" | "impact" | "effort" | "due_date" | "owners" | "validations">
> & { restaurant_id?: string | null };

export async function updateBacklogItem(id: string, patch: BacklogPatch): Promise<void> {
  const admin = createAdminClient();
  const row: Record<string, unknown> = { ...patch, updated_at: new Date().toISOString() };
  if (patch.impact !== undefined) row.impact = clampScale(patch.impact);
  if (patch.effort !== undefined) row.effort = clampScale(patch.effort);
  if (patch.owners !== undefined) {
    const owners = normalizeOwners(patch.owners);
    row.owners = owners;
    row.owner = owners[0] ?? null; // miroir hérité (voir COLUMNS ci-dessus)
  }
  // done_at suit le statut dans les DEUX sens : rouvrir un item efface sa date
  // de clôture, sinon l'historique raconte une livraison qui n'a pas eu lieu.
  if (patch.status !== undefined) {
    row.done_at = patch.status === "fait" ? new Date().toISOString() : null;
  }

  let { error } = await admin.from("platform_backlog").update(row).eq("id", id);
  if (isMissingColumn(error)) {
    // Repli avant migration : l'attribution retombe sur une seule personne,
    // les validations individuelles sont simplement perdues — mieux qu'un
    // formulaire qui échoue.
    const { owners: _o, validations: _v, ...legacy } = row;
    ({ error } = await admin.from("platform_backlog").update(legacy).eq("id", id));
  }
  if (error) throw new Error(error.message);
}

export async function deleteBacklogItem(id: string): Promise<void> {
  const admin = createAdminClient();
  const { error } = await admin.from("platform_backlog").delete().eq("id", id);
  if (error) throw new Error(error.message);
}

/**
 * Ajoute ou retire une personne de l'attribution, puis recalcule le statut :
 * la dernière part validée clôt l'action, une part ajoutée la rouvre
 * (lib/backlog-model.ts, statusAfterValidation).
 *
 * La validation de la personne retirée n'est PAS effacée : la ré-attribuer
 * la restaure telle quelle, et une erreur de clic ne détruit pas une trace.
 */
export async function toggleBacklogAssignee(id: string, person: string): Promise<void> {
  const item = await readItem(id);
  if (!item) return;

  const removing = item.owners.includes(person);
  // En AJOUT, seuls les noms de la liste close : un POST forgé ne doit pas
  // pouvoir semer des noms arbitraires dans une colonne libre. En RETRAIT,
  // tout nom déjà attribué part — y compris un nom hérité d'avant la liste.
  if (!removing && !BACKLOG_PEOPLE.includes(person as BacklogPerson)) return;

  const owners = removing
    ? item.owners.filter((o) => o !== person)
    : normalizeOwners([...item.owners, person]);
  await updateBacklogItem(id, { owners, status: statusAfterValidation(item.status, owners, item.validations) });
}

export async function setBacklogOwners(id: string, owners: string[]): Promise<void> {
  const item = await readItem(id);
  if (!item) return;
  const next = normalizeOwners(owners);
  await updateBacklogItem(id, { owners: next, status: statusAfterValidation(item.status, next, item.validations) });
}

/**
 * « Fait » d'une personne sur sa propre part — et son annulation (re-clic).
 * L'action ne passe à « fait » que quand la dernière part manquante est
 * validée ; retirer une validation rouvre l'action.
 */
export async function toggleBacklogValidation(id: string, person: string, by: string | null): Promise<void> {
  const item = await readItem(id);
  if (!item) return;
  if (!item.owners.includes(person)) return; // on ne valide que ce qui est attribué

  const validations = { ...item.validations };
  if (validations[person]) delete validations[person];
  else validations[person] = { at: new Date().toISOString(), by };

  await updateBacklogItem(id, {
    validations,
    status: statusAfterValidation(item.status, item.owners, validations),
  });
}
