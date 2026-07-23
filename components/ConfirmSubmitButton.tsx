"use client";

// Bouton de soumission avec confirmation — pour les actions destructrices
// dans les <form action={serverAction}> (audit 2026-07-23 : Rejeter /
// Désactiver un établissement se déclenchaient en un clic).
export function ConfirmSubmitButton({
  confirmMessage,
  className,
  children,
}: {
  confirmMessage: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <button
      type="submit"
      className={className}
      onClick={(e) => {
        if (!window.confirm(confirmMessage)) e.preventDefault();
      }}
    >
      {children}
    </button>
  );
}
