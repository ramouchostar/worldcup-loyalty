// Sortie de secours d'un compte restaurateur (lib/view-mode.ts) : voir l'app
// comme un client, ou se déconnecter. Formulaires POST simples, utilisables
// depuis un composant serveur comme depuis l'app installée.
export function ModeButtons({ className = "" }: { className?: string }) {
  return (
    <div className={`flex flex-col gap-2 ${className}`}>
      <form action="/mode/client" method="POST">
        <button
          type="submit"
          className="w-full bg-gray-900 hover:bg-gray-800 text-white text-sm font-semibold px-4 py-3 rounded-xl transition-colors"
        >
          Voir l&apos;app comme un client
        </button>
      </form>
      <form action="/api/auth/logout" method="POST">
        <button
          type="submit"
          className="w-full text-sm font-semibold text-gray-600 hover:text-gray-900 border border-gray-200 px-4 py-3 rounded-xl transition-colors"
        >
          Se déconnecter
        </button>
      </form>
    </div>
  );
}
