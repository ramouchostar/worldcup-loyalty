import Link from "next/link";
import { ArrowRight } from "@/components/icons";

// Les classes et la barre de retour partagées par les écrans « articles » de la console (ADR 0111, charte ADR 0090).

const btn =
  "flex min-h-[48px] w-full items-center justify-center rounded-lg px-4 text-[15px] font-semibold focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink disabled:cursor-not-allowed";
export const primaryBtn = `${btn} bg-boost-olive text-white hover:bg-boost-olive-dark active:translate-y-px disabled:bg-paper-subtle disabled:text-ink-muted`;
export const ghostBtn = `${btn} border border-ink-faint bg-white text-ink hover:bg-paper-subtle active:translate-y-px disabled:opacity-50`;
export const linkBtn =
  "inline-flex min-h-[44px] items-center text-[15px] font-semibold text-boost-olive-dark underline hover:text-ink disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-ink";
export const inputCls =
  "block min-h-[48px] w-full min-w-0 rounded-lg border border-ink-faint bg-white px-3 py-2.5 text-[15px] text-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink";
export const labelCls = "mb-1 block text-[15px] font-semibold text-ink";

export function BackLink({ href, label }: { href: string; label: string }) {
  return (
    <Link href={href} className="inline-flex min-h-[44px] items-center gap-1.5 text-[15px] font-semibold text-ink hover:text-boost-olive-dark focus-visible:outline focus-visible:outline-2 focus-visible:outline-ink">
      <ArrowRight size={20} aria-hidden="true" className="rotate-180" />
      {label}
    </Link>
  );
}
