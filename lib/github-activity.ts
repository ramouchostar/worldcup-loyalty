// Activité GitHub pour les digests fondateurs (app/api/cron/founder-digest-*) —
// seul usage de ce module aujourd'hui. Lecture seule, aucune écriture.
//
// Fail-open comme lib/email.ts : sans GITHUB_TOKEN (à provisionner sur
// Vercel — voir .env.local.example), le digest part quand même, juste sans
// la section commits. Jamais une erreur qui casse le cron.

const GITHUB_REPO = "ramouchostar/worldcup-loyalty";
const GITHUB_API = "https://api.github.com";

export type CommitKind = "fix" | "feat" | "chore" | "other";

export type CommitInfo = {
  sha: string;
  message: string;
  author: string;
  date: string;
  kind: CommitKind;
};

const CHORE_TYPES = new Set(["chore", "docs", "refactor", "style", "test", "ci", "build", "perf"]);

// Convention déjà suivie par la quasi-totalité des commits du repo
// ("feat(platform): …", "fix(backlog): …") — sert à distinguer "bugs
// résolus" (fix) des "avancées" (feat) dans le récap hebdomadaire sans
// tenir de registre séparé.
function classify(message: string): CommitKind {
  const firstLine = message.split("\n")[0];
  const match = firstLine.match(/^(\w+)(\(.+\))?:/);
  if (!match) return "other";
  const type = match[1].toLowerCase();
  if (type === "fix") return "fix";
  if (type === "feat") return "feat";
  if (CHORE_TYPES.has(type)) return "chore";
  return "other";
}

// `master` uniquement — c'est ce qui est réellement en production, pas
// l'activité de branches de travail en cours. Plafonné à 100 (per_page max
// de l'API) : largement suffisant pour une fenêtre d'un jour ou d'une
// semaine à deux personnes ; pas de pagination au-delà, volontairement.
export async function fetchCommitsSince(sinceISO: string, untilISO?: string): Promise<CommitInfo[]> {
  const token = process.env.GITHUB_TOKEN;
  if (!token) {
    console.warn("[github-activity] GITHUB_TOKEN absent — section commits vide dans le digest.");
    return [];
  }

  try {
    const params = new URLSearchParams({ sha: "master", since: sinceISO, per_page: "100" });
    if (untilISO) params.set("until", untilISO);

    const res = await fetch(`${GITHUB_API}/repos/${GITHUB_REPO}/commits?${params.toString()}`, {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
      },
      cache: "no-store",
    });

    if (!res.ok) {
      console.error(`[github-activity] GitHub API a répondu ${res.status}`);
      return [];
    }

    const data = (await res.json()) as Array<{
      sha: string;
      commit: { message: string; author: { name: string; date: string } };
    }>;

    return data.map((c) => ({
      sha: c.sha,
      message: c.commit.message,
      author: c.commit.author?.name ?? "—",
      date: c.commit.author?.date ?? "",
      kind: classify(c.commit.message),
    }));
  } catch (err) {
    console.error("[github-activity] fetchCommitsSince threw:", err);
    return [];
  }
}
