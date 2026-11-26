// Les écrans sans carte : elle charge, la commande est fermée pour ce restaurant, ou la carte ne s'affiche pas.

export function LoadingScreen() {
  return <main className="mx-auto max-w-2xl space-y-3 p-4">{[1, 2, 3].map((i) => <div key={i} className="h-20 animate-pulse rounded-xl border border-paper-border bg-white" />)}</main>;
}

export function ClosedScreen() {
  return <main className="mx-auto max-w-2xl p-4"><p className="text-[17px] text-ink">La commande en ligne n&apos;est pas ouverte pour ce restaurant.</p></main>;
}

export function ErrorScreen() {
  return <main className="mx-auto max-w-2xl p-4"><p role="alert" className="text-[17px] text-danger">Impossible d&apos;afficher la carte pour le moment. Recharge la page, ou appelle le restaurant.</p></main>;
}
