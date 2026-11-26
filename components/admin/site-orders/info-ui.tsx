import Link from "next/link";
import { ArrowRight } from "@/components/icons";

// ADR 0109 §3 — ce que partagent « Infos de ma page » et « Mes horaires » : le retour et les boutons (couleurs de la console,
// ADR 0054).

const btn = "inline-flex min-h-[48px] items-center justify-center rounded-lg px-4 py-2 text-[15px] font-semibold focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink disabled:cursor-not-allowed disabled:opacity-50";
export const primaryButton = `${btn} bg-boost-olive text-white hover:bg-boost-olive-dark`;
export const ghostButton = `${btn} border border-ink-faint bg-white text-ink hover:border-ink`;
export const textLink = "inline-flex min-h-[44px] items-center text-[15px] font-semibold text-boost-olive-dark underline-offset-2 hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-ink disabled:opacity-50";
export const textField = "block min-h-[48px] w-full min-w-0 rounded-lg border border-ink-faint bg-white px-3 py-2 text-[15px] text-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-ink";
export const checkBox = "h-[22px] w-[22px] shrink-0 accent-boost-olive-dark";

export function BackLink({ href, label }: { href: string; label: string }) {
  return (
    <Link href={href} className="inline-flex min-h-[44px] items-center gap-2 text-[15px] font-semibold text-boost-olive-dark focus-visible:outline focus-visible:outline-2 focus-visible:outline-ink">
      <ArrowRight className="h-5 w-5 rotate-180" aria-hidden="true" />
      {label}
    </Link>
  );
}
