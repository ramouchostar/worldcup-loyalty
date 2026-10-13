import type { Rule } from "@/lib/mission-rules";

// Les règles du jeu (ADR 0084 §3), en lecture : un titre court et une phrase, dans les mots de celui qui les lit.

export function RulesList({ rules }: { rules: readonly Rule[] }) {
  return (
    <ol className="space-y-3">
      {rules.map((r, i) => (
        <li key={r.title} className="flex gap-3">
          <span aria-hidden className="mt-0.5 w-6 h-6 shrink-0 rounded-full bg-boost-cream border border-boost-olive/30 text-[12px] font-bold text-ink flex items-center justify-center">
            {i + 1}
          </span>
          <div>
            <p className="text-[14px] font-semibold text-ink">{r.title}</p>
            <p className="text-[13.5px] text-ink-muted">{r.text}</p>
          </div>
        </li>
      ))}
    </ol>
  );
}
