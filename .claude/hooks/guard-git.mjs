#!/usr/bin/env node
// Hook PreToolUse (Bash) — garde-fou git partagé (CLAUDE.md § Collaboration).
// Bloque AVANT exécution, avec un message pédagogique :
//   - tout `git push` vers master/main (direct ou branche courante = master)
//   - tout push forcé (--force, -f, --force-with-lease)
//   - les commandes destructrices : reset --hard, clean -f, branch -D,
//     checkout . / restore .
// Double filet avec la protection de branche GitHub (qui, elle, rejette sans
// expliquer). Node plutôt que bash+jq : identique sous Windows, mac, Linux et
// dans les sessions cloud. Toujours fail-open en cas de doute (exit 0).
import { execSync } from "node:child_process";

let input = "";
process.stdin.setEncoding("utf8");
process.stdin.on("data", (c) => (input += c));
process.stdin.on("end", () => {
  let cmd = "";
  try {
    // BOM UTF-8 possible si le JSON transite par un pipe PowerShell (tests
    // manuels sous Windows) — Claude Code n'en envoie pas, mais on blinde.
    cmd = String(JSON.parse(input.replace(/^FEFF/, ""))?.tool_input?.command ?? "");
  } catch {
    process.exit(0);
  }
  if (!/\bgit\b/.test(cmd)) process.exit(0);

  const block = (why, fix) => {
    process.stderr.write(
      `BLOQUÉ par .claude/hooks/guard-git.mjs — ${why}\n→ ${fix}\n(Règle CLAUDE.md § Collaboration. Ce garde-fou s'applique aux deux associés et à tous les agents.)\n`
    );
    process.exit(2);
  };

  const destructive = [
    [/git\s+reset\s+--hard/, "reset --hard détruit le travail non commité"],
    [/git\s+clean\s+-[a-zA-Z]*f/, "clean -f supprime des fichiers non suivis"],
    [/git\s+branch\s+-D\b/, "branch -D supprime sans vérifier la fusion"],
    [/git\s+(checkout|restore)\s+\.(\s|$)/, "checkout/restore . écrase toutes les modifications locales"],
  ];
  for (const [re, why] of destructive) {
    if (re.test(cmd)) block(why, "Fais-le à la main si c'est vraiment voulu — l'agent n'a pas cette autorité.");
  }

  if (/git\s+push\b/.test(cmd)) {
    if (/--force(-with-lease)?\b|(^|\s)-f(\s|$)/.test(cmd)) {
      block("push forcé interdit (master est protégé, l'historique des autres en dépend)", "Rebase puis push normal sur TA branche.");
    }
    const targetsMaster = /\b(master|main)\b/.test(cmd.replace(/origin\/(master|main)/g, ""));
    let onMaster = false;
    if (!targetsMaster && !/\s\S+\s+\S+/.test(cmd.replace(/git\s+push\s*/, "").replace(/\s+-u\s*/, " "))) {
      // `git push` / `git push origin` sans refspec → pousse la branche courante
      try {
        onMaster = /^(master|main)$/.test(execSync("git rev-parse --abbrev-ref HEAD", { encoding: "utf8" }).trim());
      } catch {}
    }
    if (targetsMaster || onMaster) {
      block(
        "push direct vers master interdit",
        "Branche `claude/<sujet>` → commit → `git push -u origin <branche>` → `gh pr create` → CI vert → `gh pr merge --merge --delete-branch`. Raccourci : /ship."
      );
    }
  }
  process.exit(0);
});
