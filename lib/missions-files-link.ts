import { createAdminClient } from "./supabase";
import type { FileScope } from "./mission-files";

// Rattacher des pièces jointes déposées à leur objet (une idée de tournage, un tour de retouche). Fichier à part :
// les idées et les retouches l'appellent, et lib/missions-files.ts lit l'état des idées — pas de dépendance circulaire.

/** Seuls les fichiers CONFIRMÉS, de CE dépositaire, non encore rattachés, de CETTE portée et de CETTE mission. */
export async function linkFiles(missionId: string, scope: FileScope, uploadedBy: "restaurant" | "provider", ids: readonly string[], ref: string): Promise<number> {
  if (ids.length === 0) return 0;
  try {
    const { data, error } = await createAdminClient()
      .from("mission_attachments")
      .update({ ref })
      .eq("mission_id", missionId)
      .eq("scope", scope)
      .eq("uploaded_by", uploadedBy)
      .in("id", [...ids])
      .is("ref", null)
      .not("confirmed_at", "is", null)
      .select("id");
    if (error) throw error;
    return data?.length ?? 0;
  } catch (e) {
    console.error("[missions-files-link] linkFiles failed:", (e as Error).message);
    return 0;
  }
}
