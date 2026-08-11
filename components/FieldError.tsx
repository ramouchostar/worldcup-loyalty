/**
 * Erreur de formulaire rattachée au champ (audit UX 2026-08-11, sprint 2) :
 * message à côté du champ fautif, icône + couleur (jamais la couleur seule),
 * annoncé aux lecteurs d'écran. À relier à l'input via
 * aria-describedby={id} + aria-invalid, et une bordure rouge sur le champ.
 */
export function FieldError({ id, message }: { id: string; message?: string | null }) {
  if (!message) return null;
  return (
    <p id={id} role="alert" className="mt-1.5 flex items-start gap-1.5 text-sm font-medium text-red-700">
      <span aria-hidden="true">⚠</span>
      <span>{message}</span>
    </p>
  );
}
